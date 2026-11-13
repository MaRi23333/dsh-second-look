/**
 * Neutral review-request input (T01 decoupling).
 *
 * The review service judges a pending action through this shape instead of the
 * host's `approval/request` type, so the unified-action pipeline (T02+) can
 * feed it from any entry point (native tools, PTC inner dispatch, MCP tools,
 * subagent calls) and the change-batch reviewer (T05) can feed code batches.
 *
 * Derived from dsh-auto-review 0.15.0 (Apache-2.0); the upstream code typed
 * these inputs as `ApprovalRequest` — this module replaces that coupling.
 */
import type { Session } from '@deepseek-ai/dsh-session';
import type { CallId } from './call-id.js';
/**
 * The closed four-verdict vocabulary (T03): the reviewer's structured output
 * is exactly one of these states; the plugin executes the state locally and
 * never runs the model's free-text suggestions. `need_evidence` requests only
 * restricted local probes; `ask_user` hands one decision to a human.
 */
export type ReviewerDecision = 'allow' | 'ask_user' | 'deny' | 'need_evidence';
/**
 * The host-side identity the reviewer needs: the asking session (audit events,
 * workspace root, reviewer route) and the parent handle for reviewer children.
 */
export interface ReviewRequestAgent {
    readonly session: Session;
}
/** One pending action awaiting a review verdict. */
export interface ReviewRequest {
    /** The tool name shown to the reviewer. */
    readonly toolName: string;
    /** The host execution call id, used to pull the frozen arguments from the session log. */
    readonly callId?: CallId | undefined;
    /** Actual immutable execution arguments, including PTC inner calls. */
    readonly arguments?: unknown;
    readonly cwd?: string | undefined;
    /** Why the gate asked (our own reason text), when one applies. */
    readonly reason?: string | undefined;
    /** Cancellation: the caller's or the gate's lifetime signal. */
    readonly signal?: AbortSignal | undefined;
    /** The asking agent (see {@link ReviewRequestAgent}). */
    readonly agent: ReviewRequestAgent;
}
//# sourceMappingURL=review-types.d.ts.map