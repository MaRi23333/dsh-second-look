/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T02).
 *
 * Tool adapter table: maps one tool call's name and arguments onto the
 * unified-action vocabulary — effect, sub-operation, raw targets — WITHOUT
 * deciding anything. Sub-operations of one tool are recognized separately
 * (e.g. edit's replace vs create); an unrecognized tool maps to `unknown`,
 * which the classifier always sends to review.
 */
import type { ActionEffect, ActionOrigin, RiskSignal } from './types.js';
/** What the adapter extracts from one call's arguments. */
export interface RecognizedCall {
    readonly effect: ActionEffect;
    readonly subOperation?: string;
    /** Path arguments as written (raw evidence; resolution is the evidence layer's job). */
    readonly rawPaths: readonly string[];
    /** Argument-level signals (shell patterns, empty-content markers, egress verbs). */
    readonly signals: readonly RiskSignal[];
    /** For shell calls: the command text (evidence, redacted before review). */
    readonly commandText?: string;
}
export interface RecognizeOptions {
    /**
     * MCP adapters the user has explicitly verified (task-doc rule: an MCP
     * read-only CLAIM is not enough; only verified adapters may be exempted).
     * Maps `mcp__<server>__<tool>` to the effect the verification established.
     */
    readonly verifiedMcpTools?: Readonly<Record<string, ActionEffect>>;
}
/**
 * Recognize one tool call.
 * @param toolName - the registered tool name.
 * @param args - the host-frozen argument snapshot (read-only here).
 * @param options - adapter options (verified MCP adapters).
 * @returns the normalized extraction; `effect: 'unknown'` for unrecognized tools.
 */
export declare function recognizeCall(toolName: string, args: unknown, options?: RecognizeOptions): RecognizedCall;
/** Origins implied by the call shape (the pipeline also knows from `parent`). */
export declare function originOf(toolName: string, isPtcInner: boolean): ActionOrigin;
//# sourceMappingURL=adapters.d.ts.map