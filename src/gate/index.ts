import { localizeGap } from '../change/gap-locale.ts'
import { withDeadline } from '../deadline.ts'
import { isGateControlPath } from '../protected-paths.ts'
/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T04).
 *
 * The gate integration: ONE Auto-style seam pair (`tools/pre-execute` +
 * a monotonic `tools.guard`) plus an approval-answerer router, layered on the
 * host's real settlement chain. The pipeline (verified live in T00):
 *
 *   createExecution → tools/pre-execute → serviceAsk (approval/request)
 *   → guardReason (deny-only) → dispatch
 *
 * Flow for a GATED session (the `second-look` preset):
 *   pre-execute  — recognize (T02) + classify: exempt ⇒ settle+allow;
 *                  review-class ⇒ run the tiered reviewer (T03) HERE, then
 *                  hand the closed decision to the answerer router.
 *   answerer     — allow ⇒ 'allowed-once' (real host settlement);
 *                  deny ⇒ 'rejected' + model-visible boundary text;
 *                  ask_user / failure ⇒ the HUMAN chain settles the same call,
 *                  once, with no re-review.
 *   guard        — passes ONLY a bound, settled, single-use allow
 *                  (token+tool+args+session+config); anything else is a deny
 *                  with named failing dimensions. It never overrides another
 *                  guard's rejection (host guards are monotonic deny-only).
 *
 * Subagent sessions (host approval policy locked `never`, verified T00 run10):
 *   the review runs in pre-execute as above; allow settles directly; anything
 *   needing a human is relayed to the parent session (best effort) and the
 *   call returns NOT EXECUTED with correlation info — never a silent grant.
 *
 * Non-gated sessions keep their NATIVE semantics: the gate stays passive and
 * never claims protection over them.
 */
import type { Context } from '@deepseek-ai/cordis'
import { createHash, randomUUID } from 'node:crypto'
import type { Session, SessionId } from '@deepseek-ai/dsh-session'
import { CallId } from '../call-id.ts'
import { RISK_ORDER, type ResolvedConfig } from '../config.ts'
import type { ReviewRequest } from '../review-types.ts'
import { isReviewFailure, redactReviewEvidence, type ReviewFailure } from '../review.ts'
import { HostLanguage, brand, text, failureText } from '../locale.ts'
import { DEFAULT_DENY_GUIDANCE } from '../config.ts'
import { runReviewWithEvidence } from '../evidence-loop.ts'
import { ReviewerChildren } from '../isolation.ts'
import { createNodeProbeFs } from '../evidence/node-fs.ts'
import { setUserSensitiveMarkers } from '../evidence/sensitive.ts'
import type { ProbeFileSystem } from '../evidence/probe.ts'
import { recognizeCall, originOf } from '../action/adapters.ts'
import { classifyAction, type Classification } from '../action/classify.ts'
import { inspectFileTarget, targetFromEvidence, type TargetFileSystem } from '../evidence/path-inspect.ts'
import type { ActionTarget, UnifiedAction } from '../action/types.ts'
import { effectiveReviewer, tierPromptVersion, type ReviewTier } from '../tier.ts'
import { argsDigest, SettlementMap, type DecidedBy, type ExecutionIdentity } from './settlement.ts'
import { shouldGate, presetForTier, tierFromPreset, type PermissionPresetsLike } from './preset.ts'
import { relayAskToParent, type AskRelayResult, type ParentAgentLike } from './ask-relay.ts'
import {
  collectFullBatch,
  boundBatchEvidence,
  collectGitDiff,
  createGitRunner,
  renderBatchSection,
  type BatchSnapshot,
  type GitRunner,
} from '../change/collect.ts'
import { BatchLedger } from '../change/batch.ts'
import { buildFinalizeTool } from '../change/finalize.ts'
import { DisclosureLedger } from '../privacy/disclosure.ts'
import { scanOutbound } from '../privacy/detect.ts'
import { createOutboundGuard, runInReviewScope, type OutboundDestination } from '../privacy/outbound.ts'
import { sessionEvents } from '../session-events.ts'
import { AuditLog, FileAuditPersistence, type AuditPersistence } from '../settings/audit.ts'
import { FileSettingsPersistence, defaultSettingsDir, type SettingsPersistence } from '../settings/persistence.ts'
import { SettingsStore, runtimeSettingsFromConfig, type RuntimeSettings } from '../settings/store.ts'
import { registerSettingsRoutes, type SettingsViewSources, type WebServerFace } from '../settings/http.ts'

/** The structural execution object crossing `tools/pre-execute` and `guard`. */
export interface ExecLike {
  readonly token: unknown
  readonly callId?: unknown
  readonly rootCallId?: unknown
  readonly name: string
  readonly arguments: unknown
  readonly agent?: AgentLike | undefined
  readonly signal?: AbortSignal | undefined
  /** Present on PTC inner dispatches (T00 run5/run6). */
  readonly parent?: unknown
}

/** The structural agent handle on an execution. */
export interface AgentLike {
  readonly id?: unknown
  readonly session?: Session | undefined
  readonly parentAgent?: ParentAgentLike | undefined
}

/** The structural approval request crossing `approval/request`. */
export interface ApprovalReqLike {
  readonly callId?: unknown
  readonly toolName: string
  readonly reason?: unknown
  readonly signal?: AbortSignal | undefined
  readonly agent?: AgentLike | undefined
}

/** What a `tools/pre-execute` listener may return. */
export type PreExecuteDecision = { readonly kind: 'allow' } | { readonly kind: 'ask'; readonly reason: string }

/** The closed approval outcomes the host settlement chain produces. */
export type ApprovalOutcomeLike = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'

/** Structural surface of the host `tools` service pieces the gate uses. */
export interface ToolsSeam {
  guard(checker: (exec: ExecLike) => string | undefined): () => void
  register?(tool: unknown): () => void
}

/** The event/tool seams the gate wires into (the host context, or a test bus). */
export interface GateSeamsLike {
  on(name: string, handler: (...args: never[]) => unknown, options?: unknown): () => void
  tools: ToolsSeam
  get(name: string): unknown
}

/** Injectable execution-side dependencies (tests supply fakes). */
export interface GateDeps {
  readonly fs?: ProbeFileSystem | undefined
  readonly targetFs?: TargetFileSystem<string> | undefined
  readonly seams?: GateSeamsLike | undefined
  /** Git surface for strict-tier batch collection (default: real `git`). */
  readonly git?: GitRunner | undefined
  /**
   * Durable settings-page persistence (INSTALL-REVIEW R2). Defaults to the
   * file store under `config.settingsDir` (else `$DSH_HOME/second-look`);
   * tests pass an in-memory store so they never touch the user's settings.
   */
  readonly settingsPersistence?: SettingsPersistence | undefined
  readonly auditPersistence?: AuditPersistence | undefined
}

/** How many file targets one action may have inspected (bounded work). */
const MAX_INSPECTED_TARGETS = 8

/** The gate's decision for one call, routed by the answerer. */
interface GateDecision {
  readonly kind: 'allow' | 'deny' | 'ask_user' | 'failed' | 'cancelled'
  readonly reason: string
  readonly question?: string
  readonly decidedBy: DecidedBy
}

/** Live status for the settings/status surface (T07). */
export interface GateStatus {
  readonly healthy: boolean
  readonly unhealthyReason?: string
  readonly pendingEntries: number
  readonly gateSessionsSeen: number
  readonly tiers: Readonly<Record<string, ReviewTier>>
  readonly configVersions: Readonly<Record<ReviewTier, string>>
  /** The configured default tier. */
  readonly defaultTier: ReviewTier
  /** Whether the host preset service is available (absent = no mode detection). */
  readonly presetService: string
  /** The live permission-preset roster (empty when unreadable). */
  readonly presetNames: readonly string[]
  /** The ACTUAL independent reviewer route ('unconfigured' fails closed). */
  readonly reviewer: string
  /** Batches not covered by a still-valid review (names). */
  readonly batchPending: readonly string[]
  /** Named coverage gaps (binary/over-budget/manual runs). */
  readonly batchGaps: readonly string[]
  readonly disclosures: number
  readonly outboundEvents: readonly string[]
  readonly auditDegraded: boolean
  readonly auditDegradedReason?: string
}

/** The mounted gate handle. */
export interface GateHandle {
  dispose(): void
  /** Switch one session's tier; invalidates that session's pending allows. */
  setTier(sessionId: string, tier: ReviewTier): void
  getTier(sessionId: string): ReviewTier
  status(): GateStatus
  /** The settlement ledger (tests/status). */
  readonly settlement: SettlementMap
  /** The disclosure ledger (tests/status/audit). */
  readonly disclosures: DisclosureLedger
  /** The decision audit log (T07). */
  readonly audit: AuditLog
  /** The runtime settings store (T07). */
  readonly settings: SettingsStore
}

/** Ledger key for one call: callId, or a token-derived key when absent (红队 §4a — callId-less calls must not share a slot). */
const anonymousCallKeys = new Map<unknown, string>()
export function callKeyOf(exec: { readonly callId?: unknown; readonly token: unknown }): string {
  const raw = String(exec.callId ?? '')
  if (raw !== '') return raw
  let key = anonymousCallKeys.get(exec.token)
  if (key === undefined) {
    key = `no-callid:${randomUUID()}`
    anonymousCallKeys.set(exec.token, key)
  }
  return key
}

/** Stable config-revision stamp: tier + reviewer route + policy surface (红队 §4c: a real sha256 digest, not a 32-bit hash). */
export function configVersionOf(config: ResolvedConfig, tier: ReviewTier): string {
  const settings = config.tiers[tier]
  const reviewer = effectiveReviewer(settings, config)
  const payload = JSON.stringify([
    tier,
    config.fallbackPolicy,
    config.toolsPolicy,
    config.riskRules.map(rule => [rule.pattern, rule.policy, rule.field]),
    [reviewer.reviewerModel, reviewer.reviewerModelProvider, reviewer.reviewerProvider, reviewer.reviewerPreset, reviewer.reviewerReasoningEffort],
    config.riskPolicy,
    config.argumentsMaxChars,
    tierPromptVersion(tier, settings),
    [settings.evidenceRounds, settings.totalTimeoutMs, settings.maxEvidenceItems, settings.maxEvidenceCharsPerItem],
  ])
  return `cfg-${createHash('sha256').update(payload).digest('hex').slice(0, 32)}`
}

/** Merge runtime settings back into a resolved config (new revision). */
function configWithSettings(base: ResolvedConfig, settings: RuntimeSettings): ResolvedConfig {
  return {
    ...base,
    reviewerModel: settings.reviewerModel,
    reviewerModelProvider: settings.reviewerModelProvider,
    reviewerReasoningEffort: settings.reviewerReasoningEffort,
    reviewerProvider: settings.reviewerProvider,
    reviewerPreset: settings.reviewerPreset,
    tiers: {
      defaultTier: settings.defaultTier,
      // Base tier FIELDS (guidance, promptVersion, subagent route) survive a
      // settings change: the runtime settings carry budgets + reviewer route
      // only (INSTALL-REVIEW R2 precedence: overrides merge over the loader
      // config — they never silently replace whole tier sections).
      daily: { ...base.tiers.daily, ...settings.daily },
      strict: {
        ...base.tiers.strict,
        ...settings.strict,
        reviewerModel: settings.strictReviewerModel,
        reviewerModelProvider: settings.strictReviewerModelProvider,
        reviewerReasoningEffort: settings.strictReviewerReasoningEffort,
      },
    },
  }
}

/**
 * Mount the gate. Wires pre-execute, the approval answerer router, the
 * monotonic guard and the deny-feedback rewrite; returns the handle.
 * @param ctx - the plugin context.
 * @param config - resolved plugin config.
 * @param deps - injectable filesystem/clock (defaults to real node fs).
 * @returns the mounted gate handle (dispose tears everything down).
 */
export function mountGate(ctx: Context, baseConfig: ResolvedConfig, deps: GateDeps = {}): GateHandle {
  // `config` is REBINDABLE: a settings update merges into it and every
  // closure below (identity, review, batches) reads the current revision —
  // the config-version fingerprint then invalidates every older decision.
  let config = baseConfig
  const seam: GateSeamsLike = deps.seams ?? (ctx as unknown as GateSeamsLike)
  const fs: ProbeFileSystem = deps.fs ?? createNodeProbeFs()
  const targetFs: TargetFileSystem<string> = deps.targetFs ?? fs
  const settlement = new SettlementMap()
  const reviewerSessions = new ReviewerChildren()
  const decisions = new Map<string, GateDecision>()
  const feedback = new Map<string, string>()
  const callSessions = new Map<string, Session>()
  const tiers = new Map<string, ReviewTier>()
  const inFlight = new Map<AbortController, string>()
  const disposes: (() => void)[] = []
  // T05 change review: observed write/edit targets, the batch ledger (content
  // verified reuse) and the explicit per-action user allows.
  interface ChangeScope { observed: Set<string>; ledger: BatchLedger; userAllowed: string[]; gaps: string[] }
  const changeScopes = new Map<string, ChangeScope>()
  const changesOf = (sessionId: string, cwd?: string): ChangeScope => {
    const key = JSON.stringify([sessionId, cwd ?? ''])
    let scope = changeScopes.get(key)
    if (!scope) { scope = { observed: new Set(), ledger: new BatchLedger(), userAllowed: [], gaps: [] }; changeScopes.set(key, scope) }
    return scope
  }
  // T06 privacy: precise disclosure ledger, sessions reachable from outbound
  // requests, and sensitive-read content grants (scenario = sending the
  // allowed content to the main model — never other scenarios).
  const disclosureLedger = new DisclosureLedger()
  const sessionsById = new Map<string, Session>()
  /** Sessions actually under the gate (the outbound guard scopes to these). */
  const agentsById = new Map<string, AgentLike>()
  const sensitiveCalls = new Map<string, { readonly requestRef: string; decidedBy: DecidedBy }>()
  const outboundEvents: string[] = []
  let lastActiveSessionId = ''
  // T07: the decision audit log and the runtime settings store (seeds from
  // the resolved config; updates re-bind `config` and invalidate everything).
  const auditLog = new AuditLog(deps.auditPersistence ?? (
    deps.settingsPersistence === undefined || deps.settingsPersistence instanceof FileSettingsPersistence
      ? new FileAuditPersistence(deps.settingsPersistence instanceof FileSettingsPersistence
        ? deps.settingsPersistence.dir : config.settingsDir ?? defaultSettingsDir()) : undefined))
  const reviewStartedAt = new Map<string, number>()
  const settingsStore = new SettingsStore(
    runtimeSettingsFromConfig(config),
    // Durable override persistence (INSTALL-REVIEW R2): the file store under
    // config.settingsDir, else $DSH_HOME/second-look (fork pattern); tests
    // inject an in-memory store.
    deps.settingsPersistence ?? new FileSettingsPersistence(config.settingsDir ?? defaultSettingsDir()),
    (settings) => {
      config = configWithSettings(baseConfig, settings)
      // The user-declared sensitive scope (终审 Minor 1) feeds the routing and
      // detection layers NOW, not just the settings page.
      setUserSensitiveMarkers(settings.sensitiveScope)
      settlement.invalidateAll('settings changed')
      for (const scope of changeScopes.values()) scope.ledger.invalidateAll()
      for (const controller of inFlight.keys()) controller.abort()
      disclosureLedger.invalidateAll()
      auditLog.append({
        at: Date.now(),
        callId: '-',
        toolName: 'settings',
        tier: settings.defaultTier,
        configVersion: configVersionOf(config, settings.defaultTier),
        model: '-',
        decision: 'settings-changed',
        reason: text(language.get(), '审核设置已更新，旧审核结果失效', 'Settings updated — older review results are void for the new configuration'),
        durationMs: null,
        usage: 'unknown',
      })
    },
  )
  setUserSensitiveMarkers(settingsStore.get().sensitiveScope)
  // 安装前复核 R2 补（真实宿主重启实测抓到）: the persisted overlay must
  // merge into the LIVE config AT MOUNT too — `onChange` alone only covers
  // later edits, so a restart would silently review with the loader config
  // while the page shows the saved values. Effective settings from boot on.
  config = configWithSettings(baseConfig, settingsStore.get())
  const language = new HostLanguage(() => {
    const settings = ctx.get('settings') as { describe?: (options: { redactSecrets: true }) => { ns: string; value?: { preference?: unknown } }[] } | undefined
    return settings?.describe?.({ redactSecrets: true }).find(item => item.ns === 'locale')?.value?.preference
  }, config.language)
  const t = (zh: string, en: string): string => text(language.get(), zh, en)
  const prefix = (): string => `[${brand(language.get())}]`
  let healthy = true
  let unhealthyReason: string | undefined
  const gateSessionsSeen = new Set<string>()

  const presets = (): PermissionPresetsLike | undefined =>
    ctx.get('permissionPresets') as PermissionPresetsLike | undefined

  const cwdOf = (session: Session | undefined): string | undefined => {
    if (!session) return undefined
    const workingDirectory = ctx.get('workingDirectory') as { get?(session: Session): string } | undefined
    return workingDirectory?.get?.(session) ?? session.header.cwd
  }
  const activeAgent = (id: string): AgentLike | undefined => {
    const agents = ctx.get('agents') as { get?(id: string): AgentLike | undefined } | undefined
    return agents?.get?.(id) ?? agentsById.get(id)
  }
  // rc.5 records durable lineage in session.header.parentSession; it does not
  // expose parentAgent on the live loop agent. Resolve handles via the registry
  // without mutating host agents (the structural fallback supports older seams).
  const parentOf = (agent: AgentLike | undefined, depth = 0): ParentAgentLike | undefined => {
    if (!agent || depth >= 8) return undefined
    if (agent.parentAgent) return agent.parentAgent
    const parentId = agent.session?.header.parentSession
    if (!parentId || agent.session?.header.origin !== 'subagent') return undefined
    const parent = activeAgent(String(parentId)) as (AgentLike & ParentAgentLike) | undefined
    if (!parent) return undefined
    return {
      session: parent.session,
      parentAgent: parentOf(parent, depth + 1),
      ...(typeof parent.inject === 'function' ? { inject: parent.inject.bind(parent) } : {}),
    }
  }
  const sessionOf = (id: string): Session | undefined => activeAgent(id)?.session ?? sessionsById.get(id)
  const ownTier = (session: Session | undefined, id: string): ReviewTier =>
    tierFromPreset(session && presets()?.current?.(session)) ?? tiers.get(id) ?? config.tiers.defaultTier
  const tierOf = (sessionId: string): ReviewTier => {
    const session = sessionOf(sessionId)
    if (session?.header.origin !== 'subagent') return ownTier(session, sessionId)
    let parent = parentOf(activeAgent(sessionId))
    // A child follows its parent chain, never its own weaker permission knobs.
    for (let depth = 0; depth < 8; depth += 1) {
      const ancestor = parent?.session as Session | undefined
      if (!ancestor) return 'strict'
      if (ancestor.header.origin !== 'subagent') return ownTier(ancestor, String(ancestor.id))
      parent = parent?.parentAgent
    }
    return 'strict'
  }
  const descendsFrom = (id: string, ancestorId: string): boolean => {
    if (id === ancestorId) return true
    let session = sessionOf(id)
    let parent = parentOf(activeAgent(id))
    for (let depth = 0; depth < 8 && session?.header.origin === 'subagent'; depth += 1) {
      if (String(session.header.parentSession) === ancestorId) return true
      session = parent?.session as Session | undefined
      if (String(session?.id) === ancestorId) return true
      parent = parent?.parentAgent
    }
    return false
  }
  const invalidateTier = (id: string): void => {
    const affected = new Set([id, ...sessionsById.keys(), ...inFlight.values()])
    for (const owner of affected) {
      if (!descendsFrom(owner, id)) continue
      settlement.invalidateSession(owner, 'session permission or review tier changed')
      disclosureLedger.invalidateSession(owner)
      for (const [key, scope] of changeScopes) if ((JSON.parse(key) as string[])[0] === owner) scope.ledger.invalidateAll()
      for (const [controller, requestOwner] of inFlight) if (requestOwner === owner) controller.abort()
    }
  }
  const isCurrentlyGated = (id: string): boolean => {
    if (reviewerSessions.has(id as SessionId)) return true
    const agent = activeAgent(id)
    const session = agent?.session ?? sessionsById.get(id)
    if (session) sessionsById.set(id, session)
    return shouldGate(presets(), session, parentOf(agent))
  }


  disposes.push(seam.on('session/event', ((session: Session, event: { type: string }) => {
    if (!['permission/preset', 'approval/policy', 'sandbox/mode'].includes(event.type)) return
    const id = String(session.id)
    sessionsById.set(id, session)
    invalidateTier(id)
  }) as never))

  disposes.push(seam.on('session/disposed', ((session: Session) => {
    const id = String(session.id)
    for (const [controller, owner] of inFlight) if (owner === id) controller.abort()
    settlement.invalidateSession(id, 'session disposed')
    disclosureLedger.invalidateSession(id)
    sessionsById.delete(id); agentsById.delete(id); tiers.delete(id)
    for (const key of changeScopes.keys()) if ((JSON.parse(key) as string[])[0] === id) changeScopes.delete(key)
  }) as never))

  const identityOf = (exec: ExecLike, sessionId: string, tier: ReviewTier): ExecutionIdentity => ({
    token: exec.token,
    callId: callKeyOf(exec),
    rootCallId: exec.rootCallId === undefined ? undefined : String(exec.rootCallId),
    sessionId,
    toolName: exec.name,
    argHash: argsDigest(exec.arguments),
    configVersion: configVersionOf(config, tier),
  })

  const markUnhealthy = (reason: string): void => {
    healthy = false
    unhealthyReason = reason
    settlement.invalidateAll(`unhealthy: ${reason}`)
    decisions.clear()
  }

  const denyText = (toolName: string, reason: string): string =>
    `${prefix()} ${t(`已拒绝工具 ${toolName}：${reason}`, `Review denied tool ${toolName}: ${reason}`)}\n${config.denyGuidance === DEFAULT_DENY_GUIDANCE ? t('不要绕过此次拒绝。请选择权限范围内更安全的方案，或先询问用户再重试。', config.denyGuidance) : config.denyGuidance}`

  /** One decision audit record (redacted, bounded; usage is never estimated). */
  const logDecision = (
    identity: ExecutionIdentity,
    tier: ReviewTier,
    model: string,
    decision: string,
    reason: string,
    humanOutcome?: string,
  ): void => {
    const started = reviewStartedAt.get(identity.callId)
    reviewStartedAt.delete(identity.callId)
    auditLog.append({
      at: Date.now(),
      callId: identity.callId,
      sessionId: identity.sessionId,
      toolName: identity.toolName,
      tier,
      configVersion: identity.configVersion,
      model,
      decision,
      reason,
      durationMs: started === undefined ? null : Date.now() - started,
      usage: 'unknown',
      ...humanOutcome === undefined ? {} : { humanOutcome },
    })
  }

  const fallbackText = (toolName: string, failure: ReviewFailure): string =>
    `${prefix()} ${toolName}：${failureText(language.get(), failure.fallback)}。${failure.error}`

  /** The session's MAIN-model route (the destination of ordinary sends). */
  const mainRouteOf = (session: Session | undefined): OutboundDestination | undefined => {
    if (session === undefined) return undefined
    const events = sessionEvents(session)
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index]
      if (event === undefined || event.type !== 'request/header') continue
      const header = (event.data as { header?: { config?: { provider?: unknown; model?: unknown } } } | undefined)?.header?.config
      if (typeof header?.provider === 'string' && typeof header.model === 'string') {
        return { provider: header.provider, model: header.model }
      }
    }
    return undefined
  }

  /**
   * ONE privacy review for one outbound event (redacted evidence only). The
   * caller wraps this in `runInReviewScope`, so a sensitive hit inside the
   * review request itself can never recurse (it stays unsent).
   */
  const requestPrivacyReview = async (
    scan: Parameters<Parameters<typeof createOutboundGuard>[0]['requestPrivacyReview']>[0],
    destination: OutboundDestination,
    signal: AbortSignal | undefined,
    requestRef: string,
  ): Promise<import('../privacy/outbound.ts').PrivacyVerdict> => {
    const session = activeAgent(requestRef)?.session ?? sessionsById.get(requestRef)
    if (session === undefined) return { outcome: 'unavailable', reason: t('无法找到发起请求的会话，不能审核隐私披露', 'cannot resolve the requesting session for a privacy decision') }
    const evidence = scan.findings
      .map(finding => `${finding.kind} at ${finding.location}: ${finding.evidence}`)
      .join('\n')
    const attachmentNote = scan.attachmentsUnscanned
      ? '\nNOTE: attachment bodies are projected AFTER the outbound hook and were NOT scanned — do not claim they were checked.'
      : ''
    const request: ReviewRequest = {
      toolName: 'llm-outbound disclosure',
      reason: `PRIVACY DISCLOSURE review. An outbound model request to ${destination.provider}/${destination.model} `
        + `contains sensitive material (redacted evidence below). Scenario: sending THIS content to THIS destination only; `
        + `a grant does not authorize other destinations, other data, or any publication.\n`
        + `Destination: ${destination.provider}/${destination.model}\n`
        + `Redacted findings:\n${evidence}${attachmentNote}`,
      signal,
      agent: { session },
    }
    const tier = tierOf(requestRef)
    const version = configVersionOf(config, tier)
    const controller = new AbortController()
    const onAbort = (): void => controller.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) controller.abort()
    inFlight.set(controller, requestRef)
    let result: Awaited<ReturnType<typeof runReviewWithEvidence>>
    try { result = await runReviewWithEvidence(ctx, { ...config, language: language.get() }, { ...request, signal: controller.signal, cwd: cwdOf(session) }, reviewerSessions, { fs }, { tier }) }
    finally { inFlight.delete(controller); signal?.removeEventListener('abort', onAbort) }
    if (version !== configVersionOf(config, tierOf(requestRef))) return { outcome: 'unavailable', reason: t('披露审核期间设置改变，原始请求未发送', 'review settings changed during disclosure review; original request was not sent') }
    if (isReviewFailure(result.resolution)) {
      // ask_user here has no verified human channel for outbound requests:
      // keep the request UNSENT and explain (no sticky refusal on failure).
      return { outcome: 'unavailable', reason: result.resolution.error }
    }
    return { outcome: result.resolution.decision === 'allow' ? 'granted' : result.resolution.decision === 'deny' ? 'denied' : 'unavailable', reason: result.resolution.reason }
  }

  // ---- pre-execute: recognize, classify, review, route ----
  // Registered WITHOUT prepend on purpose: the gate's enforcement is
  // ORDER-INDEPENDENT. A hostile listener ordered before us can short-circuit
  // pre-execute and skip our decision — but then no settlement record exists,
  // and the guard (deny-only, at dispatch) refuses the call anyway (V06).
  // Prepending would only hide that property behind registration order.
  disposes.push(seam.on('tools/pre-execute', (async (exec: ExecLike, next: () => Promise<PreExecuteDecision>) => {
    const session = exec.agent?.session
    // Register the session for outbound privacy reviews even when the gate is
    // passive here (T06 review F03): the llm/stream guard is global, and a
    // privacy review must be able to find its session.
    if (session !== undefined) {
      const seenId = session.id === undefined ? '' : String(session.id)
      sessionsById.set(seenId, session)
      if (exec.agent) agentsById.set(seenId, exec.agent)
      lastActiveSessionId = seenId
    }
    if (!shouldGate(presets(), session, parentOf(exec.agent))) {
      return next()
    }
    try {
      const decision = await decideExec(exec, session)
      // Self-heal (红队 §4d): a COMPLETED decision proves the internals work —
      // lift a previous fail-closed trip. While broken the guard still denies.
      if (healthy === false) {
        healthy = true
        unhealthyReason = undefined
      }
      return decision
    } catch (error: unknown) {
      // An unexpected gate failure FAILS CLOSED: the gate is marked unhealthy
      // (guard denies everything in gated sessions) and the call is handed to
      // the approval chain instead of silently executing.
      markUnhealthy(`${t('执行前审核异常', 'pre-execute failure')}: ${error instanceof Error ? error.message : String(error)}`)
      return { kind: 'ask', reason: `${prefix()} ${t('审核服务异常，操作未执行', 'Review service unhealthy; action not executed')}：${String(error instanceof Error ? error.message : error)}` }
    }
  }) as never, {}))

  /** The full per-execution decision path (recognize → classify → review). */
  async function decideExec(exec: ExecLike, session: Session | undefined): Promise<PreExecuteDecision> {
    const sessionId = session?.id === undefined ? '' : String(session.id)
    gateSessionsSeen.add(sessionId)
    const tier = tierOf(sessionId)
    const identity = identityOf(exec, sessionId, tier)
    settlement.record(identity)
    if (session) callSessions.set(identity.callId, session)
    // T04 review F3: an ALREADY-aborted signal must never fall through to an
    // exempt allow — the call settles as cancelled and does not execute.
    if (exec.signal?.aborted === true) {
      settlement.invalidate(identity.callId, 'execution already cancelled')
      logDecision(identity, tier, '-', 'cancelled', t('执行在审核前已取消', 'execution was already cancelled before review'))
      return { kind: 'ask', reason: `${prefix()} ${t(`${exec.name} 已在审核前取消，未执行`, `${exec.name} was cancelled before review — not executed`)}` }
    }
    if (exec.signal !== undefined) {
      exec.signal.addEventListener('abort', () => {
        settlement.invalidate(identity.callId, 'execution cancelled')
        decisions.delete(identity.callId)
      }, { once: true })
    }
    const { classification, action } = await classifyExec(exec, session, tier, identity.configVersion, targetFs, config.verifiedMcpTools, cwdOf(session))
    if (session !== undefined) sessionsById.set(sessionId, session)
    const scope = changesOf(sessionId, action.cwd)
    const rule = config.riskRules.find(rule => rule.regex.test(rule.field === 'toolName' ? exec.name
      : rule.field === 'arguments' ? JSON.stringify(exec.arguments) : classification.reasons.join('; ')))
    const explicitPolicy = rule?.policy ?? config.toolsPolicy.overrides[exec.name]
    if (explicitPolicy === 'never') {
      const reason = t('当前配置明确禁用了此工具', 'this tool is disabled by an explicit configured policy')
      logDecision(identity, tier, '-', 'rule-deny', reason)
      decisions.set(identity.callId, { kind: 'deny', reason, decidedBy: 'fallback' })
      feedback.set(identity.callId, denyText(exec.name, reason))
      return { kind: 'ask', reason: denyText(exec.name, reason) }
    }
    if (explicitPolicy === 'human') {
      logDecision(identity, tier, '-', 'rule-ask', t('当前规则要求由你确认', 'Explicit policy requires a human decision'))
      decisions.set(identity.callId, { kind: 'ask_user', reason: t('当前规则要求由你确认', 'Explicit policy requires a human decision'), decidedBy: 'human' })
      return { kind: 'ask', reason: `${prefix()} ${t('当前规则要求由你确认', 'Explicit policy requires a human decision')}` }
    }
    const isFinalize = exec.name === 'second_look_finalize' && tier === 'strict'
    const extraReasons: string[] = []
    if (classification.signals.includes('sensitive-candidate')) {
      // Sensitive READ: the review request discloses the destination (main
      // model) up front (T06 review F01 — a disclosure decision must be an
      // INFORMED one); an allow covers THIS data to THIS destination only —
      // never other scenarios (auth use, publication).
      sensitiveCalls.set(identity.callId, { requestRef: sessionId, decidedBy: 'reviewer' })
      const mainDest = mainRouteOf(session)
      const destLabel = mainDest === undefined ? '(route not yet established)' : `${mainDest.provider}/${mainDest.model}`
      extraReasons.push(
        `scenario: read of a sensitive candidate whose CONTENT may be disclosed to the main model at [${destLabel}]`
          + ' — allow only if that disclosure to that destination is acceptable; other scenarios need separate review',
      )
    }
    if (action.effect === 'write' || action.effect === 'edit' || (action.effect === 'execute' && action.subOperation === 'shell')) {
      for (const target of action.targets) scope.observed.add(target.rawPath)
    }
    if (classification.disposition === 'exempt' && !isFinalize && explicitPolicy !== 'ai') {
      settlement.settle(identity.callId, exec.name, 'allowed-once', 'exempt')
      logDecision(identity, tier, '-', 'exempt', t(classification.reasons.includes('ordinary in-workspace file edit') ? '工作区内普通文件修改，直接放行' : '普通读取或状态操作，直接放行', classification.reasons.join('; ')))
      return { kind: 'allow' }
    }
    // Review-class: the tiered reviewer decides HERE (one path for main and
    // subagent callers; internal labels never exempt anything). In the strict
    // tier a run-class action reviews TOGETHER with the pending code batch;
    // the batch verdict and the action verdict are recorded separately.
    // Review with a dispose-linked controller (T04 review F1): unloading the
    // plugin aborts in-flight reviews instead of leaking their model streams.
    const reviewAbort = new AbortController()
    inFlight.set(reviewAbort, sessionId)
    reviewStartedAt.set(identity.callId, Date.now())
    const onExecAbort = (): void => reviewAbort.abort()
    exec.signal?.addEventListener('abort', onExecAbort, { once: true })
    if (exec.signal?.aborted) reviewAbort.abort()
    try {
      const request: ReviewRequest = {
        toolName: exec.name,
        callId: CallId(identity.callId),
        arguments: exec.arguments,
        cwd: action.cwd,
        reason: [...classification.reasons, ...extraReasons].join('; '),
        signal: reviewAbort.signal,
        agent: { session: session as Session },
      }
      const budget = config.tiers[tier].totalTimeoutMs
      const reviewed = await withDeadline<{ result: Awaited<ReturnType<typeof runReviewWithEvidence>>; batch?: BatchContext | undefined }>(budget, reviewAbort.signal,
        async signal => {
          const batch = tier === 'strict' && (action.effect === 'execute' || action.effect === 'delegate' || isFinalize)
            ? await collectBatchFor(action, signal, tier, identity.configVersion) : undefined
          signal.throwIfAborted()
          const result = await runInReviewScope(() => runReviewWithEvidence(ctx, { ...config, language: language.get() }, { ...request, signal }, reviewerSessions, { fs }, {
            tier, ...batch === undefined ? {} : { batch: batch.section },
          }))
          return { result, batch }
        },
        kind => ({ result: { resolution: { fallback: kind, error: `${failureText(language.get(), kind)}；${t('总时限包含变更收集和补证', 'Total budget includes batch collection and evidence')}` },
          tier, rounds: 0, promptVersion: tierPromptVersion(tier, config.tiers[tier]) } }),
      )
      return routeReviewResult(exec, identity, session, reviewed.result, reviewed.batch)
    } finally {
      inFlight.delete(reviewAbort)
      exec.signal?.removeEventListener('abort', onExecAbort)
    }
  }

  /** A collected strict-tier change batch travelling with the action review. */
  interface BatchContext {
    readonly ledger: BatchLedger
    readonly id: string
    readonly snapshot: BatchSnapshot
    readonly section: string
    readonly tier: ReviewTier
    /** Set when a still-valid reviewed batch already covers this content. */
    readonly reusedId?: string | undefined
  }

  /**
   * Collect the strict-tier batch for a run-class action: git projects get
   * staged/unstaged/untracked (+ bounded diff), non-git projects fall back to
   * the gate's OBSERVED changes; every gap is named in the section. An
   * already-reviewed batch whose per-file hashes still match is REUSED as
   * evidence (task §2) — the action itself is still decided separately.
   */
  async function collectBatchFor(
    action: UnifiedAction,
    signal: AbortSignal | undefined,
    tier: ReviewTier,
    configVersion: string,
  ): Promise<BatchContext | undefined> {
    const cwd = action.cwd
    if (cwd === undefined) return undefined
    const git = deps.git ?? createGitRunner()
    const scope = changesOf(action.sessionId, cwd)
    const snapshot = boundBatchEvidence(await collectFullBatch(fs, git, cwd, scope.observed, signal))
    scope.gaps = [...snapshot.gaps]
    const isGitBacked = !snapshot.gaps.some(gap => gap.startsWith('non-git project'))
    const reused = scope.ledger.findReusable(snapshot, tier, configVersion)
    if (reused !== undefined) {
      // Content-verified reuse: the diff itself was already reviewed — say so
      // instead of re-sending it as pending; the ACTION still gets its verdict.
      return {
        ledger: scope.ledger,
        id: reused.id,
        snapshot,
        tier,
        reusedId: reused.id,
        section: `change batch ${reused.id}: per-file content hashes VERIFIED unchanged since its review — the diff was already reviewed; judge the ACTION on its own merits.\n`
          + `uncovered from that review: ${reused.uncovered.length === 0 ? '(none)' : reused.uncovered.join(', ')}`,
      }
    }
    const diff = isGitBacked ? await collectGitDiff(git, cwd) : undefined
    return { ledger: scope.ledger, id: `batch-${action.callId}`, snapshot, section: renderBatchSection(snapshot, diff), tier }
  }

  /** Turn one review resolution into the pre-execute decision + ledger state. */
  function routeReviewResult(
    exec: ExecLike,
    identity: ExecutionIdentity,
    session: Session | undefined,
    result: Awaited<ReturnType<typeof runReviewWithEvidence>>,
    batch?: BatchContext,
  ): PreExecuteDecision {
    const isSubagent = session?.header?.origin === 'subagent'
    let resolution = identity.configVersion !== configVersionOf(config, tierOf(identity.sessionId))
      ? { fallback: 'cancelled' as const, error: t('等待裁决时审核设置已改变，请按当前设置重试', 'review settings changed while awaiting the verdict; retry under current settings') }
      : result.resolution
    if (!isReviewFailure(resolution)) {
      resolution = { ...resolution, reason: redactReviewEvidence(resolution.reason),
        ...(resolution.question === undefined ? {} : { question: redactReviewEvidence(resolution.question) }) }
      if (resolution.decision === 'allow' && resolution.riskLevel !== undefined
        && RISK_ORDER.indexOf(resolution.riskLevel) > RISK_ORDER.indexOf(config.riskPolicy.maxAutoAllow)) {
        resolution = { ...resolution, decision: config.riskPolicy.onHighRisk === 'deny' ? 'deny' : 'ask_user',
          reason: `${resolution.reason}；${t('风险超过当前自动放行上限', 'Risk exceeds configured automatic-allow ceiling')}` }
      }
    }
    // One audit record per decision (T07): call link, tier, config version,
    // ACTUAL model, decision, redacted reason, duration; usage stays
    // `unknown` — never estimated.
    if (isReviewFailure(resolution)) {
      logDecision(
        identity,
        result.tier,
        '(none)',
        resolution.fallback === 'cancelled' ? 'cancelled' : `failure-${resolution.fallback}`,
        resolution.error,
      )
    } else {
      logDecision(
        identity,
        result.tier,
        resolution.model ?? `${config.reviewerModelProvider ?? '?'}/${config.reviewerModel ?? '?'}`,
        resolution.decision,
        resolution.reason,
      )
    }
    if (!isReviewFailure(resolution)) {
      const verdict = resolution
      if (verdict.decision === 'allow') {
        // Batch verdict recorded separately from the action settlement: the
        // batch proves ONE version of the diff was reviewed; the settlement
        // still allows only THIS execution. A REUSED batch keeps its original
        // record (its content is verified identical).
        if (batch !== undefined && batch.reusedId === undefined) {
          const hashes = new Map<string, string>()
          for (const file of batch.snapshot.files) {
            if (file.contentHash !== undefined && file.reviewText !== undefined) hashes.set(file.path, file.contentHash)
          }
          batch.ledger.add({
            id: batch.id,
            hashes,
            actionCallIds: [identity.callId],
            tier: batch.tier,
            configVersion: identity.configVersion,
            decidedBy: 'reviewer',
            at: Date.now(),
            uncovered: batch.snapshot.files
              .filter(file => file.reviewText === undefined)
              .map(file => file.path),
          })
        }
        if (isSubagent) {
          // No answerer chain for subagents (policy locked `never`): settle
          // directly and let the guard consume the bound single-use allow.
          settlement.settle(identity.callId, exec.name, 'allowed-once', 'reviewer')
          return { kind: 'allow' }
        }
        decisions.set(identity.callId, { kind: 'allow', reason: verdict.reason, decidedBy: 'reviewer' })
        return { kind: 'ask', reason: `${prefix()} ${t(`审核已允许 ${exec.name}，等待宿主确认`, `Reviewer allowed ${exec.name} (pending host settlement)`)}` }
      }
      if (verdict.decision === 'deny') {
        // The answerer never sees subagent requests (policy `never`), so only
        // main-session decisions are routed there; the feedback text applies
        // to both (the child's rejection text carries the boundary/evidence).
        if (!isSubagent) decisions.set(identity.callId, { kind: 'deny', reason: verdict.reason, decidedBy: 'reviewer' })
        feedback.set(identity.callId, denyText(exec.name, verdict.reason))
        return { kind: 'ask', reason: `${prefix()} ${t(`已拒绝 ${exec.name}`, `Review denied ${exec.name}`)}：${verdict.reason}` }
      }
      // ask_user (need_evidence is resolved inside the loop)
      const question = verdict.question ?? verdict.reason
      if (!isSubagent) {
        decisions.set(identity.callId, { kind: 'ask_user', reason: verdict.reason, question, decidedBy: 'reviewer' })
        return { kind: 'ask', reason: `${prefix()} ${t(`${exec.name} 需要你确认`, `Human decision needed for ${exec.name}`)}：${question}` }
      }
      return relayAndReject(exec, identity, question, verdict.reason)
    }
    // Failure: cancellation is terminal and NEVER becomes a human question.
    if (resolution.fallback === 'cancelled') {
      settlement.invalidate(identity.callId, 'review cancelled')
      if (!isSubagent) decisions.set(identity.callId, { kind: 'cancelled', reason: resolution.error, decidedBy: 'fallback' })
      feedback.set(identity.callId, `${prefix()} ${t('审核已取消或权限／设置已改变；本操作未执行。请按当前模式继续。', 'Review cancelled or permission/settings changed; this action was not executed. Continue under the current mode.')}`)
      return { kind: 'ask', reason: `${prefix()} ${t(`${exec.name} 审核取消，操作未执行`, `Review cancelled before a verdict for ${exec.name} — not executed`)}` }
    }
    if (config.fallbackPolicy === 'allow-once') {
      // Deliberately dangerous, admin-opt-in (documented): the failure grants
      // one bound, single-use execution.
      settlement.settle(identity.callId, exec.name, 'allowed-once', 'fallback')
      return { kind: 'allow' }
    }
    if (config.fallbackPolicy === 'rejected') {
      if (!isSubagent) {
        decisions.set(identity.callId, { kind: 'deny', reason: resolution.error, decidedBy: 'fallback' })
        feedback.set(identity.callId, fallbackText(exec.name, resolution))
      }
      return { kind: 'ask', reason: `${prefix()} ${t(`${exec.name} 审核未完成`, `Review failed for ${exec.name}`)}：${resolution.error}` }
    }
    // default: delegate — a human decides; no human ⇒ stays unexecuted.
    const question = t(`${exec.name} 的自动审核未完成（${failureText(language.get(), resolution.fallback)}）。是否允许本次操作？\n${resolution.error}`, `The automated review for ${exec.name} could not decide (${resolution.fallback}: ${resolution.error}). Approve once?`)
    if (!isSubagent) {
      decisions.set(identity.callId, { kind: 'failed', reason: resolution.error, question, decidedBy: 'fallback' })
      feedback.set(identity.callId, fallbackText(exec.name, resolution))
    }
    return relayAndReject(exec, identity, question, resolution.error, isSubagent ? undefined : { kind: 'ask', reason: `${prefix()} ${t(`${exec.name} 需要你确认`, `Human decision needed for ${exec.name}`)}：${question}` })
  }

  /**
   * Subagent ask path: hand the question to the parent session (best effort,
   * unverified delivery) and return an ask that the host's `never` policy
   * rejects — the child sees NOT EXECUTED with correlation info. Main
   * sessions can pass an override to route to their human chain instead.
   */
  function relayAndReject(
    exec: ExecLike,
    identity: ExecutionIdentity,
    question: string,
    reason: string,
    override?: PreExecuteDecision,
  ): PreExecuteDecision {
    if (override !== undefined) return override
    const relay: AskRelayResult = relayAskToParent(parentOf(exec.agent), {
      callId: identity.callId,
      toolName: exec.name,
      question,
      reason,
      childSessionId: identity.sessionId,
      language: language.get(),
    })
    settlement.invalidate(identity.callId, 'ask relayed to parent; call not executed')
    // The child's rejection text carries the correlation info (task: return
    // NOT EXECUTED with the request association).
    feedback.set(identity.callId, relay.correlation)
    return { kind: 'ask', reason: relay.correlation }
  }

  // ---- answerer: settle the SAME call exactly once ----
  disposes.push(seam.on('approval/request', (async (req: ApprovalReqLike, next: () => Promise<ApprovalOutcomeLike>) => {
    const callId = String(req.callId ?? '')
    const decision = decisions.get(callId)
    if (decision === undefined && !settlement.has(callId)) return next() // native approvals belong entirely to the host
    if (req.signal?.aborted === true || decision?.kind === 'cancelled') {
      settlement.invalidate(callId, 'request cancelled before settlement')
      decisions.delete(callId)
      return 'cancelled'
    }
    if (decision === undefined) return next()
    decisions.delete(callId)
    if (decision.kind === 'allow') {
      settlement.settle(callId, req.toolName, 'allowed-once', decision.decidedBy)
      return 'allowed-once'
    }
    if (decision.kind === 'deny') {
      settlement.settle(callId, req.toolName, 'rejected', decision.decidedBy)
      return 'rejected'
    }
    // ask_user / failed (delegate fallback): the HUMAN chain settles this one
    // call — after the human answers, the verdict is final (no re-review loop).
    const outcome = await next()
    settlement.settle(callId, req.toolName, outcome, 'human')
    // An explicit human allow applies to THIS action only — never a batch
    // pardon (task §T05). Recorded for the finalize report.
    if (outcome === 'allowed-once') {
      const session = req.agent?.session ?? callSessions.get(callId)
      const scope = changesOf(String(session?.id ?? ''), cwdOf(session))
      scope.userAllowed.unshift(`${req.toolName} ${callId} (${t('用户批准，仅限此次操作', 'human, this action only')})`)
      if (scope.userAllowed.length > 100) scope.userAllowed.length = 100
      // A sensitive read settled by a HUMAN: the content grant records the
      // human as its decider (T06 scenario accounting).
      const sensitive = sensitiveCalls.get(callId)
      if (sensitive !== undefined) sensitive.decidedBy = 'human'
    }
    auditLog.append({
      at: Date.now(),
      callId,
      sessionId: String((req.agent?.session ?? callSessions.get(callId))?.id ?? ''),
      toolName: req.toolName,
      tier: tierOf(String((req.agent?.session as { id?: unknown } | undefined)?.id ?? '')),
      configVersion: configVersionOf(config, tierOf(String((req.agent?.session as { id?: unknown } | undefined)?.id ?? ''))),
      model: 'human',
      decision: 'human-settled',
      reason: t('人工审批已结束，本次调用不重复审核', 'The human chain settled this call (one decision, no re-review)'),
      durationMs: null,
      usage: 'unknown',
      humanOutcome: outcome,
    })
    return outcome
  }) as never, { prepend: true }))

  // ---- guard: bound, settled, single-use — deny-only ----
  disposes.push(seam.tools.guard((exec: ExecLike): string | undefined => {
    const session = exec.agent?.session
    const sessionId = session?.id === undefined ? '' : String(session.id)
    const identity = identityOf(exec, sessionId, tierOf(sessionId))
    // 终审 §3b: once an execution was RECORDED under the gate, the guard
    // enforces its settlement even if the preset switched mid-flight —
    // otherwise a social-engineered preset flip would execute with no
    // credentials at all.
    if (!shouldGate(presets(), session, parentOf(exec.agent)) && !settlement.has(identity.callId)) return undefined
    if (!healthy) {
      logDecision(identity, tierOf(sessionId), '-', 'guard-blocked', unhealthyReason ?? t('审核服务异常', 'gate unhealthy'))
      return `${prefix()} ${t('执行拦截：审核服务异常，操作未执行', 'Guard: review service unhealthy; action not executed')}（${unhealthyReason ?? t('未知原因', 'unknown')}）`
    }
    const verdict = settlement.verifyAndConsume(identity, language.get())
    if (!verdict.ok) logDecision(identity, tierOf(sessionId), '-', 'guard-blocked', verdict.reason)
    return verdict.ok ? undefined : `${prefix()} ${t('执行拦截', 'Guard')}：${verdict.reason}`
  }))

  // ---- deny/fallback feedback: replace the generic rejection text ----
  // Host contract (mirrors the upstream runtime's `injectDenyReason`): a
  // `tools/post-execute` listener may return `{ kind: 'block', feedback }` to
  // replace an errored tool result's content with the recorded explanation.
  disposes.push(seam.on('tools/post-execute', (async (exec: ExecLike, result: { isError?: boolean; content?: unknown }, next: () => Promise<unknown>) => {
    const callId = callKeyOf(exec)
    // T06: a sensitive read that EXECUTED grants disclosure of exactly the
    // RETURNED sensitive spans to the session's main model — the scenario its
    // review authorized (destination shown up front). Other destinations and
    // scenarios are separate decisions.
    const sensitive = sensitiveCalls.get(callId)
    if (sensitive !== undefined) {
      sensitiveCalls.delete(callId)
      if (result?.isError !== true) {
        const destination = mainRouteOf(sessionsById.get(sensitive.requestRef))
        if (destination !== undefined) {
          const scan = scanOutbound({ result: result?.content })
          if (scan.findings.length > 0) {
            disclosureLedger.record({
              scope: { destination, dataFingerprint: scan.dataFingerprint, sessionId: sensitive.requestRef },
              granted: true,
              decidedBy: sensitive.decidedBy === 'human' ? 'user' : 'reviewer',
              at: Date.now(),
              evidence: scan.findings.map(finding => `${finding.kind}@${finding.location}: ${finding.evidence}`),
              requestRef: callId,
            })
          }
        }
      }
    }
    settlement.invalidate(callId, 'execution completed')
    callSessions.delete(callId)
    decisions.delete(callId)
    anonymousCallKeys.delete(exec.token)
    const text = feedback.get(callId)
    if (text === undefined) return next()
    feedback.delete(callId)
    if (result?.isError !== true) return next()
    return { kind: 'block', feedback: [{ type: 'text', text }] }
  }) as never, {}))

  // ---- T06 outbound privacy guard (`llm/stream` pre-send) ----
  // Verified seam (T00 §6): pause before `yield* next()` is legal, the frozen
  // request is never modified, and this listener must never throw (a throw
  // kills the turn) — createOutboundGuard swallows and fails closed.
  disposes.push(seam.on('llm/stream', createOutboundGuard({
    language: () => language.get(),
    ledger: disclosureLedger,
    requestPrivacyReview,
    // 终审 R3(2)/安装前复核 R3: gated sessions AND reviewer children are the
    // gate's own outbound surfaces — their requests are always scanned. The
    // review call itself also runs inside `runInReviewScope`, so "no
    // sessionId" can never smuggle a review request past the scan as a
    // native request; native sessions keep native semantics.
    isGatedRequest: isCurrentlyGated,
    restart: (options) => {
      const llm = ctx.get('llm')
      if (!llm) throw new Error('llm service unavailable')
      return llm.stream(options as Parameters<typeof llm.stream>[0])
    },
    onEvent: (event) => {
      outboundEvents.unshift(
        `${event.action} → ${event.destination.provider}/${event.destination.model} [${event.findingKinds.join(',')}] ${event.reason}`,
      )
      if (outboundEvents.length > 50) outboundEvents.length = 50
      if (event.action === 'block-refused' || event.action === 'block-unsent') {
        const tier = tierOf(event.requestRef)
        auditLog.append({ at: event.at, sessionId: event.requestRef, callId: randomUUID(), toolName: 'llm/stream',
          tier, configVersion: configVersionOf(config, tier), model: `${event.destination.provider}/${event.destination.model}`,
          decision: 'outbound-blocked', reason: event.reason, durationMs: null, usage: 'unknown' })
      }
    },
  }) as unknown as (...args: never[]) => unknown, {}))

  // ---- T07 settings/status surface: loopback page + /second-look command ----
  const statusView = (): GateStatus => ({
    healthy,
    ...unhealthyReason === undefined ? {} : { unhealthyReason },
    pendingEntries: settlement.size,
    gateSessionsSeen: gateSessionsSeen.size,
    tiers: Object.fromEntries([...new Set([...sessionsById.keys(), ...tiers.keys()])].map(id => [id, tierOf(id)])),
    configVersions: {
      daily: configVersionOf(config, 'daily'),
      strict: configVersionOf(config, 'strict'),
    },
    defaultTier: config.tiers.defaultTier,
    presetService: presets() === undefined
      ? 'absent — the gate cannot detect its mode; NO protection is claimed for any session'
      : 'present',
    // 部署后补: the live permission-preset roster (feature-detected) so the
    // settings panel can show whether 「过目」 is selectable.
    presetNames: (presets() as { names?: readonly string[] } | undefined)?.names ?? [],
    reviewer: config.reviewerModel === undefined || config.reviewerModelProvider === undefined
      ? t('尚未配置（审核转人工确认）', 'unconfigured (reviews fail closed to a human)')
      : `${config.reviewerModelProvider}/${config.reviewerModel}`,
    batchPending: [...changeScopes.values()].flatMap(scope => [...scope.observed]),
    batchGaps: [...changeScopes.values()].flatMap(scope => scope.gaps.map(gap => localizeGap(gap, language.get()))),
    disclosures: disclosureLedger.size,
    outboundEvents: [...outboundEvents],
    auditDegraded: auditLog.degraded,
    ...auditLog.degradationReason === undefined ? {} : { auditDegradedReason: auditLog.degradationReason },
  })
  // 部署后补: config adjustment lives ONLY in the in-client settings panel
  // (its JSON API is the `views` surface below) — no chat command, no
  // browser-link page (user decision 2026-10-31).
  const switchTier = (sessionId: string, tier: string): string => {
    const next = tier === 'strict' ? 'strict' : 'daily'
    const session = sessionOf(sessionId)
    const service = presets()
    if (service?.set) {
      if (!session) throw new Error('session not loaded')
      if (session.header.origin === 'subagent') throw new Error('subagent tier follows its parent')
      service.set(session, presetForTier(next))
    } else {
      // Structural test seams have no native persistence service.
      tiers.set(sessionId, next)
    }
    invalidateTier(sessionId)
    return `会话 ${sessionId || '(当前)'} 档位已切换为 ${next}（旧审核结果对新档位失效）`
  }
  const views: SettingsViewSources = {
    setLanguage: value => language.set(value),
    config: () => ({
      reviewerModel: config.reviewerModel ?? '',
      reviewerModelProvider: config.reviewerModelProvider ?? '',
      reviewerReasoningEffort: config.reviewerReasoningEffort ?? '',
      reviewerProvider: config.reviewerProvider,
      strictReviewerModel: config.tiers.strict.reviewerModel ?? '',
      strictReviewerModelProvider: config.tiers.strict.reviewerModelProvider ?? '',
      strictReviewerReasoningEffort: config.tiers.strict.reviewerReasoningEffort ?? '',
      defaultTier: config.tiers.defaultTier,
      daily: config.tiers.daily,
      strict: config.tiers.strict,
      // Which patch keys hold a SAVED override (names only) — the panel's
      // "overridden" badges and reset affordances.
      savedKeys: Object.keys(settingsStore.savedOverrides()),
      // R2 honesty: where the page's saves persist, and whether the last
      // load saw overrides (names/paths only).
      settingsPersistence: settingsStore.describePersistence(),
    }),
    status: () => ({ ...statusView(), tier: lastActiveSessionId === '' ? config.tiers.defaultTier : tierOf(lastActiveSessionId) }),
    audit: (limit) => auditLog.recent(limit) as unknown as readonly Record<string, unknown>[],
    clearAudit: (scope) => auditLog.clear(scope),
    blockedAudit: () => auditLog.blockedRecent() as unknown as readonly Record<string, unknown>[],
    auditDegraded: () => auditLog.degraded,
    setTier: (sessionId, tier) => {
      switchTier(sessionId, tier)
    },
  }
  /**
   * Attach one optional host surface NOW when its service is already
   * provided, and otherwise when it APPEARS (the sanctioned `ctx.inject`
   * lazy dependency). The real-host acceptance (安装前复核 R1 补) proved the
   * timing gap: the webserver's own fiber waits on `webStartup`, so it can be
   * provided AFTER this plugin's apply — a one-shot `ctx.get` at mount then
   * misses it and the settings page 404s silently. The deferred fiber is
   * torn down with the mount.
   */
  const attachWhenAvailable = (name: string, attach: (service: unknown) => (() => void) | undefined): (() => void) => {
    const current = ctx.get(name)
    if (current !== undefined) return attach(current) ?? ((): void => undefined)
    const fiber = ctx.inject([name], (inner) => {
      const late = inner.get(name)
      return late === undefined ? undefined : attach(late)
    })
    return (): void => {
      void fiber.dispose()
    }
  }
  disposes.push(attachWhenAvailable('webServer', (service) => {
    const host = service as WebServerFace
    return typeof host.register === 'function' ? registerSettingsRoutes(host, settingsStore, views) : undefined
  }))

  // ---- finalize tool (T05): delivery-time report; the host has no end hook,
  // so the tool description instructs the agent to call it before delivering.
  if (typeof seam.tools.register === 'function') {
    disposes.push(seam.tools.register(buildFinalizeTool({
      language: () => language.get(),
      fs,
      observedPaths: new Set(),
      ledger: new BatchLedger(),
      tier: config.tiers.defaultTier,
      configVersion: configVersionOf(config, config.tiers.defaultTier),
      cwd: undefined,
      userAllowedActions: [],
      git: deps.git ?? createGitRunner(),
      resolve: (exec) => {
        const scopeSession = (exec as ExecLike).agent?.session
        const scopeId = scopeSession?.id === undefined ? '' : String(scopeSession.id)
        const scope = changesOf(scopeId, cwdOf(scopeSession))
        return {
          enabled: shouldGate(presets(), scopeSession, parentOf((exec as ExecLike).agent)) && tierOf(scopeId) === 'strict',
          observedPaths: scope.observed,
          ledger: scope.ledger,
          tier: tierOf(scopeId),
          configVersion: configVersionOf(config, tierOf(scopeId)),
          cwd: cwdOf(scopeSession),
          userAllowedActions: [...scope.userAllowed],
        }
      },
    })))
  }

  return {
    dispose(): void {
      for (const controller of inFlight.keys()) controller.abort()
      inFlight.clear()
      settlement.invalidateAll('plugin disposed')
      disclosureLedger.invalidateAll()
      sensitiveCalls.clear()
      sessionsById.clear()
      agentsById.clear()
      changeScopes.clear()
      decisions.clear()
      callSessions.clear()
      feedback.clear()
      for (const dispose of disposes) {
        try {
          dispose()
        } catch {
          // best-effort teardown
        }
      }
    },
    setTier(sessionId: string, tier: ReviewTier): void {
      switchTier(sessionId, tier)
    },
    getTier(sessionId: string): ReviewTier {
      return tierOf(sessionId)
    },
    status(): GateStatus {
      return statusView()
    },
    settlement,
    disclosures: disclosureLedger,
    audit: auditLog,
    settings: settingsStore,
  }
}

/**
 * Recognize + classify one execution, inspecting up to
 * {@link MAX_INSPECTED_TARGETS} file targets with the shared path inspector.
 * Anything unestablishable becomes an unknown-scope target (review), never a
 * silent exemption.
 */
async function classifyExec(
  exec: ExecLike,
  session: Session | undefined,
  tier: ReviewTier,
  configVersion: string,
  targetFs: TargetFileSystem<string>,
  verifiedMcpTools?: Record<string, string> | undefined,
  currentCwd?: string | undefined,
): Promise<{ classification: Classification; action: UnifiedAction }> {
  const recognized = recognizeCall(exec.name, exec.arguments, {
    // 终审 §6: the verified-adapter mapping is CONFIGURED here — without a
    // config entry every MCP tool stays review-class (fail-closed).
    verifiedMcpTools: verifiedMcpTools as never,
  })
  const cwd = currentCwd ?? session?.header?.cwd
  const isPtcInner = exec.parent !== undefined
  const targets: ActionTarget[] = []
  for (const rawPath of recognized.rawPaths.slice(0, MAX_INSPECTED_TARGETS)) {
    try {
      const probe = await inspectFileTarget(targetFs, rawPath, cwd, exec.signal)
      targets.push(targetFromEvidence(rawPath, probe))
    } catch {
      targets.push({ rawPath, scope: 'unknown' })
    }
  }
  const action: UnifiedAction = {
    callId: callKeyOf(exec),
    rootCallId: exec.rootCallId === undefined ? undefined : String(exec.rootCallId),
    isPtcInner,
    sessionId: session?.id === undefined ? '' : String(session.id),
    parentSessionId: session?.header?.parentSession === undefined ? undefined : String(session.header.parentSession),
    origin: originOf(exec.name, isPtcInner),
    toolName: exec.name,
    arguments: exec.arguments,
    cwd,
    tier,
    configVersion,
    effect: recognized.effect,
    subOperation: recognized.subOperation,
    targets,
    signals: (recognized.effect === 'write' || recognized.effect === 'edit') && recognized.rawPaths.some(target => isGateControlPath(target, cwd))
      ? [...recognized.signals, 'system-change'] : recognized.signals,
  }
  return { classification: classifyAction(action, tier), action }
}
