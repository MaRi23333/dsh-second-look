/**
 * Modified for dsh-second-look, 2026-10-31 (T01 migration; see THIRD-PARTY-SOURCES.md).
 * Config schema and resolution for `dsh-auto-review`. Every tunable is a
 * validated {@link Config} field changeable from cordis.yml; the resolution
 * step compiles risk-rule regexes and fails loud on invalid input.
 * @module dsh-auto-review/config
 */

import z from '@deepseek-ai/schemastery'
import type { UiLanguage } from './messages.ts'
import { SENSITIVE_KEY } from './evidence/sensitive.ts'
import {
  DEFAULT_DAILY_BUDGET,
  DEFAULT_STRICT_BUDGET,
  DEFAULT_TIER_CONFIG,
  type ReviewTier,
  type TierBudgetConfig,
  type TierConfig,
  type TierSettings,
} from './tier.ts'

/**
 * What one approval request does at the auto-review answerer:
 *
 * - `'ai'` — the AI reviewer decides (allow/deny) and the request never
 *   reaches a human answerer.
 * - `'human'` — the request is delegated (`next()`) to the human answerer;
 *   auto-review does not short-circuit the chain.
 * - `'never'` — the answerer rejects deterministically. Only for tools an
 *   admin wants hard-disabled whenever approval is required.
 */
export type ToolReviewPolicy = 'ai' | 'human' | 'never'

/** Risk levels the reviewer may attach to a verdict. */
export type RiskLevel = 'low' | 'medium' | 'high'

/**
 * (T01 migration) The upstream Phocinae backend — ReviewerBackend, PhocinaeConfig,
 * isPhocinaeModelName and the decision-service constants — is not carried into
 * the first version; see docs/T01-MIGRATION.md.
 */

/** The risk-level ordering, low first — the comparison base of {@link RiskPolicyConfig}. */
export const RISK_ORDER: readonly RiskLevel[] = ['low', 'medium', 'high']

/** What a risk-rule pattern is matched against. */
export type RiskRuleField = 'reason' | 'toolName' | 'arguments'

/**
 * What happens when the reviewer cannot deliver a verdict (crash, timeout,
 * subagent unavailable, schema mismatch, evidence budget exhaustion):
 *
 * - `'delegate'` — the request is passed down the answerer chain (a human
 *   answerer, when one is composed) — the T04 default per task §2: failures
 *   become explainable human handoffs; with no human present the call stays
 *   unexecuted.
 * - `'rejected'` — fail closed; the request is denied.
 * - `'allow-once'` — the request is granted once. Deliberately dangerous:
 *   the grant is unconditional, not "readonly" in any enforced sense; it
 *   exists for unattended deployments whose admin accepts that risk. Renamed
 *   from `allow-readonly` in 0.2.0 for honesty; the old spelling is rejected
 *   loudly.
 */
export type FallbackPolicy = 'rejected' | 'delegate' | 'allow-once'

/**
 * How much of the session transcript the reviewer receives as compact
 * context (the calling session's recent user/assistant messages and tool
 * results, redacted and truncated). `turns: 0` disables the section.
 *
 * The default is {@link DEFAULT_CONTEXT_TURNS}, not 0: without a transcript
 * the reviewer never sees the user's request, so the only evidence for a
 * user-authorized action is the calling agent's own self-report — and the
 * verdict rules say to DENY when the evidence is insufficient. A blind
 * reviewer therefore denies every user-authorized escalation, which is
 * indistinguishable from a broken plugin.
 */
export interface ContextBudgetConfig {
  /** How many completed turns (plus the current one) of transcript to include; 0 disables. */
  readonly turns: number
  /** Character cap applied to the whole context section, spent newest-line first. */
  readonly maxChars: number
}

/**
 * Default {@link ContextBudgetConfig.turns}: the open turn (which carries the
 * pending call and, usually, the request that authorized it) plus the one
 * before it, which is where an authorization stated a moment earlier lives.
 * One turn is the bare minimum and leaves no slack; a larger window costs
 * prompt tokens and widens what a non-default `reviewerModel` is shown, and
 * `maxChars` bounds it either way.
 */
export const DEFAULT_CONTEXT_TURNS = 2

/** What a tripped rejection circuit breaker does to later ai-policy requests in the turn. */
export type CircuitAction = 'delegate' | 'reject' | 'abort-turn'

/**
 * The rejection circuit breaker: after a run of denials the turn stops
 * asking the reviewer. Trips on {@link consecutiveDenies} consecutive deny
 * verdicts in the turn OR {@link windowDenies} denials inside the last
 * {@link windowSize} verdicts of the turn, whichever comes first.
 */
export interface CircuitBreakerConfig {
  /** Consecutive deny verdicts in one turn that trip the breaker. */
  readonly consecutiveDenies: number
  /** Deny count inside the window that trips the breaker. */
  readonly windowDenies: number
  /** How many recent verdicts the window counts. */
  readonly windowSize: number
  /** What later requests in the turn do once tripped. */
  readonly action: CircuitAction
}

/**
 * How the reviewer's verdict risk level constrains the outcome: an `allow`
 * verdict whose risk exceeds {@link maxAutoAllow} never settles the request
 * — it delegates to the human chain (or denies) per {@link onHighRisk}.
 */
export interface RiskPolicyConfig {
  /** The highest risk level an allow verdict may settle with. */
  readonly maxAutoAllow: RiskLevel
  /** What happens to an allow verdict above the cap. */
  readonly onHighRisk: 'delegate' | 'deny'
}

/** One risk rule: a regex matched against the request reason, tool name, or redacted call arguments. */
export interface RiskRuleConfig {
  /** Regular expression source (compiled without flags). */
  pattern: string
  /** The policy a matching request resolves to. */
  policy: ToolReviewPolicy
  /** What the pattern is matched against. Default `'reason'`; `'arguments'` matches the redacted presented call arguments. */
  field?: RiskRuleField
}

/** Per-tool policy table: explicit overrides, then a default for unlisted tools. */
export interface ToolsPolicyConfig {
  /** Policy for tools not named in {@link overrides}. Default `'human'` (delegate). */
  default: ToolReviewPolicy
  /** Exact tool-name → policy mapping. */
  overrides: Record<string, ToolReviewPolicy>
}

/** Raw per-tier settings (T03): budgets plus optional reviewer/prompt overrides. */
export interface TierSettingsConfig extends Partial<TierBudgetConfig> {
  /** Reviewer model override for this tier (inherits the base reviewer when unset). */
  reviewerModel?: string
  /** Reviewer LLM-provider override for this tier. */
  reviewerModelProvider?: string
  /** Reviewer reasoning-effort override for this tier (inherits the base setting when unset). */
  reviewerReasoningEffort?: string
  /** Reviewer subagent-provider override for this tier. */
  reviewerProvider?: string
  /** Reviewer Agent Preset override for this tier. */
  reviewerPreset?: string
  /** Extra tier guidance appended to the reviewer prompt. */
  guidance?: string
  /** Prompt version stamp override for this tier's prompt line. */
  promptVersion?: string
}

/** Raw two-tier configuration (T03). */
export interface TiersConfigInput {
  /** Tier new sessions start in. Default `'daily'`. */
  defaultTier?: ReviewTier
  daily?: TierSettingsConfig
  strict?: TierSettingsConfig
}

/** Raw plugin config — every field optional; {@link Config} supplies the defaults. */
export interface Config {
  /**
   * Whether sessions start with auto-review enabled. The `/auto-review`
   * command writes a durable per-session override that beats this default.
   */
  enableByDefault?: boolean
  /** Tool policy table (defaults + per-tool overrides). */
  toolsPolicy?: Partial<ToolsPolicyConfig>
  /** Risk rules matched (first match wins) against the request reason before the tool table. */
  riskRules?: RiskRuleConfig[]
  /** Subagent provider name for the reviewer (default `fork`, the in-process fork backend). */
  reviewerProvider?: string
  /** Reviewer Agent Preset id; required when the host only exposes startActivation. */
  reviewerPreset?: string
  /** Reviewer model id; when unset the reviewer inherits the session agent's route. */
  reviewerModel?: string
  /** LLM provider route for {@link reviewerModel}; unset inherits the session agent's provider. */
  reviewerModelProvider?: string
  /**
   * Reviewer reasoning-effort id, passed verbatim to the reviewer call
   * (`GenerateOptions.reasoningEffort` / child `agentOptions.reasoningEffort`).
   * The vocabulary is adapter-owned and model-specific (e.g. `high`,
   * `thinking-1.5`), so this is a manual free-text value: unset leaves the
   * provider's own default, and an id the exact model does not advertise
   * fails the review closed to a human (never a silent clamp).
   */
  reviewerReasoningEffort?: string
  /** Verdict deadline in milliseconds. Default 60000. */
  reviewerTimeoutMs?: number
  /**
   * The reviewer's tool allow-list — read-only tools by default. The subagent
   * `toolFilter` is an allow-list: anything not named here is invisible to
   * and unexecutable by the reviewer child. Must be non-empty.
   */
  reviewerTools?: string[]
  /** Reviewer failure policy (see {@link FallbackPolicy}). Default `'delegate'` (T04: failures go to a human). */
  fallbackPolicy?: FallbackPolicy
  /** Maximum real AI verdicts per open turn; further requests delegate to humans. */
  maxReviewsPerTurn?: number
  /**
   * Maximum reviewer failures (timeout/unavailable/schema — not user
   * cancellations) per open turn; beyond it, further requests delegate
   * instead of paying another full timeout. Defaults to
   * {@link maxReviewsPerTurn}.
   */
  maxFailuresPerTurn?: number
  /** Cap applied to reviewer reasons, and the request reason before they enter prompts or logs. */
  reasonMaxChars?: number
  /** Independent cap for tool arguments/script evidence, not an output-token budget. */
  argumentsMaxChars?: number
  /** Optional extra guidance appended to the reviewer prompt (advisory, not a hard rule). */
  reviewerGuidance?: string
  /**
   * Optional policy text injected into the reviewer prompt as the ruling
   * policy (Markdown: always-deny / always-allow / require-justification
   * sections), like Codex `auto_review.policy`. A template ships at
   * `fixtures/config/policy-template.md`.
   */
  reviewerPolicyText?: string
  /** Guidance appended to every injected deny reason (anti-circumvention). */
  denyGuidance?: string
  /** Compact transcript budget for the reviewer prompt (see {@link ContextBudgetConfig}). */
  contextBudget?: Partial<ContextBudgetConfig>
  /** Verdict risk-level constraints (see {@link RiskPolicyConfig}). */
  riskPolicy?: Partial<RiskPolicyConfig>
  /** The rejection circuit breaker (see {@link CircuitBreakerConfig}). */
  circuitBreaker?: Partial<CircuitBreakerConfig>
  /** How long a `/auto-review approve` override stays usable, in milliseconds. Default 5 minutes. */
  overrideTtlMs?: number
  /**
   * How long an identical `tool + arguments` fingerprint reuses its last
   * verdict before the second model is consulted again, in milliseconds.
   * `0` disables the cache. Default 60000.
   */
  verdictCacheTtlMs?: number
  /** Hard cap on cached verdict fingerprints; the oldest entry is evicted beyond it. Default 256. */
  verdictCacheMaxEntries?: number
  /** Fallback language before the host/client locale is available (`en` | `zh`). */
  language?: UiLanguage
  /**
   * The two review tiers (T03): default tier, per-tier budgets (evidence
   * rounds, total deadline, evidence sizes) and per-tier reviewer/prompt
   * overrides. An unset tier override inherits the base reviewer — never the
   * main model.
   */
  tiers?: TiersConfigInput
  /**
   * MCP adapters the USER has explicitly verified, mapped to their established
   * effect (终审 §6: the mapping must be CONFIGURED to exist at all). Anything
   * not listed here stays review-class — fail-closed by default.
   */
  verifiedMcpTools?: Record<string, string>
  /**
   * Directory for the durable settings-page override document (INSTALL-REVIEW
   * R2). Defaults to `$DSH_HOME/second-look` (else `~/.dsh/second-look`). Point
   * a test profile at its own directory so verification saves can never
   * pollute the main profile's settings. Names and budgets only — never
   * credentials.
   */
  settingsDir?: string
  /**
   * Force session-log audit even though the host cannot write the `ignorable`
   * envelope marker. Deliberately dangerous, and NOT a compatibility
   * workaround: no published `Session.append` can stamp the marker (verified
   * 2026-09-12 against the host source, every relevant published tarball, and
   * a live append on the `0.1.5-rc.2` line), so enabling this writes unmarked
   * `autoReview/*` events — and the persistence read path refuses unknown
   * unmarked types, which makes those sessions unloadable on every validating
   * harness. Default `false`: the runtime detects the host and degrades to an
   * in-memory audit mirror instead. If you enabled it and sessions stopped
   * loading, repair them with `scripts/repair-session-logs.mjs` from
   * `dsh-permission-rules`.
   */
  allowUnmarkedAudit?: boolean
}

/** Config after {@link resolveConfig}: every optional field has its explicit default. */
export interface ResolvedConfig {
  readonly enableByDefault: boolean
  readonly toolsPolicy: ToolsPolicyConfig
  readonly riskRules: readonly ResolvedRiskRule[]
  readonly reviewerProvider: string
  readonly reviewerPreset?: string | undefined
  readonly reviewerModel: string | undefined
  readonly reviewerModelProvider: string | undefined
  readonly reviewerReasoningEffort: string | undefined
  readonly reviewerTimeoutMs: number
  readonly reviewerTools: readonly string[]
  readonly fallbackPolicy: FallbackPolicy
  readonly maxReviewsPerTurn: number
  readonly maxFailuresPerTurn: number
  readonly reasonMaxChars: number
  readonly argumentsMaxChars: number
  readonly reviewerGuidance: string | undefined
  readonly reviewerPolicyText: string | undefined
  readonly denyGuidance: string
  readonly contextBudget: ContextBudgetConfig
  readonly riskPolicy: RiskPolicyConfig
  readonly circuitBreaker: CircuitBreakerConfig
  readonly overrideTtlMs: number
  readonly verdictCacheTtlMs: number
  readonly verdictCacheMaxEntries: number
  readonly language: UiLanguage
  readonly allowUnmarkedAudit: boolean
  readonly tiers: TierConfig
  readonly verifiedMcpTools: Record<string, string> | undefined
  readonly settingsDir: string | undefined
}

/** A compiled {@link RiskRuleConfig}, ready to test against its configured field. */
export interface ResolvedRiskRule {
  /** The original pattern source, kept for prompts and audit. */
  readonly pattern: string
  readonly regex: RegExp
  readonly policy: ToolReviewPolicy
  readonly field: RiskRuleField
}


const POLICY = z.union(['ai', 'human', 'never'] as const)
const FALLBACK = z.union(['rejected', 'delegate', 'allow-once'] as const)
const RISK = z.union(['low', 'medium', 'high'] as const)
const FIELD = z.union(['reason', 'toolName', 'arguments'] as const)
const CIRCUIT_ACTION = z.union(['delegate', 'reject', 'abort-turn'] as const)

/** Default anti-circumvention guidance appended to every injected deny reason. */
export const DEFAULT_DENY_GUIDANCE = 'Do not attempt to work around this denial. '
  + 'Choose a materially safer alternative that stays inside your permissions, or ask the user before retrying this action.'

/** Schemastery schema: the loader validates and fills defaults before `apply`. */
export const Config: z<Config> = z.object({
  enableByDefault: z.boolean().default(true),
  toolsPolicy: z.object({
    default: POLICY.default('human'),
    overrides: z.dict(POLICY).default({}),
  }).default({ default: 'human', overrides: {} }),
  riskRules: z.array(z.object({
    pattern: z.string(),
    policy: POLICY,
    field: FIELD.default('reason'),
  })).default([]),
  reviewerProvider: z.string().default('fork'),
  reviewerPreset: z.string(),
  reviewerModel: z.string(),
  reviewerModelProvider: z.string(),
  reviewerReasoningEffort: z.string(),
  reviewerTimeoutMs: z.number().default(60_000),
  reviewerTools: z.array(z.string()).default(['read', 'glob', 'grep']),
  fallbackPolicy: FALLBACK.default('delegate'),
  maxReviewsPerTurn: z.number().default(10),
  maxFailuresPerTurn: z.number(),
  reasonMaxChars: z.number().default(2000),
  argumentsMaxChars: z.number().default(64000),
  reviewerGuidance: z.string(),
  reviewerPolicyText: z.string(),
  denyGuidance: z.string().default(DEFAULT_DENY_GUIDANCE),
  contextBudget: z.object({
    turns: z.number().default(DEFAULT_CONTEXT_TURNS),
    maxChars: z.number().default(4000),
  }).default({ turns: DEFAULT_CONTEXT_TURNS, maxChars: 4000 }),
  riskPolicy: z.object({
    maxAutoAllow: RISK.default('high'),
    onHighRisk: z.union(['delegate', 'deny'] as const).default('delegate'),
  }).default({ maxAutoAllow: 'high', onHighRisk: 'delegate' }),
  circuitBreaker: z.object({
    consecutiveDenies: z.number().default(3),
    // The window defaults must stay reachable under the default
    // maxReviewsPerTurn (10): a window trip needs 6 denies inside the turn's
    // at most 10 verdicts, so interleaved denials trip it even when no
    // 3-deny run occurs (a 10-in-50 default could never trip first).
    windowDenies: z.number().default(6),
    windowSize: z.number().default(10),
    action: CIRCUIT_ACTION.default('delegate'),
  }).default({ consecutiveDenies: 3, windowDenies: 6, windowSize: 10, action: 'delegate' }),
  overrideTtlMs: z.number().default(5 * 60_000),
  verdictCacheTtlMs: z.number().default(60_000),
  verdictCacheMaxEntries: z.number().default(256),
  language: z.union(['en', 'zh'] as const).default('en'),
  allowUnmarkedAudit: z.boolean().default(false),
  verifiedMcpTools: z.dict(z.string()),
  settingsDir: z.string(),
  tiers: z.object({
    defaultTier: z.union(['daily', 'strict'] as const).default('daily'),
    daily: z.object({
      evidenceRounds: z.number().default(DEFAULT_DAILY_BUDGET.evidenceRounds),
      totalTimeoutMs: z.number().default(DEFAULT_DAILY_BUDGET.totalTimeoutMs),
      maxEvidenceItems: z.number().default(DEFAULT_DAILY_BUDGET.maxEvidenceItems),
      maxEvidenceCharsPerItem: z.number().default(DEFAULT_DAILY_BUDGET.maxEvidenceCharsPerItem),
      reviewerModel: z.string(),
      reviewerModelProvider: z.string(),
      reviewerReasoningEffort: z.string(),
      reviewerProvider: z.string(),
      reviewerPreset: z.string(),
      guidance: z.string(),
      promptVersion: z.string(),
    }).default({ ...DEFAULT_DAILY_BUDGET }),
    strict: z.object({
      evidenceRounds: z.number().default(DEFAULT_STRICT_BUDGET.evidenceRounds),
      totalTimeoutMs: z.number().default(DEFAULT_STRICT_BUDGET.totalTimeoutMs),
      maxEvidenceItems: z.number().default(DEFAULT_STRICT_BUDGET.maxEvidenceItems),
      maxEvidenceCharsPerItem: z.number().default(DEFAULT_STRICT_BUDGET.maxEvidenceCharsPerItem),
      reviewerModel: z.string(),
      reviewerModelProvider: z.string(),
      reviewerReasoningEffort: z.string(),
      reviewerProvider: z.string(),
      reviewerPreset: z.string(),
      guidance: z.string(),
      promptVersion: z.string(),
    }).default({ ...DEFAULT_STRICT_BUDGET }),
    // schemastery's default-value type marks the nested override fields as
    // required strings (deep ObjectT), while the shipped TierConfig carries
    // them as optional — the cast covers only this default literal's typing.
  }).default(DEFAULT_TIER_CONFIG as never),
})

/**
 * Whether any resolved policy can route a request to the AI reviewer — the
 * table default, one per-tool override, or one risk rule. Combined with
 * `contextBudget.turns: 0` this is the deny-everything configuration the
 * runtime warns about at mount time.
 * @param config - the resolved config.
 * @returns true when at least one policy is `ai`.
 */
export function hasAiPolicy(config: ResolvedConfig): boolean {
  if (config.toolsPolicy.default === 'ai') return true
  if (Object.values(config.toolsPolicy.overrides).includes('ai')) return true
  return config.riskRules.some(rule => rule.policy === 'ai')
}

/** Whether `level` ranks strictly above `cap` in {@link RISK_ORDER}. */
export function riskExceeds(level: RiskLevel, cap: RiskLevel): boolean {
  return RISK_ORDER.indexOf(level) > RISK_ORDER.indexOf(cap)
}
/**
 * Reject config payloads that try to store credential material in the plugin's
 * config (T03: reviewer credentials live in the HOST credential service and
 * are referenced only by provider/model NAMES). The error names the key path
 * only — the value is never echoed into errors or logs.
 * @param value - the raw config value to walk.
 * @param path - the key path for the error message.
 * @throws TypeError when a credential-looking key is present.
 */
function assertNoCredentialFields(value: unknown, path = 'config'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoCredentialFields(item, `${path}[${index}]`))
    return
  }
  if (typeof value !== 'object' || value === null) return
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(key)) {
      throw new TypeError(
        `${path}.${key} looks like a stored credential; reviewer credentials live in the host credential service `
        + '— configure reviewerModel/reviewerModelProvider names only, never key material',
      )
    }
    // `toolsPolicy.overrides` maps tool NAMES (arbitrary identifiers); a tool
    // name that happens to contain "token" is not credential storage.
    if (key === 'overrides' || key === 'verifiedMcpTools') continue
    assertNoCredentialFields(item, `${path}.${key}`)
  }
}

/**
 * Validate and resolve one tier's settings over its shipped defaults.
 * @param name - the tier key (`daily` / `strict`) for error messages.
 * @param raw - the raw per-tier input.
 * @param defaults - the shipped budget defaults for the tier.
 * @returns the resolved tier settings.
 * @throws TypeError on out-of-range budgets (misconfiguration fails loud).
 */
function resolveTierSettings(name: string, raw: TierSettingsConfig | undefined, defaults: TierBudgetConfig): TierSettings {
  const evidenceRounds = raw?.evidenceRounds ?? defaults.evidenceRounds
  if (!Number.isSafeInteger(evidenceRounds) || evidenceRounds < 0) {
    throw new TypeError(`tiers.${name}.evidenceRounds must be a non-negative safe integer, got ${String(evidenceRounds)}`)
  }
  const totalTimeoutMs = raw?.totalTimeoutMs ?? defaults.totalTimeoutMs
  if (!Number.isSafeInteger(totalTimeoutMs) || totalTimeoutMs <= 0) {
    throw new TypeError(`tiers.${name}.totalTimeoutMs must be a positive safe integer, got ${String(totalTimeoutMs)}`)
  }
  const maxEvidenceItems = raw?.maxEvidenceItems ?? defaults.maxEvidenceItems
  if (!Number.isSafeInteger(maxEvidenceItems) || maxEvidenceItems <= 0) {
    throw new TypeError(`tiers.${name}.maxEvidenceItems must be a positive safe integer, got ${String(maxEvidenceItems)}`)
  }
  const maxEvidenceCharsPerItem = raw?.maxEvidenceCharsPerItem ?? defaults.maxEvidenceCharsPerItem
  if (!Number.isSafeInteger(maxEvidenceCharsPerItem) || maxEvidenceCharsPerItem <= 0) {
    throw new TypeError(`tiers.${name}.maxEvidenceCharsPerItem must be a positive safe integer, got ${String(maxEvidenceCharsPerItem)}`)
  }
  return {
    evidenceRounds,
    totalTimeoutMs,
    maxEvidenceItems,
    maxEvidenceCharsPerItem,
    reviewerModel: raw?.reviewerModel,
    reviewerModelProvider: raw?.reviewerModelProvider,
    reviewerReasoningEffort: emptyToUndefined(raw?.reviewerReasoningEffort),
    reviewerProvider: raw?.reviewerProvider,
    reviewerPreset: raw?.reviewerPreset,
    guidance: raw?.guidance,
    promptVersion: raw?.promptVersion,
  }
}

/**
 * Normalize one optional free-text setting: a blank value means unset, so a
 * stale empty string can never reach a reviewer call as an empty id.
 * @param value - the raw config value.
 * @returns the trimmed text, or undefined when blank.
 */
function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === '' ? undefined : trimmed
}

/**
 * Validate raw values and compile the resolved config. Defaults are applied
 * HERE — the explicit resolution step — so a partially-specified config from
 * a direct `ctx.plugin` mount behaves like the loader-filled one.
 * @param config - raw (possibly partial) plugin config.
 * @returns the fully resolved config.
 * @throws TypeError on invalid risk-rule regexes, non-positive budgets,
 *   out-of-range numbers, or credential-looking keys (misconfiguration fails
 *   loud).
 */
export function resolveConfig(config: Config = {}): ResolvedConfig {
  assertNoCredentialFields(config)
  const defaultTier = config.tiers?.defaultTier ?? DEFAULT_TIER_CONFIG.defaultTier
  if (defaultTier !== 'daily' && defaultTier !== 'strict') {
    throw new TypeError(`tiers.defaultTier must be "daily" or "strict", got ${String(defaultTier)}`)
  }
  if (!Number.isSafeInteger(config.reviewerTimeoutMs ?? 60_000) || (config.reviewerTimeoutMs ?? 60_000) <= 0) {
    throw new TypeError(`reviewerTimeoutMs must be a positive safe integer, got ${String(config.reviewerTimeoutMs)}`)
  }
  if (!Number.isSafeInteger(config.maxReviewsPerTurn ?? 10) || (config.maxReviewsPerTurn ?? 10) <= 0) {
    throw new TypeError(`maxReviewsPerTurn must be a positive safe integer, got ${String(config.maxReviewsPerTurn)}`)
  }
  if (!Number.isSafeInteger(config.maxFailuresPerTurn ?? 10) || (config.maxFailuresPerTurn ?? 10) <= 0) {
    throw new TypeError(`maxFailuresPerTurn must be a positive safe integer, got ${String(config.maxFailuresPerTurn)}`)
  }
  if (!Number.isSafeInteger(config.reasonMaxChars ?? 2000) || (config.reasonMaxChars ?? 2000) <= 0) {
    throw new TypeError(`reasonMaxChars must be a positive safe integer, got ${String(config.reasonMaxChars)}`)
  }
  if (!Number.isSafeInteger(config.argumentsMaxChars ?? 64000) || (config.argumentsMaxChars ?? 64000) <= 0) {
    throw new TypeError('argumentsMaxChars must be a positive safe integer')
  }
  const turns = config.contextBudget?.turns ?? DEFAULT_CONTEXT_TURNS
  if (!Number.isSafeInteger(turns) || turns < 0) {
    throw new TypeError(`contextBudget.turns must be a non-negative safe integer, got ${String(turns)}`)
  }
  const contextChars = config.contextBudget?.maxChars ?? 4000
  if (!Number.isSafeInteger(contextChars) || contextChars <= 0) {
    throw new TypeError(`contextBudget.maxChars must be a positive safe integer, got ${String(contextChars)}`)
  }
  const breaker = config.circuitBreaker ?? {}
  for (const [key, value] of [['consecutiveDenies', breaker.consecutiveDenies ?? 3], ['windowDenies', breaker.windowDenies ?? 6], ['windowSize', breaker.windowSize ?? 10]] as const) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new TypeError(`circuitBreaker.${key} must be a positive safe integer, got ${String(value)}`)
    }
  }
  if (!Number.isSafeInteger(config.overrideTtlMs ?? 5 * 60_000) || (config.overrideTtlMs ?? 5 * 60_000) <= 0) {
    throw new TypeError(`overrideTtlMs must be a positive safe integer, got ${String(config.overrideTtlMs)}`)
  }
  if (!Number.isSafeInteger(config.verdictCacheTtlMs ?? 60_000) || (config.verdictCacheTtlMs ?? 60_000) < 0) {
    throw new TypeError(`verdictCacheTtlMs must be a non-negative safe integer (0 disables the cache), got ${String(config.verdictCacheTtlMs)}`)
  }
  if (!Number.isSafeInteger(config.verdictCacheMaxEntries ?? 256) || (config.verdictCacheMaxEntries ?? 256) <= 0) {
    throw new TypeError(`verdictCacheMaxEntries must be a positive safe integer, got ${String(config.verdictCacheMaxEntries)}`)
  }
  if (config.allowUnmarkedAudit !== undefined && typeof config.allowUnmarkedAudit !== 'boolean') {
    throw new TypeError(`allowUnmarkedAudit must be a boolean, got ${String(config.allowUnmarkedAudit)}`)
  }
  const reviewerTools = config.reviewerTools ?? ['read', 'glob', 'grep']
  if (reviewerTools.length === 0) {
    throw new TypeError('reviewerTools must name at least one tool: an empty allow-list would leave the reviewer with no tool face')
  }
  const riskRules = (config.riskRules ?? []).map((rule, index): ResolvedRiskRule => {
    let regex: RegExp
    try {
      // Flags are stripped: a global flag would make repeated .test() calls
      // stateful (lastIndex), and other flags would silently change semantics.
      regex = new RegExp(rule.pattern, 'u')
    } catch (error: unknown) {
      throw new TypeError(`riskRules[${index}]: pattern ${JSON.stringify(rule.pattern)} is not a valid regular expression: ${String(error)}`)
    }
    return { pattern: rule.pattern, regex, policy: rule.policy, field: rule.field ?? 'reason' }
  })
  return {
    enableByDefault: config.enableByDefault ?? true,
    toolsPolicy: {
      default: config.toolsPolicy?.default ?? 'human',
      overrides: config.toolsPolicy?.overrides ?? {},
    },
    riskRules,
    reviewerProvider: config.reviewerProvider ?? 'fork',
    reviewerPreset: config.reviewerPreset,
    reviewerModel: config.reviewerModel ?? undefined,
    reviewerModelProvider: config.reviewerModelProvider ?? undefined,
    reviewerReasoningEffort: emptyToUndefined(config.reviewerReasoningEffort),
    reviewerTimeoutMs: config.reviewerTimeoutMs ?? 60_000,
    reviewerTools,
    fallbackPolicy: config.fallbackPolicy ?? 'delegate',
    maxReviewsPerTurn: config.maxReviewsPerTurn ?? 10,
    maxFailuresPerTurn: config.maxFailuresPerTurn ?? config.maxReviewsPerTurn ?? 10,
    reasonMaxChars: config.reasonMaxChars ?? 2000,
    argumentsMaxChars: config.argumentsMaxChars ?? 64000,
    reviewerGuidance: config.reviewerGuidance,
    reviewerPolicyText: config.reviewerPolicyText,
    denyGuidance: config.denyGuidance ?? DEFAULT_DENY_GUIDANCE,
    contextBudget: { turns, maxChars: contextChars },
    riskPolicy: {
      maxAutoAllow: config.riskPolicy?.maxAutoAllow ?? 'high',
      onHighRisk: config.riskPolicy?.onHighRisk ?? 'delegate',
    },
    circuitBreaker: {
      consecutiveDenies: breaker.consecutiveDenies ?? 3,
      windowDenies: breaker.windowDenies ?? 6,
      windowSize: breaker.windowSize ?? 10,
      action: breaker.action ?? 'delegate',
    },
    overrideTtlMs: config.overrideTtlMs ?? 5 * 60_000,
    verdictCacheTtlMs: config.verdictCacheTtlMs ?? 60_000,
    verdictCacheMaxEntries: config.verdictCacheMaxEntries ?? 256,
    language: config.language ?? 'en',
    allowUnmarkedAudit: config.allowUnmarkedAudit ?? false,
    verifiedMcpTools: config.verifiedMcpTools,
    settingsDir: config.settingsDir === undefined || config.settingsDir.trim() === '' ? undefined : config.settingsDir.trim(),
    tiers: {
      defaultTier,
      daily: resolveTierSettings('daily', config.tiers?.daily, DEFAULT_DAILY_BUDGET),
      strict: resolveTierSettings('strict', config.tiers?.strict, DEFAULT_STRICT_BUDGET),
    },
  }
}
