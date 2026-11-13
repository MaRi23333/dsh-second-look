/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T03).
 *
 * The two review tiers and their budgets. `daily` checks what an action does,
 * its scope, the user's authorization and obvious damage; `strict` adds the
 * change diff, the actual scripts, outbound transfer and persistence effects
 * (batch context is supplied later by the T05 change-review surface). Each
 * tier's prompt section carries its own version string so the two prompt
 * lines evolve independently, and each tier may override the reviewer route
 * (strict is allowed its own provider/model; unset falls back to the base
 * reviewer — never to the main model).
 */
/** The review-strength tier. Selected per session; default `daily`. */
export type { ReviewTier } from './action/types.js';
import type { ReviewTier } from './action/types.js';
/** The closed tier vocabulary. */
export declare const REVIEW_TIERS: readonly ReviewTier[];
/** Per-tier budgets for the evidence loop and the reviewer model. */
export interface TierBudgetConfig {
    /**
     * How many `need_evidence` rounds one review may spend (planning default:
     * daily 1, strict 3). A round that would exceed this becomes an explainable
     * human-handoff failure — never a silent allow.
     */
    readonly evidenceRounds: number;
    /**
     * Total deadline for ONE review including all evidence rounds, in
     * milliseconds (planning default: 90s). Exceeding it is a `timeout` failure
     * routed to a human, never an implicit model swap.
     */
    readonly totalTimeoutMs: number;
    /** Maximum probe items one `need_evidence` request may carry. */
    readonly maxEvidenceItems: number;
    /** Character cap per probe result shown back to the reviewer. */
    readonly maxEvidenceCharsPerItem: number;
}
/** One tier's full settings: budgets plus optional reviewer/prompt overrides. */
export interface TierSettings extends TierBudgetConfig {
    /** Reviewer model override for this tier (falls back to the base reviewer). */
    readonly reviewerModel?: string | undefined;
    /** Reviewer LLM-provider override for this tier. */
    readonly reviewerModelProvider?: string | undefined;
    /** Reviewer reasoning-effort override for this tier (falls back to the base setting). */
    readonly reviewerReasoningEffort?: string | undefined;
    /** Reviewer subagent-provider override for this tier. */
    readonly reviewerProvider?: string | undefined;
    /** Reviewer Agent Preset override for this tier. */
    readonly reviewerPreset?: string | undefined;
    /** Extra tier guidance appended to the reviewer prompt. */
    readonly guidance?: string | undefined;
    /**
     * Prompt version stamp for this tier. Defaults to the shipped
     * {@link DAILY_PROMPT_VERSION} / {@link STRICT_PROMPT_VERSION}; overriding it
     * lets one tier's prompt line be versioned without touching the other.
     */
    readonly promptVersion?: string | undefined;
}
/** The resolved two-tier configuration. */
export interface TierConfig {
    /** Tier new sessions start in. */
    readonly defaultTier: ReviewTier;
    readonly daily: TierSettings;
    readonly strict: TierSettings;
}
/** Prompt version stamp of the shipped daily prompt line. */
export declare const DAILY_PROMPT_VERSION = "daily-v2";
/** Prompt version stamp of the shipped strict prompt line. */
export declare const STRICT_PROMPT_VERSION = "strict-v2";
/** Shipped daily budgets (planning defaults, tunable after replay). */
export declare const DEFAULT_DAILY_BUDGET: TierBudgetConfig;
/** Shipped strict budgets (planning defaults, tunable after replay). */
export declare const DEFAULT_STRICT_BUDGET: TierBudgetConfig;
/** The shipped tier configuration. */
export declare const DEFAULT_TIER_CONFIG: TierConfig;
/**
 * The prompt version stamp of one tier's effective settings.
 * @param tier - the tier.
 * @param settings - the tier's resolved settings.
 * @returns the configured stamp, or the shipped default for the tier.
 */
export declare function tierPromptVersion(tier: ReviewTier, settings: TierSettings): string;
/**
 * The tier policy section of the reviewer prompt: what this tier is
 * responsible for judging, and how its evidence is organized. The two texts
 * are independent lines (each stamped with its own version), so one can be
 * revised without editing the other.
 * @param tier - the tier.
 * @param settings - the tier's resolved settings (for the version stamp).
 * @returns the prompt section text.
 */
export declare function buildTierSection(tier: ReviewTier, settings: TierSettings): string;
/**
 * Merge one tier's reviewer overrides over the base reviewer configuration:
 * an unset override inherits the base reviewer — never the main model.
 * @param tier - the tier's resolved settings.
 * @param base - the base (per-plugin) reviewer configuration.
 * @returns the effective reviewer route/preset for this tier.
 */
export declare function effectiveReviewer(tier: TierSettings, base: {
    readonly reviewerModel: string | undefined;
    readonly reviewerModelProvider: string | undefined;
    readonly reviewerReasoningEffort: string | undefined;
    readonly reviewerProvider: string;
    readonly reviewerPreset?: string | undefined;
}): {
    readonly reviewerModel: string | undefined;
    readonly reviewerModelProvider: string | undefined;
    readonly reviewerReasoningEffort: string | undefined;
    readonly reviewerProvider: string;
    readonly reviewerPreset: string | undefined;
};
//# sourceMappingURL=tier.d.ts.map