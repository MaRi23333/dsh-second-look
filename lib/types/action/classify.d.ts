/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T02).
 *
 * The exemption classifier: decides which calls skip the reviewer ("普通文件
 * 读写通常免审") and which are sent to review, from deterministic recognition
 * plus observed target state. It never grants anything it cannot establish:
 * an unknown scope, an unverified adapter or an unrecognized tool is review.
 *
 * Tier difference: `daily` exempts ordinary network reads (search/fetch);
 * `strict` reviews them. Execution, delegation and unknown tools are always
 * reviewed (task-doc: 执行类操作是审核重点).
 */
import type { RiskSignal, ReviewTier, UnifiedAction } from './types.js';
export interface Classification {
    readonly disposition: 'exempt' | 'review';
    /** Refined signals (candidate signals may be dropped when state disproves them). */
    readonly signals: readonly RiskSignal[];
    /** Short human-readable reasons for the audit log and status UI. */
    readonly reasons: readonly string[];
}
/**
 * Classify one action.
 * @param action - the unified action with local arguments and target states.
 * @returns the disposition and the refined signals/reasons.
 */
export declare function classifyAction(action: UnifiedAction, tier?: ReviewTier): Classification;
//# sourceMappingURL=classify.d.ts.map