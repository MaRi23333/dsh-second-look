/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T03).
 *
 * The two-tier review loop: run the reviewer, and on `need_evidence` execute
 * the reviewer's RESTRICTED local probes ourselves (stat/read/search/diff
 * through {@link runProbe} — never a shell, never the network, never parent
 * session tools) and feed the redacted, bounded results into the next round.
 * Budgets are per tier (daily 1 round, strict 3 by default) with one total
 * deadline per review. Cancel is immediate and terminal (never re-routed to a
 * human); only timeout, internal error, invalid structure or budget exhaustion
 * produce an explainable human-handoff failure — never a silent allow and
 * never a switch to the main model.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ResolvedConfig } from './config.js';
import type { ReviewRequest } from './review-types.js';
import type { ReviewerChildren } from './isolation.js';
import { type OverrideContext, type ReviewerVerdict, type ReviewResolution } from './review.js';
import { type ReviewTier } from './tier.js';
import { type ProbeFileSystem } from './evidence/probe.js';
/** Execution-side dependencies of the loop (the probe surface and the clock). */
export interface EvidenceLoopDeps {
    /** The restricted probe filesystem (see `createNodeProbeFs`). */
    readonly fs: ProbeFileSystem;
    /** Injectable clock for tests; defaults to `Date.now`. */
    readonly now?: () => number;
}
/** Options for one tiered review. */
export interface TieredReviewOptions {
    /** The tier to review under; defaults to `config.tiers.defaultTier`. */
    readonly tier?: ReviewTier;
    /** A pending human one-shot override, when one applies. */
    readonly override?: OverrideContext;
    /** Strict-tier change-batch context to review together with the action. */
    readonly batch?: string | undefined;
}
/** The closed result of one tiered review. */
export interface TieredReviewResult {
    readonly resolution: ReviewResolution;
    /** Evidence rounds consumed (0 when the reviewer never asked). */
    readonly rounds: number;
    /** The prompt version stamp actually used (for audit). */
    readonly promptVersion: string;
    readonly tier: ReviewTier;
}
/**
 * Run one tiered review with the restricted evidence loop.
 * @param ctx - the plugin context (the reviewer seams are feature-detected).
 * @param config - the resolved plugin config.
 * @param request - the neutral review request (parent, signal, evidence).
 * @param reviewerSessions - the reviewer-child registry.
 * @param deps - the probe filesystem and clock.
 * @param options - tier selection and optional override.
 * @returns the verdict or the explainable failure, plus loop accounting.
 */
export declare function runReviewWithEvidence(ctx: Context, config: ResolvedConfig, request: ReviewRequest, reviewerSessions: ReviewerChildren, deps: EvidenceLoopDeps, options?: TieredReviewOptions): Promise<TieredReviewResult>;
/** Narrow helper: the verdict side of a successful tiered review. */
export declare function tieredVerdict(result: TieredReviewResult): ReviewerVerdict | undefined;
//# sourceMappingURL=evidence-loop.d.ts.map