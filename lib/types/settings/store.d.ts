import type { SettingsPersistence } from './persistence.js';
import type { ReviewTier } from '../tier.js';
import type { TierBudgetConfig } from '../tier.js';
/** The effective runtime settings. */
export interface RuntimeSettings {
    readonly reviewerModel: string | undefined;
    readonly reviewerModelProvider: string | undefined;
    readonly reviewerReasoningEffort: string | undefined;
    readonly reviewerProvider: string;
    readonly reviewerPreset: string | undefined;
    readonly defaultTier: ReviewTier;
    readonly daily: TierBudgetConfig;
    readonly strict: TierBudgetConfig;
    /** Strict-tier reviewer route override (falls back to the base reviewer). */
    readonly strictReviewerModel: string | undefined;
    readonly strictReviewerModelProvider: string | undefined;
    readonly strictReviewerReasoningEffort: string | undefined;
    /** User-declared extra sensitive path markers (joined for display only). */
    readonly sensitiveScope: readonly string[];
}
/** A settings validation error with a stable code. */
export declare class SettingsError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
/** The saved overlay: only fields the user actually stored (flat patch keys). */
export type SettingsOverrides = Record<string, unknown>;
/**
 * Whitelist + shape-check one settings patch. Unknown keys are rejected
 * loudly (closed surface); credential-looking keys are rejected by name.
 * @param body - the raw patch (e.g. parsed JSON).
 * @returns the whitelisted patch (present keys only).
 */
export declare function parseSettingsPatch(body: unknown): Record<string, unknown>;
/**
 * Compose the EFFECTIVE settings: loader-config base with the saved overlay
 * on top. An absent overlay field keeps the base value (clear = fall back).
 * @param base - the loader-config snapshot.
 * @param overrides - the saved overlay.
 * @returns the effective settings.
 */
export declare function applySettingsOverrides(base: RuntimeSettings, overrides: SettingsOverrides): RuntimeSettings;
/** The runtime settings store. */
export declare class SettingsStore {
    /** The loader-config base snapshot (clears fall back to it). */
    private readonly base;
    private readonly persistence?;
    private readonly onChange?;
    private readonly loadWarnings;
    /** The effective settings (base + overlay). */
    private settings;
    /** The saved overlay actually persisted (names and budgets only). */
    private overrides;
    constructor(
    /** The loader-config base snapshot (clears fall back to it). */
    base: RuntimeSettings, persistence?: SettingsPersistence | undefined, onChange?: ((settings: RuntimeSettings) => void) | undefined);
    /** The effective settings (a snapshot). */
    get(): RuntimeSettings;
    /** The saved overlay (tests/status). */
    savedOverrides(): SettingsOverrides;
    /** Where the overrides persist (status surface honesty). */
    describePersistence(): string;
    /**
     * Apply one validated patch: durably persist the overlay FIRST, then commit
     * to memory and notify (config-version bump downstream). A persistence
     * failure throws SettingsError `'save-failed'` and leaves both memory and
     * the page response honest — no false success.
     * @param body - the raw patch.
     * @returns the new effective settings.
     * @throws SettingsError on invalid input or a failed save.
     */
    update(body: unknown): RuntimeSettings;
}
/** The minimal resolved-config surface the settings store seeds from. */
export interface SettingsSeed {
    readonly reviewerModel: string | undefined;
    readonly reviewerModelProvider: string | undefined;
    readonly reviewerReasoningEffort: string | undefined;
    readonly reviewerProvider: string;
    readonly reviewerPreset?: string | undefined;
    readonly tiers: {
        readonly defaultTier: ReviewTier;
        readonly daily: TierBudgetConfig;
        readonly strict: TierBudgetConfig & {
            readonly reviewerModel?: string | undefined;
            readonly reviewerModelProvider?: string | undefined;
            readonly reviewerReasoningEffort?: string | undefined;
        };
    };
}
/**
 * Seed the loader-config BASE settings from the resolved plugin config
 * (the overlay is applied on top by {@link SettingsStore}).
 * @param config - the resolved config snapshot.
 * @returns the base settings.
 */
export declare function runtimeSettingsFromConfig(config: SettingsSeed): RuntimeSettings;
//# sourceMappingURL=store.d.ts.map