/**
 * Modified for dsh-second-look, 2026-10-31 (T01 migration; see THIRD-PARTY-SOURCES.md).
 * Config schema and resolution for `dsh-auto-review`. Every tunable is a
 * validated {@link Config} field changeable from cordis.yml; the resolution
 * step compiles risk-rule regexes and fails loud on invalid input.
 * @module dsh-auto-review/config
 */
import z from '@deepseek-ai/schemastery';
import type { UiLanguage } from './messages.js';
import { type ReviewTier, type TierBudgetConfig, type TierConfig } from './tier.js';
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
export type ToolReviewPolicy = 'ai' | 'human' | 'never';
/** Risk levels the reviewer may attach to a verdict. */
export type RiskLevel = 'low' | 'medium' | 'high';
/**
 * (T01 migration) The upstream Phocinae backend — ReviewerBackend, PhocinaeConfig,
 * isPhocinaeModelName and the decision-service constants — is not carried into
 * the first version; see docs/T01-MIGRATION.md.
 */
/** The risk-level ordering, low first — the comparison base of {@link RiskPolicyConfig}. */
export declare const RISK_ORDER: readonly RiskLevel[];
/** What a risk-rule pattern is matched against. */
export type RiskRuleField = 'reason' | 'toolName' | 'arguments';
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
export type FallbackPolicy = 'rejected' | 'delegate' | 'allow-once';
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
    readonly turns: number;
    /** Character cap applied to the whole context section, spent newest-line first. */
    readonly maxChars: number;
}
/**
 * Default {@link ContextBudgetConfig.turns}: the open turn (which carries the
 * pending call and, usually, the request that authorized it) plus the one
 * before it, which is where an authorization stated a moment earlier lives.
 * One turn is the bare minimum and leaves no slack; a larger window costs
 * prompt tokens and widens what a non-default `reviewerModel` is shown, and
 * `maxChars` bounds it either way.
 */
export declare const DEFAULT_CONTEXT_TURNS = 2;
/** What a tripped rejection circuit breaker does to later ai-policy requests in the turn. */
export type CircuitAction = 'delegate' | 'reject' | 'abort-turn';
/**
 * The rejection circuit breaker: after a run of denials the turn stops
 * asking the reviewer. Trips on {@link consecutiveDenies} consecutive deny
 * verdicts in the turn OR {@link windowDenies} denials inside the last
 * {@link windowSize} verdicts of the turn, whichever comes first.
 */
export interface CircuitBreakerConfig {
    /** Consecutive deny verdicts in one turn that trip the breaker. */
    readonly consecutiveDenies: number;
    /** Deny count inside the window that trips the breaker. */
    readonly windowDenies: number;
    /** How many recent verdicts the window counts. */
    readonly windowSize: number;
    /** What later requests in the turn do once tripped. */
    readonly action: CircuitAction;
}
/**
 * How the reviewer's verdict risk level constrains the outcome: an `allow`
 * verdict whose risk exceeds {@link maxAutoAllow} never settles the request
 * — it delegates to the human chain (or denies) per {@link onHighRisk}.
 */
export interface RiskPolicyConfig {
    /** The highest risk level an allow verdict may settle with. */
    readonly maxAutoAllow: RiskLevel;
    /** What happens to an allow verdict above the cap. */
    readonly onHighRisk: 'delegate' | 'deny';
}
/** One risk rule: a regex matched against the request reason, tool name, or redacted call arguments. */
export interface RiskRuleConfig {
    /** Regular expression source (compiled without flags). */
    pattern: string;
    /** The policy a matching request resolves to. */
    policy: ToolReviewPolicy;
    /** What the pattern is matched against. Default `'reason'`; `'arguments'` matches the redacted presented call arguments. */
    field?: RiskRuleField;
}
/** Per-tool policy table: explicit overrides, then a default for unlisted tools. */
export interface ToolsPolicyConfig {
    /** Policy for tools not named in {@link overrides}. Default `'human'` (delegate). */
    default: ToolReviewPolicy;
    /** Exact tool-name → policy mapping. */
    overrides: Record<string, ToolReviewPolicy>;
}
/** Raw per-tier settings (T03): budgets plus optional reviewer/prompt overrides. */
export interface TierSettingsConfig extends Partial<TierBudgetConfig> {
    /** Reviewer model override for this tier (inherits the base reviewer when unset). */
    reviewerModel?: string;
    /** Reviewer LLM-provider override for this tier. */
    reviewerModelProvider?: string;
    /** Reviewer reasoning-effort override for this tier (inherits the base setting when unset). */
    reviewerReasoningEffort?: string;
    /** Reviewer subagent-provider override for this tier. */
    reviewerProvider?: string;
    /** Reviewer Agent Preset override for this tier. */
    reviewerPreset?: string;
    /** Extra tier guidance appended to the reviewer prompt. */
    guidance?: string;
    /** Prompt version stamp override for this tier's prompt line. */
    promptVersion?: string;
}
/** Raw two-tier configuration (T03). */
export interface TiersConfigInput {
    /** Tier new sessions start in. Default `'daily'`. */
    defaultTier?: ReviewTier;
    daily?: TierSettingsConfig;
    strict?: TierSettingsConfig;
}
/** Raw plugin config — every field optional; {@link Config} supplies the defaults. */
export interface Config {
    /**
     * Whether sessions start with auto-review enabled. The `/auto-review`
     * command writes a durable per-session override that beats this default.
     */
    enableByDefault?: boolean;
    /** Tool policy table (defaults + per-tool overrides). */
    toolsPolicy?: Partial<ToolsPolicyConfig>;
    /** Risk rules matched (first match wins) against the request reason before the tool table. */
    riskRules?: RiskRuleConfig[];
    /** Subagent provider name for the reviewer (default `fork`, the in-process fork backend). */
    reviewerProvider?: string;
    /** Reviewer Agent Preset id; required when the host only exposes startActivation. */
    reviewerPreset?: string;
    /** Reviewer model id; when unset the reviewer inherits the session agent's route. */
    reviewerModel?: string;
    /** LLM provider route for {@link reviewerModel}; unset inherits the session agent's provider. */
    reviewerModelProvider?: string;
    /**
     * Reviewer reasoning-effort id, passed verbatim to the reviewer call
     * (`GenerateOptions.reasoningEffort` / child `agentOptions.reasoningEffort`).
     * The vocabulary is adapter-owned and model-specific (e.g. `high`,
     * `thinking-1.5`), so this is a manual free-text value: unset leaves the
     * provider's own default, and an id the exact model does not advertise
     * fails the review closed to a human (never a silent clamp).
     */
    reviewerReasoningEffort?: string;
    /** Verdict deadline in milliseconds. Default 60000. */
    reviewerTimeoutMs?: number;
    /**
     * The reviewer's tool allow-list — read-only tools by default. The subagent
     * `toolFilter` is an allow-list: anything not named here is invisible to
     * and unexecutable by the reviewer child. Must be non-empty.
     */
    reviewerTools?: string[];
    /** Reviewer failure policy (see {@link FallbackPolicy}). Default `'delegate'` (T04: failures go to a human). */
    fallbackPolicy?: FallbackPolicy;
    /** Maximum real AI verdicts per open turn; further requests delegate to humans. */
    maxReviewsPerTurn?: number;
    /**
     * Maximum reviewer failures (timeout/unavailable/schema — not user
     * cancellations) per open turn; beyond it, further requests delegate
     * instead of paying another full timeout. Defaults to
     * {@link maxReviewsPerTurn}.
     */
    maxFailuresPerTurn?: number;
    /** Cap applied to reviewer reasons, and the request reason before they enter prompts or logs. */
    reasonMaxChars?: number;
    /** Independent cap for tool arguments/script evidence, not an output-token budget. */
    argumentsMaxChars?: number;
    /** Optional extra guidance appended to the reviewer prompt (advisory, not a hard rule). */
    reviewerGuidance?: string;
    /**
     * Optional policy text injected into the reviewer prompt as the ruling
     * policy (Markdown: always-deny / always-allow / require-justification
     * sections), like Codex `auto_review.policy`. A template ships at
     * `fixtures/config/policy-template.md`.
     */
    reviewerPolicyText?: string;
    /** Guidance appended to every injected deny reason (anti-circumvention). */
    denyGuidance?: string;
    /** Compact transcript budget for the reviewer prompt (see {@link ContextBudgetConfig}). */
    contextBudget?: Partial<ContextBudgetConfig>;
    /** Verdict risk-level constraints (see {@link RiskPolicyConfig}). */
    riskPolicy?: Partial<RiskPolicyConfig>;
    /** The rejection circuit breaker (see {@link CircuitBreakerConfig}). */
    circuitBreaker?: Partial<CircuitBreakerConfig>;
    /** How long a `/auto-review approve` override stays usable, in milliseconds. Default 5 minutes. */
    overrideTtlMs?: number;
    /**
     * How long an identical `tool + arguments` fingerprint reuses its last
     * verdict before the second model is consulted again, in milliseconds.
     * `0` disables the cache. Default 60000.
     */
    verdictCacheTtlMs?: number;
    /** Hard cap on cached verdict fingerprints; the oldest entry is evicted beyond it. Default 256. */
    verdictCacheMaxEntries?: number;
    /** Fallback language before the host/client locale is available (`en` | `zh`). */
    language?: UiLanguage;
    /**
     * The two review tiers (T03): default tier, per-tier budgets (evidence
     * rounds, total deadline, evidence sizes) and per-tier reviewer/prompt
     * overrides. An unset tier override inherits the base reviewer — never the
     * main model.
     */
    tiers?: TiersConfigInput;
    /**
     * MCP adapters the USER has explicitly verified, mapped to their established
     * effect (终审 §6: the mapping must be CONFIGURED to exist at all). Anything
     * not listed here stays review-class — fail-closed by default.
     */
    verifiedMcpTools?: Record<string, string>;
    /**
     * Directory for the durable settings-page override document (INSTALL-REVIEW
     * R2). Defaults to `$DSH_HOME/second-look` (else `~/.dsh/second-look`). Point
     * a test profile at its own directory so verification saves can never
     * pollute the main profile's settings. Names and budgets only — never
     * credentials.
     */
    settingsDir?: string;
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
    allowUnmarkedAudit?: boolean;
}
/** Config after {@link resolveConfig}: every optional field has its explicit default. */
export interface ResolvedConfig {
    readonly enableByDefault: boolean;
    readonly toolsPolicy: ToolsPolicyConfig;
    readonly riskRules: readonly ResolvedRiskRule[];
    readonly reviewerProvider: string;
    readonly reviewerPreset?: string | undefined;
    readonly reviewerModel: string | undefined;
    readonly reviewerModelProvider: string | undefined;
    readonly reviewerReasoningEffort: string | undefined;
    readonly reviewerTimeoutMs: number;
    readonly reviewerTools: readonly string[];
    readonly fallbackPolicy: FallbackPolicy;
    readonly maxReviewsPerTurn: number;
    readonly maxFailuresPerTurn: number;
    readonly reasonMaxChars: number;
    readonly argumentsMaxChars: number;
    readonly reviewerGuidance: string | undefined;
    readonly reviewerPolicyText: string | undefined;
    readonly denyGuidance: string;
    readonly contextBudget: ContextBudgetConfig;
    readonly riskPolicy: RiskPolicyConfig;
    readonly circuitBreaker: CircuitBreakerConfig;
    readonly overrideTtlMs: number;
    readonly verdictCacheTtlMs: number;
    readonly verdictCacheMaxEntries: number;
    readonly language: UiLanguage;
    readonly allowUnmarkedAudit: boolean;
    readonly tiers: TierConfig;
    readonly verifiedMcpTools: Record<string, string> | undefined;
    readonly settingsDir: string | undefined;
}
/** A compiled {@link RiskRuleConfig}, ready to test against its configured field. */
export interface ResolvedRiskRule {
    /** The original pattern source, kept for prompts and audit. */
    readonly pattern: string;
    readonly regex: RegExp;
    readonly policy: ToolReviewPolicy;
    readonly field: RiskRuleField;
}
/** Default anti-circumvention guidance appended to every injected deny reason. */
export declare const DEFAULT_DENY_GUIDANCE: string;
/** Schemastery schema: the loader validates and fills defaults before `apply`. */
export declare const Config: z<Config>;
/**
 * Whether any resolved policy can route a request to the AI reviewer — the
 * table default, one per-tool override, or one risk rule. Combined with
 * `contextBudget.turns: 0` this is the deny-everything configuration the
 * runtime warns about at mount time.
 * @param config - the resolved config.
 * @returns true when at least one policy is `ai`.
 */
export declare function hasAiPolicy(config: ResolvedConfig): boolean;
/** Whether `level` ranks strictly above `cap` in {@link RISK_ORDER}. */
export declare function riskExceeds(level: RiskLevel, cap: RiskLevel): boolean;
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
export declare function resolveConfig(config?: Config): ResolvedConfig;
//# sourceMappingURL=config.d.ts.map