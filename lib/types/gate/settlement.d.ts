import type { UiLanguage } from '../messages.js';
/** The execution-instance identity an allow is bound to. */
export interface ExecutionIdentity {
    /** The host execution token (deep-frozen, per-call). */
    readonly token: unknown;
    readonly callId: string;
    readonly rootCallId: string | undefined;
    readonly sessionId: string;
    readonly toolName: string;
    /** Digest of the frozen arguments (local-only; never logged raw). */
    readonly argHash: string;
    /** The gate configuration revision the decision was made under. */
    readonly configVersion: string;
}
/** Who produced the allow — for audit and status. */
export type DecidedBy = 'exempt' | 'reviewer' | 'human' | 'fallback';
/** The real approval outcome vocabulary (host `ApprovalOutcome`). */
export type SettlementOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable';
/** One ledger entry. */
export interface SettlementEntry {
    readonly identity: ExecutionIdentity;
    /** Bound on settle; mutable because settle fills it in after `record`. */
    decidedBy: DecidedBy;
    outcome: SettlementOutcome;
    readonly at: number;
    /** Burned by the guard on first pass. */
    consumed: boolean;
    /** Invalidated entries can never pass the guard. */
    invalidated: boolean;
    invalidationReason?: string;
}
/** Guard verification result. */
export type GuardVerdict = {
    readonly ok: true;
    readonly decidedBy: DecidedBy;
} | {
    readonly ok: false;
    readonly reason: string;
};
/**
 * Digest the frozen call arguments. The digest proves immutability across
 * witnesses (pre-execute vs guard) without keeping raw arguments around;
 * sensitive values never leave the local process through it.
 * @param args - the frozen arguments.
 * @returns sha256 hex digest (32 chars) or a marker for unserializable input.
 */
export declare function argsDigest(args: unknown): string;
/**
 * The settlement ledger. One instance per mounted gate.
 *
 * Consumed and invalidated entries are kept as bounded TOMBSTONES so a second
 * pass reports WHY it fails ("already consumed" / "invalidated (reason)")
 * instead of a flat "no record"; the map is FIFO-capped at
 * {@link TOMBSTONE_CAP} entries to bound memory in long sessions.
 */
export declare class SettlementMap {
    /** callId → entry. A call id settles at most once, ever. */
    private readonly entries;
    /**
     * Record a pending execution at pre-execute time (identity binding).
     * @param identity - the execution identity.
     */
    record(identity: ExecutionIdentity): void;
    /**
     * Bind a real approval outcome to the recorded execution. A settle for an
     * unknown, consumed or invalidated call id is IGNORED (late results can
     * never resurrect a cancelled call).
     * @param callId - the settled call.
     * @param toolName - the tool the approval chain settled (checked against the record).
     * @param outcome - the real host outcome.
     * @param decidedBy - who decided.
     * @returns true when the settle was applied.
     */
    settle(callId: string, toolName: string, outcome: SettlementOutcome, decidedBy: DecidedBy): boolean;
    /**
     * Guard-side verification: exactly one pass for one bound, settled
     * execution. Every mismatch is named in the reason (evidence for the deny).
     * @param identity - the identity of the execution about to dispatch.
     * @returns pass (and burns the entry) or a deny reason.
     */
    verifyAndConsume(identity: ExecutionIdentity, language?: UiLanguage): GuardVerdict;
    /**
     * Invalidate one call's entry (cancellation, late teardown). The tombstone
     * keeps the invalidation reason for the guard's diagnostic.
     * @param callId - the call.
     * @param reason - audit-visible reason.
     */
    invalidate(callId: string, reason: string): void;
    /**
     * Invalidate every entry of one session (session end).
     * @param sessionId - the session.
     * @param reason - audit-visible reason.
     */
    invalidateSession(sessionId: string, reason: string): void;
    /**
     * Invalidate everything (config version bump, tier/route/policy change,
     * plugin disposal).
     * @param reason - audit-visible reason.
     */
    invalidateAll(reason: string): void;
    /** How many entries are pending (status surface). */
    get size(): number;
    /** Whether a call id currently has a live entry (test/status helper). */
    has(callId: string): boolean;
}
//# sourceMappingURL=settlement.d.ts.map