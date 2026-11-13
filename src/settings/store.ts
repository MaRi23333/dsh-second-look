/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T07; INSTALL-REVIEW R2 返修).
 *
 * Runtime settings store for the settings surface: the independent reviewer
 * route, the two-tier budgets, the strict-tier reviewer override and the
 * user-declared sensitive scope. Two layers with an explicit precedence
 * (INSTALL-REVIEW R2): the LOADER CONFIG is the base; SAVED OVERRIDES from
 * the settings page are an overlay — a field the user clears (null / "") is
 * removed from the overlay and falls back to the loader config value.
 *
 * Persistence-first saves: `update()` validates the patch, durably WRITES the
 * overlay through {@link SettingsPersistence} first, and only then commits to
 * memory and fires `onChange`. A write failure changes NOTHING and is
 * reported (SettingsError `'save-failed'`) — the page never lies about a save.
 * Updates can NEVER carry credential material — keys are names only, host
 * credentials stay in the host credential service. Every applied change fires
 * `onChange`, which the gate turns into a config-version bump so OLD review
 * results never apply to the NEW configuration.
 */
import { SENSITIVE_KEY } from '../evidence/sensitive.ts'
import type { SettingsPersistence } from './persistence.ts'
import type { ReviewTier } from '../tier.ts'
import type { TierBudgetConfig } from '../tier.ts'

/** The effective runtime settings. */
export interface RuntimeSettings {
  readonly reviewerModel: string | undefined
  readonly reviewerModelProvider: string | undefined
  readonly reviewerReasoningEffort: string | undefined
  readonly reviewerProvider: string
  readonly reviewerPreset: string | undefined
  readonly defaultTier: ReviewTier
  readonly daily: TierBudgetConfig
  readonly strict: TierBudgetConfig
  /** Strict-tier reviewer route override (falls back to the base reviewer). */
  readonly strictReviewerModel: string | undefined
  readonly strictReviewerModelProvider: string | undefined
  readonly strictReviewerReasoningEffort: string | undefined
  /** User-declared extra sensitive path markers (joined for display only). */
  readonly sensitiveScope: readonly string[]
}

/** A settings validation error with a stable code. */
export class SettingsError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'SettingsError'
  }
}

const PATCH_KEYS = new Set([
  'reviewerModel',
  'reviewerModelProvider',
  'reviewerReasoningEffort',
  'reviewerProvider',
  'reviewerPreset',
  'defaultTier',
  'evidenceRoundsDaily',
  'evidenceRoundsStrict',
  'totalTimeoutMsDaily',
  'totalTimeoutMsStrict',
  'maxEvidenceItemsDaily',
  'maxEvidenceItemsStrict',
  'strictReviewerModel',
  'strictReviewerModelProvider',
  'strictReviewerReasoningEffort',
  'sensitiveScope',
])

/** The saved overlay: only fields the user actually stored (flat patch keys). */
export type SettingsOverrides = Record<string, unknown>

/**
 * Whitelist + shape-check one settings patch. Unknown keys are rejected
 * loudly (closed surface); credential-looking keys are rejected by name.
 * @param body - the raw patch (e.g. parsed JSON).
 * @returns the whitelisted patch (present keys only).
 */
export function parseSettingsPatch(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new SettingsError('invalid-patch', 'the patch must be a JSON object')
  }
  const patch: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(key)) {
      // Name only — the value is never echoed (host credentials stay in the
      // host credential service).
      throw new SettingsError('credential-key', `settings.${key} looks like stored credential material — configure provider/model NAMES only`)
    }
    if (!PATCH_KEYS.has(key)) {
      throw new SettingsError('unknown-key', `settings.${key} is not a configurable field`)
    }
    patch[key] = value
  }
  return patch
}

/** Keys whose values are optional strings (a null/"" value CLEARS the override). */
const OPTIONAL_STRING_KEYS = [
  'reviewerModel',
  'reviewerModelProvider',
  'reviewerReasoningEffort',
  'reviewerProvider',
  'reviewerPreset',
  'strictReviewerModel',
  'strictReviewerModelProvider',
  'strictReviewerReasoningEffort',
] as const

/** Budget keys: positive safe integers (evidence rounds allow zero). */
const BUDGET_KEYS: Readonly<Record<string, boolean>> = {
  evidenceRoundsDaily: true,
  evidenceRoundsStrict: true,
  totalTimeoutMsDaily: false,
  totalTimeoutMsStrict: false,
  maxEvidenceItemsDaily: false,
  maxEvidenceItemsStrict: false,
}

/**
 * Validate ONE patch value for the overlay. `undefined` (or null/"" for
 * strings) means CLEAR: the overlay field is removed and the loader-config
 * base value applies.
 * @param key - the whitelisted patch key.
 * @param value - the raw value.
 * @returns the normalized overlay value, or undefined to clear.
 * @throws SettingsError on invalid input.
 */
function normalizeOverrideValue(key: string, value: unknown): unknown {
  if (value === undefined || value === null) return undefined
  if ((OPTIONAL_STRING_KEYS as readonly string[]).includes(key)) {
    if (typeof value !== 'string') {
      throw new SettingsError('invalid-value', `settings.${key} must be a string`)
    }
    const trimmed = value.trim()
    return trimmed === '' ? undefined : trimmed
  }
  if (key in BUDGET_KEYS) {
    const allowZero = BUDGET_KEYS[key] === true
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || (allowZero ? value < 0 : value <= 0)) {
      throw new SettingsError('invalid-value', `settings.${key} must be ${allowZero ? 'a non-negative' : 'a positive'} safe integer`)
    }
    return value
  }
  if (key === 'defaultTier') {
    if (value !== 'daily' && value !== 'strict') {
      throw new SettingsError('invalid-value', 'settings.defaultTier must be "daily" or "strict"')
    }
    return value
  }
  if (key === 'sensitiveScope') {
    if (!Array.isArray(value) || !value.every(item => typeof item === 'string' && item.length > 0 && item.length <= 256)) {
      throw new SettingsError('invalid-value', 'settings.sensitiveScope must be an array of non-empty strings')
    }
    return [...value] as string[]
  }
  /* c8 ignore next */
  throw new SettingsError('unknown-key', `settings.${key} is not a configurable field`)
}

/**
 * Compose the EFFECTIVE settings: loader-config base with the saved overlay
 * on top. An absent overlay field keeps the base value (clear = fall back).
 * @param base - the loader-config snapshot.
 * @param overrides - the saved overlay.
 * @returns the effective settings.
 */
export function applySettingsOverrides(base: RuntimeSettings, overrides: SettingsOverrides): RuntimeSettings {
  const pick = (key: string): unknown => (Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : undefined)
  return {
    reviewerModel: (pick('reviewerModel') as string | undefined) ?? base.reviewerModel,
    reviewerModelProvider: (pick('reviewerModelProvider') as string | undefined) ?? base.reviewerModelProvider,
    reviewerReasoningEffort: (pick('reviewerReasoningEffort') as string | undefined) ?? base.reviewerReasoningEffort,
    reviewerProvider: (pick('reviewerProvider') as string | undefined) ?? base.reviewerProvider,
    reviewerPreset: (pick('reviewerPreset') as string | undefined) ?? base.reviewerPreset,
    defaultTier: (pick('defaultTier') as ReviewTier | undefined) ?? base.defaultTier,
    daily: {
      evidenceRounds: (pick('evidenceRoundsDaily') as number | undefined) ?? base.daily.evidenceRounds,
      totalTimeoutMs: (pick('totalTimeoutMsDaily') as number | undefined) ?? base.daily.totalTimeoutMs,
      maxEvidenceItems: (pick('maxEvidenceItemsDaily') as number | undefined) ?? base.daily.maxEvidenceItems,
      maxEvidenceCharsPerItem: base.daily.maxEvidenceCharsPerItem,
    },
    strict: {
      evidenceRounds: (pick('evidenceRoundsStrict') as number | undefined) ?? base.strict.evidenceRounds,
      totalTimeoutMs: (pick('totalTimeoutMsStrict') as number | undefined) ?? base.strict.totalTimeoutMs,
      maxEvidenceItems: (pick('maxEvidenceItemsStrict') as number | undefined) ?? base.strict.maxEvidenceItems,
      maxEvidenceCharsPerItem: base.strict.maxEvidenceCharsPerItem,
    },
    strictReviewerModel: (pick('strictReviewerModel') as string | undefined) ?? base.strictReviewerModel,
    strictReviewerModelProvider: (pick('strictReviewerModelProvider') as string | undefined) ?? base.strictReviewerModelProvider,
    strictReviewerReasoningEffort: (pick('strictReviewerReasoningEffort') as string | undefined) ?? base.strictReviewerReasoningEffort,
    sensitiveScope: (pick('sensitiveScope') as string[] | undefined) ?? base.sensitiveScope,
  }
}

/** The runtime settings store. */
export class SettingsStore {
  private readonly loadWarnings: string[] = []
  /** The effective settings (base + overlay). */
  private settings: RuntimeSettings
  /** The saved overlay actually persisted (names and budgets only). */
  private overrides: SettingsOverrides

  constructor(
    /** The loader-config base snapshot (clears fall back to it). */
    private readonly base: RuntimeSettings,
    private readonly persistence?: SettingsPersistence,
    private readonly onChange?: (settings: RuntimeSettings) => void,
  ) {
    this.overrides = {}
    for (const [key, value] of Object.entries(this.persistence?.load() ?? {})) {
      try {
        parseSettingsPatch({ [key]: value })
        const normalized = normalizeOverrideValue(key, value)
        if (normalized !== undefined) this.overrides[key] = normalized
      } catch { this.loadWarnings.push(key) }
    }
    this.settings = applySettingsOverrides(base, this.overrides)
  }

  /** The effective settings (a snapshot). */
  get(): RuntimeSettings {
    return structuredClone(this.settings)
  }

  /** The saved overlay (tests/status). */
  savedOverrides(): SettingsOverrides {
    return structuredClone(this.overrides)
  }

  /** Where the overrides persist (status surface honesty). */
  describePersistence(): string {
    return (this.persistence === undefined ? 'none (settings are NOT kept across restarts)' : this.persistence.describe())
      + (this.loadWarnings.length ? `; invalid saved fields ignored: ${this.loadWarnings.join(', ')}` : '')
  }

  /**
   * Apply one validated patch: durably persist the overlay FIRST, then commit
   * to memory and notify (config-version bump downstream). A persistence
   * failure throws SettingsError `'save-failed'` and leaves both memory and
   * the page response honest — no false success.
   * @param body - the raw patch.
   * @returns the new effective settings.
   * @throws SettingsError on invalid input or a failed save.
   */
  update(body: unknown): RuntimeSettings {
    const patch = parseSettingsPatch(body)
    const next: SettingsOverrides = { ...this.overrides }
    for (const [key, value] of Object.entries(patch)) {
      const normalized = normalizeOverrideValue(key, value)
      if (normalized === undefined) delete next[key]
      else next[key] = normalized
    }
    const settings = applySettingsOverrides(this.base, next)
    try {
      this.persistence?.save(next)
    } catch (error: unknown) {
      throw new SettingsError(
        'save-failed',
        `settings could not be persisted — nothing was applied: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    this.overrides = next
    this.settings = settings
    this.onChange?.(this.settings)
    return structuredClone(this.settings)
  }
}

/** The minimal resolved-config surface the settings store seeds from. */
export interface SettingsSeed {
  readonly reviewerModel: string | undefined
  readonly reviewerModelProvider: string | undefined
  readonly reviewerReasoningEffort: string | undefined
  readonly reviewerProvider: string
  readonly reviewerPreset?: string | undefined
  readonly tiers: {
    readonly defaultTier: ReviewTier
    readonly daily: TierBudgetConfig
    readonly strict: TierBudgetConfig & {
      readonly reviewerModel?: string | undefined
      readonly reviewerModelProvider?: string | undefined
      readonly reviewerReasoningEffort?: string | undefined
    }
  }
}

/**
 * Seed the loader-config BASE settings from the resolved plugin config
 * (the overlay is applied on top by {@link SettingsStore}).
 * @param config - the resolved config snapshot.
 * @returns the base settings.
 */
export function runtimeSettingsFromConfig(config: SettingsSeed): RuntimeSettings {
  return {
    reviewerModel: config.reviewerModel,
    reviewerModelProvider: config.reviewerModelProvider,
    reviewerReasoningEffort: config.reviewerReasoningEffort,
    reviewerProvider: config.reviewerProvider,
    reviewerPreset: config.reviewerPreset,
    defaultTier: config.tiers.defaultTier,
    daily: {
      evidenceRounds: config.tiers.daily.evidenceRounds,
      totalTimeoutMs: config.tiers.daily.totalTimeoutMs,
      maxEvidenceItems: config.tiers.daily.maxEvidenceItems,
      maxEvidenceCharsPerItem: config.tiers.daily.maxEvidenceCharsPerItem,
    },
    strict: {
      evidenceRounds: config.tiers.strict.evidenceRounds,
      totalTimeoutMs: config.tiers.strict.totalTimeoutMs,
      maxEvidenceItems: config.tiers.strict.maxEvidenceItems,
      maxEvidenceCharsPerItem: config.tiers.strict.maxEvidenceCharsPerItem,
    },
    strictReviewerModel: config.tiers.strict.reviewerModel,
    strictReviewerModelProvider: config.tiers.strict.reviewerModelProvider,
    strictReviewerReasoningEffort: config.tiers.strict.reviewerReasoningEffort,
    sensitiveScope: [],
  }
}
