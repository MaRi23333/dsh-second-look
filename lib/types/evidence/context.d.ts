import type { SessionEvent } from '@deepseek-ai/dsh-session';
import type { TrustedUserContext } from '../action/types.js';
import type { ContextBudgetConfig } from '../config.js';
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
export interface ToolReviewContext {
    readonly disabled: boolean;
    readonly instructions: TrustedUserContext;
    readonly previousReply?: string | undefined;
    readonly relatedResults: readonly string[];
    readonly evidenceOmitted: boolean;
}
interface ContextCall {
    readonly name: string;
    readonly callId: string;
    readonly arguments: unknown;
    readonly targetPaths: readonly string[];
    readonly parentSessionId?: string | undefined;
}
/** Select decision evidence from the same session snapshot as the pending call. */
export declare function buildToolReviewContext(events: readonly SessionEvent[], budget: ContextBudgetConfig, call: ContextCall): ToolReviewContext;
export {};
//# sourceMappingURL=context.d.ts.map