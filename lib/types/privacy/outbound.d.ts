import type { UiLanguage } from '../messages.js';
import type { DisclosureLedger, DisclosureScope } from './disclosure.js';
import { type OutboundScan } from './detect.js';
export type PrivacyOutcome = 'granted' | 'denied' | 'unavailable';
export interface PrivacyVerdict {
    outcome: PrivacyOutcome;
    reason: string;
}
/** Destination of one outbound request. */
export interface OutboundDestination {
    readonly provider: string;
    readonly model: string;
}
/** What the guard decided for one outbound event. */
export type OutboundAction = 'send' | 'send-granted' | 'review' | 'block-refused' | 'block-unsent' | 'send-redacted';
export interface OutboundDecision {
    readonly action: OutboundAction;
    readonly reason: string;
    readonly scope: DisclosureScope;
    readonly scan: OutboundScan;
}
/**
 * Run `fn` inside a review execution: outbound requests it makes are still
 * scanned, but a hit can never launch another privacy review.
 * @param fn - the review execution.
 * @returns the function result.
 */
export declare function runInReviewScope<T>(fn: () => Promise<T>, protectedSessionId?: string): Promise<T>;
/** Whether the current async context is inside a review execution. */
export declare function inReviewScope(): boolean;
/**
 * Decide one outbound event from its scan and the disclosure ledger.
 * @param scan - the scan result.
 * @param destination - the outbound route.
 * @param ledger - the disclosure ledger.
 * @param sessionId - audit association and disclosure scope.
 * @param language - language for user-facing reasons.
 * @param reviewing - whether this request is for a reviewer.
 * @returns the decision (never grants without an exact-scope record).
 */
export declare function decideOutbound(scan: OutboundScan, destination: OutboundDestination, ledger: DisclosureLedger, sessionId?: string, language?: UiLanguage, reviewing?: boolean): OutboundDecision;
/** One audit event from the guard (redacted; never raw secrets). */
export interface OutboundAuditEvent {
    readonly action: OutboundAction;
    readonly reviewing?: boolean;
    readonly reason: string;
    readonly destination: OutboundDestination;
    readonly dataFingerprint: string;
    readonly findingKinds: readonly string[];
    readonly requestRef: string;
    readonly at: number;
}
/** Dependencies of the outbound guard. */
export interface OutboundGuardDeps {
    readonly language?: () => UiLanguage;
    readonly ledger: DisclosureLedger;
    /**
     * Run ONE privacy review for a blocked outbound event (redacted evidence
     * only). Returns the disclosure outcome; `unavailable` keeps the request
     * unsent WITHOUT a sticky refusal.
     */
    requestPrivacyReview(scan: OutboundScan, destination: OutboundDestination, signal: AbortSignal | undefined, requestRef: string): Promise<PrivacyOutcome | PrivacyVerdict>;
    readonly restart?: (options: OutboundOptionsLike) => AsyncIterable<unknown>;
    readonly onEvent?: (event: OutboundAuditEvent) => void;
    /** Whether this work session uses Enhanced outbound privacy checks. */
    readonly isGatedRequest?: ((sessionId: string) => boolean) | undefined;
    /** Identify an active reviewer child even outside its async review scope. */
    readonly isReviewerRequest?: (sessionId: string) => boolean;
}
/** The structural options surface of `llm/stream` (T00 §6). */
export interface OutboundOptionsLike {
    readonly provider?: unknown;
    readonly model?: unknown;
    readonly messages?: unknown;
    readonly system?: unknown;
    readonly tools?: unknown;
    readonly attachments?: unknown;
    readonly signal?: AbortSignal | undefined;
    readonly sessionId?: unknown;
    readonly purpose?: unknown;
}
/**
 * Build the `llm/stream` listener. Internal failures never throw (a throw
 * kills the turn): they leave the request UNSENT and record why.
 * @param deps - ledger, privacy-review hook, audit sink.
 * @returns the async-generator listener.
 */
export declare function createOutboundGuard(deps: OutboundGuardDeps): (options: OutboundOptionsLike, next: () => AsyncIterable<unknown>) => AsyncIterable<unknown>;
/** Record a USER disclosure decision for one scope (from the human chain). */
export declare function recordUserDisclosure(ledger: DisclosureLedger, scope: DisclosureScope, granted: boolean, evidence: readonly string[], requestRef: string): void;
//# sourceMappingURL=outbound.d.ts.map