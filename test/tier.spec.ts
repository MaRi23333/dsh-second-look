/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T03).
 *
 * Two-tier policy and budgets: shipped defaults (daily 1 / strict 3 evidence
 * rounds, 90s total), independently versioned prompt sections, tier reviewer
 * overrides that never fall back to the main model, and the config-level
 * guards (budget validation, no credential material in plugin config).
 */
import { describe, expect, it } from 'vitest'
import {
  buildTierSection,
  DAILY_PROMPT_VERSION,
  DEFAULT_DAILY_BUDGET,
  DEFAULT_STRICT_BUDGET,
  DEFAULT_TIER_CONFIG,
  effectiveReviewer,
  resolveConfig,
  STRICT_PROMPT_VERSION,
  tierPromptVersion,
} from '../src/index.ts'
import type { TierSettings } from '../src/index.ts'

describe('tier budgets and defaults', () => {
  it('ships the planning defaults: daily 1 round, strict 3 rounds, 90s total', () => {
    const resolved = resolveConfig()
    expect(resolved.tiers.defaultTier).toBe('daily')
    expect(resolved.tiers.daily.evidenceRounds).toBe(1)
    expect(resolved.tiers.strict.evidenceRounds).toBe(3)
    expect(resolved.tiers.daily.totalTimeoutMs).toBe(90_000)
    expect(resolved.tiers.strict.totalTimeoutMs).toBe(90_000)
    expect(DEFAULT_DAILY_BUDGET.evidenceRounds).toBe(1)
    expect(DEFAULT_STRICT_BUDGET.evidenceRounds).toBe(3)
  })

  it('keeps the two prompt lines independently versioned', () => {
    expect(DAILY_PROMPT_VERSION).not.toBe(STRICT_PROMPT_VERSION)
    expect(tierPromptVersion('daily', DEFAULT_TIER_CONFIG.daily)).toBe(DAILY_PROMPT_VERSION)
    expect(tierPromptVersion('strict', DEFAULT_TIER_CONFIG.strict)).toBe(STRICT_PROMPT_VERSION)
    const custom: TierSettings = { ...DEFAULT_TIER_CONFIG.strict, promptVersion: 'strict-v2-custom' }
    expect(tierPromptVersion('strict', custom)).toBe('strict-v2-custom')
  })

  it('validates tier budgets and rejects out-of-range values loudly', () => {
    expect(() => resolveConfig({ tiers: { daily: { evidenceRounds: -1 } } })).toThrow(/tiers\.daily\.evidenceRounds/u)
    expect(() => resolveConfig({ tiers: { strict: { totalTimeoutMs: 0 } } })).toThrow(/tiers\.strict\.totalTimeoutMs/u)
    expect(() => resolveConfig({ tiers: { daily: { maxEvidenceItems: 0 } } })).toThrow(/tiers\.daily\.maxEvidenceItems/u)
    expect(() => resolveConfig({ tiers: { strict: { maxEvidenceCharsPerItem: -5 } } })).toThrow(/maxEvidenceCharsPerItem/u)
    expect(() => resolveConfig({ tiers: { defaultTier: 'paranoid' as never } })).toThrow(/defaultTier/u)
    // evidenceRounds 0 is legitimate: it disables the evidence loop
    expect(resolveConfig({ tiers: { daily: { evidenceRounds: 0 } } }).tiers.daily.evidenceRounds).toBe(0)
  })

  it('refuses credential material in the plugin config without echoing the value', () => {
    let message = ''
    try {
      resolveConfig({ reviewerGuidance: 'x', apiKey: 'sk-SUPER-SECRET-VALUE' } as never)
    } catch (error: unknown) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message).toContain('apiKey')
    expect(message).toContain('credential')
    expect(message).not.toContain('sk-SUPER-SECRET-VALUE')
    // nested locations are walked too
    expect(() => resolveConfig({ tiers: { strict: { guidance: 'x', token: 'abc' } } } as never)).toThrow(/token/u)
    // tool-name dicts are NOT credential storage just because a name matches
    expect(() => resolveConfig({ toolsPolicy: { default: 'ai', overrides: { 'mcp__vault__get_token': 'ai' } } })).not.toThrow()
  })
})

describe('tier prompt sections', () => {
  it('scopes the daily tier to action/scope/authorization/obvious damage', () => {
    const text = buildTierSection('daily', DEFAULT_TIER_CONFIG.daily)
    expect(text).toContain(`Review tier: daily (prompt ${DAILY_PROMPT_VERSION})`)
    expect(text).toContain('what this action actually does')
    expect(text).toContain('obvious damage')
    expect(text).not.toContain('persistence effects')
  })

  it('adds diff/script/outbound/persistence focus in strict', () => {
    const text = buildTierSection('strict', DEFAULT_TIER_CONFIG.strict)
    expect(text).toContain(`Review tier: strict (prompt ${STRICT_PROMPT_VERSION})`)
    expect(text).toContain('the actual diff/code')
    expect(text).toContain('outbound data transfer')
    expect(text).toContain('persistence effects')
    expect(text).toContain('batch review context')
    expect(text).toContain('3 need_evidence rounds')
  })

  it('respects per-tier guidance and budget text', () => {
    const daily: TierSettings = { ...DEFAULT_TIER_CONFIG.daily, guidance: 'focus on rm -rf', promptVersion: 'daily-v7' }
    expect(buildTierSection('daily', daily)).toContain('daily-v7')
  })
})

describe('tier reviewer overrides', () => {
  it('inherits the base reviewer when the tier overrides nothing', () => {
    const effective = effectiveReviewer(DEFAULT_TIER_CONFIG.strict, {
      reviewerModel: 'base-model',
      reviewerModelProvider: 'base-provider',
      reviewerReasoningEffort: 'high',
      reviewerProvider: 'fork',
      reviewerPreset: undefined,
    })
    expect(effective.reviewerModel).toBe('base-model')
    expect(effective.reviewerModelProvider).toBe('base-provider')
    expect(effective.reviewerReasoningEffort).toBe('high')
  })

  it('lets strict override its own reviewer route and reasoning effort', () => {
    const strict: TierSettings = {
      ...DEFAULT_TIER_CONFIG.strict,
      reviewerModel: 'strict-model',
      reviewerModelProvider: 'strict-provider',
      reviewerReasoningEffort: 'low',
      reviewerProvider: 'strict-subagent',
    }
    const effective = effectiveReviewer(strict, {
      reviewerModel: 'base-model',
      reviewerModelProvider: 'base-provider',
      reviewerReasoningEffort: 'high',
      reviewerProvider: 'fork',
      reviewerPreset: 'read-only',
    })
    expect(effective.reviewerModel).toBe('strict-model')
    expect(effective.reviewerModelProvider).toBe('strict-provider')
    expect(effective.reviewerReasoningEffort).toBe('low')
    expect(effective.reviewerProvider).toBe('strict-subagent')
    expect(effective.reviewerPreset).toBe('read-only')
  })

  it('never falls back to the main model when the base reviewer is absent', () => {
    const effective = effectiveReviewer(DEFAULT_TIER_CONFIG.daily, {
      reviewerModel: undefined,
      reviewerModelProvider: undefined,
      reviewerReasoningEffort: undefined,
      reviewerProvider: 'fork',
      reviewerPreset: undefined,
    })
    expect(effective.reviewerModel).toBeUndefined()
    expect(effective.reviewerModelProvider).toBeUndefined()
  })
})
