/**
 * Modified for dsh-second-look, 2026-10-31 (T02).
 *
 * Trusted user-context assembly with provenance, adapted from the local fork
 * `dsh-heavy-approval/src/review-context.ts` (workspace-local source, reused
 * with attribution; see THIRD-PARTY-SOURCES.md).
 *
 * Task-doc rule: model claims, tool outputs and repository instructions are
 * EVIDENCE, never authorization. Only messages whose source is a real user
 * (or a direct parent instruction) enter the trusted context, each labelled
 * with where it came from; budgets are spent newest-first and any cut is
 * disclosed, never silent.
 */
import type { TrustedUserContext } from '../action/types.js';
/** The minimal message shape the partitioner reads. */
export interface ContextMessage {
    readonly role: string;
    readonly source: {
        readonly kind: string;
        readonly senderSessionId?: string;
    };
    readonly text: string;
}
export interface BuildUserContextOptions {
    /** Max entries kept (newest first). Default 8. */
    readonly maxEntries?: number;
    /** Total character budget across entries. Default 48000. */
    readonly maxChars?: number;
    /** The direct parent session, for `direct-parent-instruction` attribution. */
    readonly parentSessionId?: string | undefined;
}
/**
 * Whether a message is a real direct user instruction (the only kind that can
 * authorize anything) or a direct parent-agent instruction to a child.
 */
export declare function isTrustedInstruction(message: ContextMessage, parentSessionId?: string): 'user' | 'parent-instruction' | undefined;
/**
 * Assemble the trusted user context from a message list (newest last).
 * @param messages - the candidate messages (already scoped to the task).
 * @param options - budgets and the parent session identity.
 * @returns labelled entries with honest omission flags.
 */
export declare function buildUserContext(messages: readonly ContextMessage[], options?: BuildUserContextOptions): TrustedUserContext;
//# sourceMappingURL=context.d.ts.map