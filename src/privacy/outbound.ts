import { brand, text } from '../locale.ts'
import type { UiLanguage } from '../messages.ts'
/** Privacy gate: original denied content stays unsent. A redacted copy can
 * resume the same conversation; unrecoverable blocks have an explicit finish error.
 * Review traffic is always checked and can never trigger another privacy review.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import type { DisclosureLedger, DisclosureScope } from './disclosure.ts'
import { scanOutbound, redactOutboundPayload, type OutboundScan } from './detect.ts'

import { redactSecretSpans } from '../evidence/secret-spans.ts'

const recoveryScope = new AsyncLocalStorage<boolean>()
export type PrivacyOutcome = 'granted' | 'denied' | 'unavailable'
export interface PrivacyVerdict { outcome: PrivacyOutcome; reason: string }

/** Destination of one outbound request. */
export interface OutboundDestination {
  readonly provider: string
  readonly model: string
}

/** What the guard decided for one outbound event. */
export type OutboundAction = 'send' | 'send-granted' | 'review' | 'block-refused' | 'block-unsent' | 'send-redacted'

export interface OutboundDecision {
  readonly action: OutboundAction
  readonly reason: string
  readonly scope: DisclosureScope
  readonly scan: OutboundScan
}

/** Review-execution scope marker (recursion control). */
const reviewScope = new AsyncLocalStorage<{ readonly inReview: boolean; readonly protectedSessionId?: string | undefined }>()

/**
 * Run `fn` inside a review execution: outbound requests it makes are still
 * scanned, but a hit can never launch another privacy review.
 * @param fn - the review execution.
 * @returns the function result.
 */
export function runInReviewScope<T>(fn: () => Promise<T>, protectedSessionId?: string): Promise<T> {
  return reviewScope.run({ inReview: true, protectedSessionId: protectedSessionId ?? reviewScope.getStore()?.protectedSessionId }, fn)
}

/** Whether the current async context is inside a review execution. */
export function inReviewScope(): boolean {
  return reviewScope.getStore()?.inReview === true
}

/**
 * Decide one outbound event from its scan and the disclosure ledger.
 * @param scan - the scan result.
 * @param destination - the outbound route.
 * @param ledger - the disclosure ledger.
 * @param requestRef - audit association (session/call).
 * @returns the decision (never grants without an exact-scope record).
 */
export function decideOutbound(
  scan: OutboundScan,
  destination: OutboundDestination,
  ledger: DisclosureLedger,
  sessionId?: string,
  language: UiLanguage = 'en',
): OutboundDecision {
  const t = (zh: string, en: string): string => text(language, zh, en)
  const scope: DisclosureScope = { destination, dataFingerprint: scan.dataFingerprint, sessionId }
  const note = scan.attachmentsUnscanned
    ? t('（附件正文在此检查之后才载入，尚未扫描，不应宣称已检查）', ' (attachment bodies are projected AFTER this hook and were NOT scanned — do not claim they were)')
    : ''
  if (scan.findings.length === 0) {
    // Path MENTIONS are noted, never blocking: a filename is not secret
    // content (the T08 replay false-positive fix).
    const pathNote = scan.notes.length > 0
      ? t(`（发现 ${scan.notes.length} 处凭据路径引用；文件名不是秘密内容，不据此拦截）`, ` (${scan.notes.length} credential-path mention(s) noted — a filename is not secret content and does not block)`)
      : ''
    return { action: 'send', reason: `${t('未检测到敏感内容', 'no sensitive material detected')}${pathNote}${note}`, scope, scan }
  }
  const state = ledger.check(scope)
  if (state === 'granted') {
    return { action: 'send-granted', reason: `${t('这些数据向此目的地的披露已获得授权', 'disclosure previously authorized for this exact data and destination')}${note}`, scope, scan }
  }
  if (state === 'denied') {
    return {
      action: 'block-refused',
      reason: `${ledger.get(scope)?.reason ?? t('披露已拒绝', 'disclosure refused')}；${t('这些数据向此目的地的披露已被拒绝，原始请求未发送；不要暗中重试，只能使用本地脱敏后的上下文继续', 'disclosure previously REFUSED for this exact data and destination — the request stays unsent; do not retry it implicitly, continue only with locally redacted context')}${note}`,
      scope,
      scan,
    }
  }
  if (inReviewScope()) {
    return {
      action: 'block-unsent',
      reason: `${t('审核请求中仍有敏感内容，已拦截且不会递归发起隐私审核；请求未发送', 'sensitive material inside a REVIEW request — checked (no bypass) but no second privacy review is launched; the request stays unsent')}${note}`,
      scope,
      scan,
    }
  }
  return { action: 'review', reason: `${t(`检测到 ${scan.findings.length} 处敏感内容，等待披露审核`, `sensitive material awaiting a precise disclosure decision (${scan.findings.length} finding(s))`)}${note}`, scope, scan }
}

/** One audit event from the guard (redacted; never raw secrets). */
export interface OutboundAuditEvent {
  readonly action: OutboundAction
  readonly reason: string
  readonly destination: OutboundDestination
  readonly dataFingerprint: string
  readonly findingKinds: readonly string[]
  readonly requestRef: string
  readonly at: number
}

/** Dependencies of the outbound guard. */
export interface OutboundGuardDeps {
  readonly language?: () => UiLanguage
  readonly ledger: DisclosureLedger
  /**
   * Run ONE privacy review for a blocked outbound event (redacted evidence
   * only). Returns the disclosure outcome; `unavailable` keeps the request
   * unsent WITHOUT a sticky refusal.
   */
  requestPrivacyReview(
    scan: OutboundScan,
    destination: OutboundDestination,
    signal: AbortSignal | undefined,
    requestRef: string,
  ): Promise<PrivacyOutcome | PrivacyVerdict>
  readonly restart?: (options: OutboundOptionsLike) => AsyncIterable<unknown>
  readonly onEvent?: (event: OutboundAuditEvent) => void
  /**
   * Whether the request's session is under the gate (终审 Major 1): the guard
   * is part of the GATE and must not touch native sessions — a false return
   * passes the request straight through.
   */
  readonly isGatedRequest?: ((sessionId: string) => boolean) | undefined
}

/** The structural options surface of `llm/stream` (T00 §6). */
export interface OutboundOptionsLike {
  readonly provider?: unknown
  readonly model?: unknown
  readonly messages?: unknown
  readonly system?: unknown
  readonly tools?: unknown
  readonly attachments?: unknown
  readonly signal?: AbortSignal | undefined
  readonly sessionId?: unknown
  readonly purpose?: unknown
}

/**
 * Build the `llm/stream` listener. Internal failures never throw (a throw
 * kills the turn): they leave the request UNSENT and record why.
 * @param deps - ledger, privacy-review hook, audit sink.
 * @returns the async-generator listener.
 */
export function createOutboundGuard(deps: OutboundGuardDeps) {
  const language = (): UiLanguage => deps.language?.() ?? 'en'
  const t = (zh: string, en: string): string => text(language(), zh, en)
  const terminal = (reason: string) => ({ type: 'finish', reason: {
    kind: 'error', failure: { code: 'SECOND_LOOK_PRIVACY_BLOCKED', message: `[${brand(language())}] ${reason}` },
  } })
  const emit = (event: OutboundAuditEvent): void => { try { deps.onEvent?.(event) } catch { /* audit failure cannot suppress stream completion */ } }
  async function* recover(options: OutboundOptionsLike, reason: string): AsyncIterable<unknown> {
    if (options.signal?.aborted) { yield terminal(t('请求已取消', 'request cancelled')); return }
    if (!deps.restart || inReviewScope() || recoveryScope.getStore() || options.attachments != null) {
      yield terminal(reason)
      return
    }
    // Keep this prefix deterministic across attempts. Dynamic reviewer reasons
    // stay in the audit event; putting them here invalidates prompt caching.
    const notice = `[${brand(language())}] ` + t(
      '隐私提示：本请求中的敏感值已在本地替换为 [REDACTED]。原始披露未获授权，请用中文说明限制并继续安全工作；不要还原或重发敏感值。具体审核原因保留在审批记录中。',
      'Privacy notice: sensitive values in this request were locally replaced with [REDACTED]. The original disclosure was not authorized. Explain this restriction in English and continue with safe work; do not reconstruct or resend those values. Detailed review reasons are retained in the approval history.',
    )
    const clean: OutboundOptionsLike = {
      ...options,
      messages: redactOutboundPayload(options.messages),
      tools: redactOutboundPayload(options.tools),
      system: `${typeof options.system === 'string' ? redactSecretSpans(options.system) : ''}\n\n${notice}`,
    }
    if (scanOutbound({ messages: clean.messages, system: clean.system, tools: clean.tools }).findings.length) {
      yield terminal(t('本地脱敏未能安全移除所有敏感值，原始请求未发送', 'local redaction could not safely remove all detected values; original request was NOT sent'))
      return
    }
    emit({ action: 'send-redacted', reason: t('原始披露已拦截，使用经扫描的脱敏副本继续会话', 'original disclosure blocked; a scanned redacted copy continues this session'),
      destination: { provider: String(options.provider), model: String(options.model) },
      dataFingerprint: scanOutbound(clean).dataFingerprint, findingKinds: [], requestRef: String(options.sessionId ?? 'no-session'), at: Date.now() })
    const iterator = deps.restart(clean)[Symbol.asyncIterator]()
    try {
      for (;;) {
        const item = await recoveryScope.run(true, () => iterator.next())
        if (item.done) break
        yield item.value
      }
    } finally { if (iterator.return) await recoveryScope.run(true, () => iterator.return!()) }
  }
  return async function* outboundGuard(options: OutboundOptionsLike, next: () => AsyncIterable<unknown>): AsyncIterable<unknown> {
    // Reviewer transport/cache identity is separate; the async scope preserves
    // the protected parent for privacy decisions and audit correlation.
    const requestRef = reviewScope.getStore()?.protectedSessionId ?? String(options.sessionId ?? 'no-session')
    if (deps.isGatedRequest?.(requestRef) === false && !inReviewScope()) { yield* next(); return }
    let decision: OutboundDecision
    const destination = { provider: String(options.provider ?? 'unknown'), model: String(options.model ?? 'unknown') }
    try {
      const scan = scanOutbound({ messages: options.messages, system: options.system, tools: options.tools }, {
        attachmentsPresent: options.attachments != null,
      })
      decision = decideOutbound(scan, destination, deps.ledger, requestRef, language())
      if (decision.action === 'review') {
        if (recoveryScope.getStore()) {
          decision = { ...decision, action: 'block-unsent', reason: t('脱敏请求仍含敏感内容，不进行递归重试', 'redacted request still contains detected material; no recursive retry') }
        } else {
          const raw = await runInReviewScope(() => deps.requestPrivacyReview(scan, destination, options.signal, requestRef))
          const result = typeof raw === 'string' ? { outcome: raw, reason: t(`隐私审核结果：${raw === 'granted' ? '允许' : raw === 'denied' ? '拒绝' : '不可用'}`, `privacy reviewer: ${raw}`) } : raw
          if (options.signal?.aborted) { yield terminal(t('隐私审核期间请求已取消', 'request cancelled during privacy review')); return }
          // A mode switch takes effect for the next request. This already-paused request
          // still finishes its own review; it never silently sends the denied original.
          if (result.outcome !== 'unavailable') deps.ledger.record({
            scope: decision.scope, reason: redactSecretSpans(result.reason), granted: result.outcome === 'granted', decidedBy: 'reviewer', at: Date.now(),
            evidence: scan.findings.map(f => `${f.kind}@${f.location}: ${f.evidence}`), requestRef,
          })
          decision = { ...decision,
            action: result.outcome === 'granted' ? 'send-granted' : result.outcome === 'denied' ? 'block-refused' : 'block-unsent',
            reason: redactSecretSpans(result.reason) + (scan.attachmentsUnscanned ? t('（附件正文尚未扫描）', ' (attachment bodies NOT scanned)') : ''),
          }
        }
      }
    } catch {
      // Do not include arbitrary exception text: providers may echo raw credentials.
      const reason = t('隐私检查失败，原始请求未发送；只有安全脱敏后才能继续', 'privacy check failed; original request left UNSENT; continuing requires safe redaction')
      emit({ action: 'block-unsent', reason, destination, dataFingerprint: 'unknown', findingKinds: [], requestRef, at: Date.now() })
      yield* recover(options, reason)
      return
    }
    emit(auditOf(decision, destination, requestRef))
    if (decision.action === 'send' || decision.action === 'send-granted') {
      // Adapter failures retain the host's own failure semantics; never swallow them.
      yield* next()
    } else {
      yield* recover(options, decision.reason)
    }
  }
}

function auditOf(decision: OutboundDecision, destination: OutboundDestination, requestRef: string): OutboundAuditEvent {
  return {
    action: decision.action,
    reason: decision.reason,
    destination,
    dataFingerprint: decision.scope.dataFingerprint,
    findingKinds: decision.scan.findings.map(finding => finding.kind),
    requestRef,
    at: Date.now(),
  }
}

/** Record a USER disclosure decision for one scope (from the human chain). */
export function recordUserDisclosure(
  ledger: DisclosureLedger,
  scope: DisclosureScope,
  granted: boolean,
  evidence: readonly string[],
  requestRef: string,
): void {
  ledger.record({ scope, granted, decidedBy: 'user', at: Date.now(), evidence, requestRef })
}
