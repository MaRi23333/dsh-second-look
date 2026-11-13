import type { UiLanguage } from '../messages.js';
/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T05).
 *
 * The restricted `second_look_finalize` tool: before delivery, re-collect the
 * remaining changes and report four honest buckets — reviewed, pending,
 * explicitly user-allowed, and coverage gaps — plus the named paths the
 * batch cannot compare (binary/over-budget/manual runs). The host has NO
 * end-of-turn hook (T00 §7), so the tool description instructs the agent to
 * call this before delivering; "the final reply was sent" is never treated as
 * review success. Any later modification invalidates a previous finalize:
 * the report is a snapshot of THIS call, and re-running recomputes it.
 */
import type { ProbeFileSystem } from '../evidence/probe.js';
import { type GitRunner } from './collect.js';
import { BatchLedger, type BatchReviewRecord } from './batch.js';
import type { ReviewTier } from '../tier.js';
/** The four-bucket finalize report. */
export interface FinalizeReport {
    /** Files covered by a still-valid batch review right now. */
    readonly reviewed: readonly string[];
    /** Changed files with NO valid review (must be reviewed or explicitly allowed). */
    readonly pending: readonly string[];
    /** Actions the USER explicitly allowed (per-action; never a batch pardon). */
    readonly userAllowed: readonly string[];
    /** Coverage gaps: binary/over-budget files, manual runs, non-git blind spots. */
    readonly gaps: readonly string[];
    /** True only when `pending` is empty (gaps are always reported regardless). */
    readonly completed: boolean;
    readonly collectedAt: number;
}
/** What the finalize collection needs. */
export interface FinalizeInputs {
    readonly language?: () => UiLanguage;
    readonly enabled?: boolean | undefined;
    readonly fs: ProbeFileSystem;
    /** Observed change targets (write/edit seen at pre-execute). */
    readonly observedPaths: ReadonlySet<string>;
    readonly ledger: BatchLedger;
    readonly tier: ReviewTier;
    readonly configVersion: string;
    readonly cwd: string | undefined;
    /** Human-allowed action labels (tool + call id), newest first. */
    readonly userAllowedActions: readonly string[];
    readonly signal?: AbortSignal | undefined;
    /** Git surface for git projects (missing → observed-changes fallback). */
    readonly git?: GitRunner | undefined;
    /** Per-execution scope override (session tier / cwd / current allow list). */
    readonly resolve?: ((exec: {
        agent?: {
            session?: unknown;
        };
    }) => Partial<FinalizeInputs>) | undefined;
}
/**
 * Collect the finalize report: re-hash observed changes NOW, check every
 * stored batch by content, and sort each file into reviewed/pending.
 * @param inputs - the collection inputs.
 * @returns the four-bucket report.
 */
export declare function collectFinalizeReport(inputs: FinalizeInputs): Promise<FinalizeReport>;
/**
 * Render the report for the model/user (the tool result text).
 * @param report - the report.
 * @returns the text.
 */
export declare function renderFinalizeReport(report: FinalizeReport, language?: UiLanguage): string;
/** The `second_look_finalize` tool definition payload for `ctx.tools.register`. */
export interface FinalizeToolDeps extends FinalizeInputs {
    /** Called after a successful collection (status/audit hook). */
    readonly onCollected?: (report: FinalizeReport) => void;
}
/**
 * Build the restricted finalize tool definition (no side effects beyond
 * reading; its result is the report).
 * @param deps - collection inputs and optional hook.
 * @returns the tool definition for `ctx.tools.register`.
 */
export declare function buildFinalizeTool(deps: FinalizeToolDeps): {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    output: {
        schema: Record<string, unknown>;
        render: (args: unknown, value: unknown) => {
            type: 'text';
            text: string;
        }[];
    };
    execute: (args: unknown, exec: {
        signal?: AbortSignal | undefined;
    }) => Promise<unknown>;
};
/** Human-allowed action labels derived from a batch record (audit helper). */
export declare function userAllowedLabel(record: BatchReviewRecord, callId: string): string;
//# sourceMappingURL=finalize.d.ts.map