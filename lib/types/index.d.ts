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
import type { Context } from '@deepseek-ai/cordis';
import { type Config } from './config.js';
export declare const name = "dsh-second-look";
/** Service injections: the host tools surface (pre-execute listener + guard). */
export declare const inject: readonly string[];
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
export declare function apply(ctx: Context, config?: Config): () => void;
export { AutoReviewRuntime } from './runtime.js';
export type { DetailedAnswer, ReviewReceipt } from './runtime.js';
export * from './cache.js';
export * from './call-id.js';
export * from './config.js';
export * from './events.js';
export * from './isolation.js';
export * from './review.js';
export * from './review-types.js';
export * from './projection.js';
export * from './projection-types.js';
export * from './action/types.js';
export * from './action/adapters.js';
export * from './action/classify.js';
export * from './evidence/sensitive.js';
export * from './evidence/shell-signals.js';
export * from './evidence/path-inspect.js';
export * from './evidence/probe.js';
export * from './evidence/context.js';
export * from './evidence/requests.js';
export * from './evidence/node-fs.js';
export * from './tier.js';
export * from './evidence-loop.js';
export * from './gate/settlement.js';
export * from './gate/preset.js';
export * from './gate/ask-relay.js';
export * from './gate/index.js';
export * from './change/collect.js';
export * from './change/batch.js';
export * from './change/finalize.js';
export * from './privacy/detect.js';
export * from './privacy/disclosure.js';
export * from './privacy/outbound.js';
export * from './settings/audit.js';
export * from './settings/persistence.js';
export * from './settings/store.js';
export * from './settings/http.js';
//# sourceMappingURL=index.d.ts.map