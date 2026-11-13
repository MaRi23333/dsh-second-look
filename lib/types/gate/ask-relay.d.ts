import type { UiLanguage } from '../messages.js';
declare module '@deepseek-ai/dsh-llm/message' {
    interface MessageSourceMap {
        'second-look-relay': {
            kind: 'second-look-relay';
            form: 'notice';
            summary: string;
        };
    }
}
/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T04).
 *
 * The self-built ask relay for in-process subagents. The host locks subagent
 * approval policy to `never` (verified in T00 run10): a child's approval ask
 * is silently rejected at the service level and NEVER reaches the answerer
 * chain or a human. This module offers the only humane alternative: hand the
 * question to the PARENT session through the parent agent's verified
 * injection surface, and ALWAYS return "not executed" with correlation
 * information to the child — a relay attempt never authorizes execution by
 * itself.
 */
import type { EvidenceDisclosure } from '../action/types.js';
/** What the child needs to know about its unexecuted ask. */
export interface AskRelayRequest {
    readonly language?: UiLanguage;
    readonly callId: string;
    readonly toolName: string;
    /** The question the reviewer wanted a human to decide. */
    readonly question: string;
    /** Short reason/evidence summary (already redacted upstream). */
    readonly reason: string;
    readonly childSessionId: string;
}
/** The relay outcome recorded for audit/status. */
export interface AskRelayResult {
    /** Whether a parent-session handoff was attempted. */
    readonly relayed: boolean;
    /** Correlation line returned to the child (always present). */
    readonly correlation: string;
    readonly disclosures: readonly EvidenceDisclosure[];
}
/** The structural parent-agent injection surface (feature-detected). */
export interface ParentAgentLike {
    inject?(message: unknown): unknown;
    /** The parent's session (used for gate-scope checks). */
    readonly session?: unknown;
    /** The next link up the delegation lineage (grandparent), when present. */
    readonly parentAgent?: ParentAgentLike | undefined;
}
/**
 * Build the "not executed" answer for a child whose ask cannot be settled
 * here, and attempt the parent handoff when the injection surface exists.
 *
 * The rc.5 integration test verifies insertion into the parent inbox. Delivery
 * remains best-effort: insertion does not prove that a human saw or approved
 * the question, and inject does not wake an idle parent.
 * @param parent - the parent agent handle, when the execution exposes one.
 * @param request - the relay content.
 * @returns the relay result (correlation always, relayed flag when attempted).
 */
export declare function relayAskToParent(parent: ParentAgentLike | undefined, request: AskRelayRequest): AskRelayResult;
//# sourceMappingURL=ask-relay.d.ts.map