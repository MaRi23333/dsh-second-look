/**
 * Second Look — two-tier low-distraction tool-execution review gate for
 * DeepSeek Harness. Derived from dsh-auto-review 0.15.0 (Apache-2.0); see
 * THIRD-PARTY-SOURCES.md for provenance and modifications.
 *
 * Stage status (docs/AUTO-REVIEW-IMPLEMENTATION-TASKS.md):
 * T02 action/evidence · T03 reviewer routes + two tiers + evidence loop ·
 * T04 pre-execute + guard + settlement + answerer routing (mounted here) ·
 * T05 change review · T06 privacy · T07 settings/audit UI.
 *
 * @module dsh-second-look
 */
import type { Context } from '@deepseek-ai/cordis'
import { resolveConfig, type Config } from './config.ts'
import { mountGate } from './gate/index.ts'
import { mountPermissionPresets } from './gate/register-presets.ts'

export const name = 'dsh-second-look'

/** Service injections: the host tools surface (pre-execute listener + guard). */
export const inject: readonly string[] = ['tools']

/**
 * Mount the gate: `tools/pre-execute` (recognize → classify → tiered review),
 * the `approval/request` answerer router (settle allow/deny, delegate
 * ask_user/failures to the human chain), the monotonic single-use guard and
 * the deny-feedback rewrite. Sessions outside the `second-look` preset keep
 * their native permission semantics.
 * @param ctx - the plugin context.
 * @param config - raw plugin config (resolved here; invalid config fails loud).
 * @returns the cleanup that unregisters everything this entry mounted.
 */
export function apply(ctx: Context, config: Config = {}): () => void {
  const gate = mountGate(ctx, resolveConfig(config))
  mountPermissionPresets(ctx)
  return ctx.effect(() => () => gate.dispose(), 'dsh-second-look: gate mounted (pre-execute + guard + answerer)')
}

export { AutoReviewRuntime } from './runtime.ts'
export type { DetailedAnswer, ReviewReceipt } from './runtime.ts'
export * from './cache.ts'
export * from './call-id.ts'
export * from './config.ts'
export * from './events.ts'
export * from './isolation.ts'
export * from './review.ts'
export * from './review-types.ts'
export * from './projection.ts'
export * from './projection-types.ts'
// T02: action recognition and evidence collection.
export * from './action/types.ts'
export * from './action/adapters.ts'
export * from './action/classify.ts'
export * from './evidence/sensitive.ts'
export * from './evidence/shell-signals.ts'
export * from './evidence/path-inspect.ts'
export * from './evidence/probe.ts'
export * from './evidence/context.ts'
export * from './evidence/requests.ts'
export * from './evidence/node-fs.ts'
export * from './tier.ts'
export * from './evidence-loop.ts'
export * from './gate/settlement.ts'
export * from './gate/preset.ts'
export * from './gate/ask-relay.ts'
export * from './gate/index.ts'
export * from './change/collect.ts'
export * from './change/batch.ts'
export * from './change/finalize.ts'
// T06: sensitive outbound detection, precise disclosure authorization and the
// llm/stream pre-send privacy guard.
export * from './privacy/detect.ts'
export * from './privacy/disclosure.ts'
export * from './privacy/outbound.ts'
// T07 + 部署后补: settings store, audit log and the loopback settings API
// (the data layer of the in-client settings panel; no HTML page, no command).
export * from './settings/audit.ts'
export * from './settings/persistence.ts'
export * from './settings/store.ts'
export * from './settings/http.ts'
