/**
 * Modified for dsh-second-look, 2026-10-31 (T01 migration; see THIRD-PARTY-SOURCES.md).
 * Durable session vocabulary for `dsh-auto-review`: the `autoReview/state`
 * per-session override, the `autoReview/verdict` audit event, and the pure
 * folds that read them back from a session log.
 *
 * The model-visible ⟺ logged invariant holds by construction: the verdict is
 * log-only (UI-auditable, never in the model transcript), and the only
 * model-visible auto-review content is the deny reason injected into the
 * denied call's `tool/result`, which carries the `reviewId` marker that links
 * it back to this event.
 * @module dsh-auto-review/events
 */
import type { Branded } from '@deepseek-ai/dsh-brand';
import type { CallId } from './call-id.js';
import type { SessionEvent, SessionEventMap, SessionId } from '@deepseek-ai/dsh-session';
import type { ApprovalOutcome, ApprovalRequestId } from '@deepseek-ai/dsh-user-approval';
import type { CircuitAction, RiskLevel } from './config.js';
import type { ReviewerDecision } from './review-types.js';
declare module '@deepseek-ai/dsh-session/types' {
    interface SessionEventMap {
        /**
         * The session's auto-review switch — log-only, durable, replayable, last
         * event wins (like `approval/policy`). The `/auto-review` command writes
         * it; absent means the configured `enableByDefault`.
         */
        'autoReview/state': {
            enabled: boolean;
        };
        /**
         * One auto-review decision — log-only audit. `approvalId` links back to
         * the `approval/asked` event and forward to the `approval/decided` pair,
         * completing the reconstruction chain. `resolution` distinguishes a real
         * reviewer verdict (`decision`/`reason`/`riskLevel` present, `fallback`
         * absent) from a fallback (the converse). `outcome` is present only when
         * the answerer claimed the request; a `delegate` fallback omits it
         * because the chain continues downstream.
         */
        'autoReview/verdict': {
            reviewId: AutoReviewVerdictId;
            approvalId: ApprovalRequestId;
            toolName: string;
            callId?: CallId;
            provider: string;
            model?: string;
            reviewerSessionId?: SessionId;
            durationMs: number;
            decision?: ReviewerDecision;
            reason?: string;
            riskLevel?: RiskLevel;
            outcome?: ApprovalOutcome;
            fallback?: AutoReviewFallback;
            error?: string;
            /**
             * Present when the reviewer ALLOWED but the verdict did not settle the
             * request: the risk policy overrode the allow (the request delegated to
             * the human chain, or was deterministically denied per `onHighRisk`).
             * A risk-policy override never carries `outcome: 'allowed-once'`.
             */
            escalation?: 'risk-policy';
            /**
             * Present when this verdict was replayed from the same-fingerprint
             * cache (no reviewer subagent ran): decision/reason/riskLevel were
             * copied from a recent identical `tool + arguments` verdict within
             * `verdictCacheTtlMs`. A cached verdict still settles exactly like a
             * real one (risk policy, circuit breaker, deny feedback all apply).
             */
            cached?: true;
        };
        /**
         * The rejection circuit breaker tripped — log-only audit, once per turn.
         * `circuitId` links the injected circuit-rejection marker back here.
         */
        'autoReview/circuit': {
            circuitId: AutoReviewCircuitId;
            action: CircuitAction;
            trip: {
                kind: 'consecutive' | 'window';
                count: number;
            };
            toolName: string;
        };
        /**
         * A human one-shot override: the user explicitly authorized ONE retry of
         * a previously denied action (the referenced deny verdict). Log-only;
         * consumed by the next same-tool review within `overrideTtlMs`.
         */
        'autoReview/override': {
            reviewId: AutoReviewVerdictId;
            toolName: string;
        };
        /**
         * A deterministic hard-disable rejection (`never` policy): a risk rule or
         * the tool policy table refused the request BEFORE any reviewer ran, and
         * the answerer settled `rejected`. Log-only audit; `rejectionId` links the
         * injected `[auto-review-never]` feedback text back here. `approvalId` is
         * present whenever the pending `approval/asked` event could be correlated
         * (like verdicts, at most one verdict-or-rejection exists per asked).
         */
        'autoReview/rejection': {
            rejectionId: AutoReviewRejectionId;
            approvalId?: ApprovalRequestId;
            toolName: string;
            callId?: CallId;
            /** Why the request was hard-disabled (the matched risk rule or policy table entry). */
            reason: string;
            outcome: 'rejected';
        };
    }
}
/**
 * `Session.append` narrowed to the `autoReview/state` event. The options bag
 * exists only on host builds that expose the `ignorable` envelope-marker
 * surface (post-rc.6 `@deepseek-ai/dsh-session`); an rc.6 host accepts and
 * ignores the third argument, appending the identical event without the
 * marker — no behavior change, no failure either way.
 */
export type StateAppend = (type: 'autoReview/state', data: SessionEventMap['autoReview/state'], options?: {
    ignorable?: true;
}) => unknown;
/**
 * `Session.append` narrowed to the `autoReview/verdict` event — same
 * `ignorable`-marker contract as {@link StateAppend}.
 */
export type VerdictAppend = (type: 'autoReview/verdict', data: SessionEventMap['autoReview/verdict'], options?: {
    ignorable?: true;
}) => unknown;
/** `Session.append` narrowed to the `autoReview/circuit` event — same contract as {@link VerdictAppend}. */
export type CircuitAppend = (type: 'autoReview/circuit', data: SessionEventMap['autoReview/circuit'], options?: {
    ignorable?: true;
}) => unknown;
/** `Session.append` narrowed to the `autoReview/override` event — same contract as {@link VerdictAppend}. */
export type OverrideAppend = (type: 'autoReview/override', data: SessionEventMap['autoReview/override'], options?: {
    ignorable?: true;
}) => unknown;
/** `Session.append` narrowed to the `autoReview/rejection` event — same contract as {@link VerdictAppend}. */
export type RejectionAppend = (type: 'autoReview/rejection', data: SessionEventMap['autoReview/rejection'], options?: {
    ignorable?: true;
}) => unknown;
/**
 * Why the answerer had no reviewer verdict — the closed fallback vocabulary.
 * (T03) `budget` added: the evidence-round budget exhausted — an explainable
 * human-handoff failure alongside timeout/unavailable/schema, never a grant.
 */
export type AutoReviewFallback = 'timeout' | 'cancelled' | 'unavailable' | 'schema' | 'budget';
/** The reviewer child's durable session identity, as recorded in verdict events. */
export type ReviewerSessionId = SessionId;
/** Closed {@link AutoReviewFallback} list for runtime normalization. */
export declare const AUTO_REVIEW_FALLBACKS: readonly AutoReviewFallback[];
/** Identifies one `autoReview/verdict` audit event. */
export type AutoReviewVerdictId = Branded<'AutoReviewVerdictId'>;
/** Identifies one `autoReview/circuit` audit event. */
export type AutoReviewCircuitId = Branded<'AutoReviewCircuitId'>;
/** Identifies one `autoReview/rejection` audit event. */
export type AutoReviewRejectionId = Branded<'AutoReviewRejectionId'>;
/**
 * Brand a string as an {@link AutoReviewVerdictId}.
 * @param id - the raw id string.
 * @returns the same string, branded (a compile-time cast — no runtime cost).
 */
export declare function AutoReviewVerdictId(id: string): AutoReviewVerdictId;
/**
 * Brand a string as an {@link AutoReviewCircuitId}.
 * @param id - the raw id string.
 * @returns the same string, branded (a compile-time cast — no runtime cost).
 */
export declare function AutoReviewCircuitId(id: string): AutoReviewCircuitId;
/**
 * Brand a string as an {@link AutoReviewRejectionId}.
 * @param id - the raw id string.
 * @returns the same string, branded (a compile-time cast — no runtime cost).
 */
export declare function AutoReviewRejectionId(id: string): AutoReviewRejectionId;
/** Stable marker prefix inside every injected deny reason, parsed by the invariant companion. */
export declare const DENY_MARKER = "[auto-review]";
/** Regex extracting the reviewId from an injected deny reason. */
export declare const DENY_MARKER_PATTERN: RegExp;
/** Stable marker prefix inside every injected fallback rejection text (a distinct vocabulary from {@link DENY_MARKER}). */
export declare const FALLBACK_MARKER = "[auto-review-fallback]";
/** Regex extracting the reviewId from an injected fallback rejection. */
export declare const FALLBACK_MARKER_PATTERN: RegExp;
/** Stable marker prefix inside every injected circuit rejection text. */
export declare const CIRCUIT_MARKER = "[auto-review-circuit]";
/** Regex extracting the circuitId and tool name from an injected circuit rejection. */
export declare const CIRCUIT_MARKER_PATTERN: RegExp;
/** Stable marker prefix inside every injected hard-disable (`never`) rejection text. */
export declare const NEVER_MARKER = "[auto-review-never]";
/** Regex extracting the rejectionId and tool name from an injected never rejection. */
export declare const NEVER_MARKER_PATTERN: RegExp;
/**
 * Build the model-visible deny text injected into a denied tool result. The
 * embedded reviewId is what makes the model-visible text reconstructable
 * from the session log (model-visible ⟺ logged).
 * @param reviewId - the verdict event's id.
 * @param toolName - the denied tool.
 * @param reason - the reviewer's reason (already truncated).
 * @returns the exact error text shown to the model.
 */
export declare function denyResultText(reviewId: AutoReviewVerdictId, toolName: string, reason: string): string;
/**
 * Build the model-visible text injected into a tool result whose review
 * failed and was rejected by the fallback policy. The embedded reviewId
 * links it to the recorded fallback verdict (model-visible ⟺ logged).
 * @param reviewId - the fallback verdict event's id.
 * @param fallback - the failure category (timeout/unavailable/schema).
 * @param error - the failure detail (already truncated upstream).
 * @returns the exact error text shown to the model.
 */
export declare function fallbackResultText(reviewId: AutoReviewVerdictId, fallback: AutoReviewFallback, error: string): string;
/**
 * Build the model-visible text injected into a tool result rejected by a
 * tripped circuit breaker. The embedded circuitId links it to the recorded
 * `autoReview/circuit` event (model-visible ⟺ logged).
 * @param circuitId - the circuit event's id.
 * @param toolName - the rejected tool.
 * @param explanation - why the breaker rejects (trip kind and count).
 * @returns the exact error text shown to the model.
 */
export declare function circuitResultText(circuitId: AutoReviewCircuitId, toolName: string, explanation: string): string;
/**
 * Build the model-visible text injected into a tool result rejected by a
 * `never` policy (a hard disable: risk rule or tool-policy table entry). The
 * embedded rejectionId links it to the recorded `autoReview/rejection` event
 * (model-visible ⟺ logged).
 * @param rejectionId - the rejection event's id.
 * @param toolName - the hard-disabled tool.
 * @param source - which rule or policy entry disabled it.
 * @returns the exact error text shown to the model.
 */
export declare function neverResultText(rejectionId: AutoReviewRejectionId, toolName: string, source: string): string;
/**
 * Marker-free deny text for hosts whose `Session.append` cannot stamp the
 * audit envelope (`ignorable` dropped — the rc.6 line): the audit event is
 * skipped to keep the log loadable, so the injected text must not embed an
 * id marker. The text itself becomes the logged tool result, which keeps
 * model-visible ⟺ logged.
 * @param toolName - the denied tool.
 * @param reason - the reviewer's reason (already truncated).
 * @returns the exact error text shown to the model.
 */
export declare function plainDenyResultText(toolName: string, reason: string): string;
/**
 * Marker-free fallback text for hosts whose audit envelope cannot be
 * written (see {@link plainDenyResultText}).
 * @param fallback - the failure category.
 * @param error - the failure detail.
 * @returns the exact error text shown to the model.
 */
export declare function plainFallbackResultText(fallback: AutoReviewFallback, error: string): string;
/**
 * Marker-free circuit text for hosts whose audit envelope cannot be
 * written (see {@link plainDenyResultText}); the breaker itself still runs
 * from the in-memory mirror.
 * @param toolName - the rejected tool.
 * @param explanation - why the breaker rejects (trip kind and count).
 * @returns the exact error text shown to the model.
 */
export declare function plainCircuitResultText(toolName: string, explanation: string): string;
/**
 * Marker-free hard-disable text for hosts whose audit envelope cannot be
 * written (see {@link plainDenyResultText}).
 * @param toolName - the hard-disabled tool.
 * @param source - which rule or policy entry disabled it.
 * @returns the exact error text shown to the model.
 */
export declare function plainNeverResultText(toolName: string, source: string): string;
/**
 * The session's auto-review override: the last `autoReview/state` event, or
 * `undefined` when the session never switched (callers apply the configured
 * `enableByDefault`). The pure fold — replay IS the state.
 * @param events - session events in log order (other types are skipped).
 * @returns the enabled flag of the last switch, or undefined without one.
 */
export declare function effectiveAutoReviewState(events: readonly SessionEvent[]): boolean | undefined;
/**
 * The verdict events inside the session's CURRENT open turn, oldest first.
 * A turn without `turn/start` (or one already closed by `turn/end`) yields
 * an empty list.
 * @param events - session events in log order.
 * @returns the open turn's verdict payloads.
 */
export declare function openTurnVerdicts(events: readonly SessionEvent[]): SessionEventMap['autoReview/verdict'][];
/**
 * How many REAL AI verdicts the session's CURRENT open turn has consumed.
 * Fallback verdicts do not count: they are budgeted separately by
 * {@link autoReviewFailuresInOpenTurn}, so a failing reviewer does not eat
 * the AI-decision budget. A turn without `turn/start` (or one already closed
 * by `turn/end`) counts zero.
 * @param events - session events in log order.
 * @returns the decision-carrying verdict count inside the current open turn.
 */
export declare function autoReviewsInOpenTurn(events: readonly SessionEvent[]): number;
/**
 * How many reviewer FAILURES the session's CURRENT open turn has consumed —
 * `autoReview/verdict` events carrying a fallback other than `cancelled`
 * (a user withdrawal is not a reviewer failure). The answerer delegates once
 * the budget is exhausted so a broken reviewer costs one timeout instead of
 * `maxFailuresPerTurn` of them.
 * @param events - session events in log order.
 * @returns the failure count inside the current open turn.
 */
export declare function autoReviewFailuresInOpenTurn(events: readonly SessionEvent[]): number;
/**
 * Whether a verdict is a denial of the request: a reviewer deny, or an allow
 * overridden by the risk policy (`escalation: 'risk-policy'` with the deny
 * outcome). The circuit breaker and the approve list count both.
 * @param data - the verdict payload.
 * @returns true when the request was denied.
 */
export declare function isDenial(data: SessionEventMap['autoReview/verdict']): boolean;
/**
 * The trailing run of consecutive denials in the current open turn —
 * the circuit breaker's `consecutiveDenies` signal.
 * @param events - session events in log order.
 * @returns the length of the trailing denial run.
 */
export declare function consecutiveDeniesInOpenTurn(events: readonly SessionEvent[]): number;
/**
 * How many of the last {@link windowSize} decision verdicts in the current
 * open turn are denials — the circuit breaker's `windowDenies` signal.
 * @param events - session events in log order.
 * @param windowSize - how many recent verdicts the window counts.
 * @returns the denial count inside the window.
 */
export declare function deniesInRecentVerdicts(events: readonly SessionEvent[], windowSize: number): number;
/**
 * The current open turn's circuit trip, when one was recorded.
 * @param events - session events in log order.
 * @returns the last `autoReview/circuit` payload in the open turn, or undefined.
 */
export declare function circuitInOpenTurn(events: readonly SessionEvent[]): SessionEventMap['autoReview/circuit'] | undefined;
/** One recent deny verdict, as the approve command lists them. */
export interface RecentDeny {
    readonly reviewId: AutoReviewVerdictId;
    readonly toolName: string;
    readonly reason?: string;
    readonly riskLevel?: RiskLevel;
}
/**
 * The most recent deny verdicts, newest first — the `/auto-review approve`
 * candidate list.
 * @param events - session events in log order.
 * @param limit - how many to collect.
 * @returns up to {@link limit} deny verdicts, newest first.
 */
export declare function lastDeniedVerdicts(events: readonly SessionEvent[], limit: number): RecentDeny[];
/**
 * Whether a human one-shot override is pending for a tool: the latest
 * `autoReview/override` for the tool is still unconsumed (no verdict for the
 * tool after it) and unexpired. An override is consumed by the NEXT
 * same-tool review regardless of its decision — single-use by construction.
 * @param events - session events in log order.
 * @param toolName - the tool an approval request is about.
 * @param ttlMs - the override lifetime.
 * @param now - the current epoch milliseconds.
 * @returns the overridden deny verdict's id, or undefined without a pending override.
 */
export declare function activeOverride(events: readonly SessionEvent[], toolName: string, ttlMs: number, now: number): AutoReviewVerdictId | undefined;
/** Cumulative review statistics folded from the session log (status command). */
export interface ReviewStats {
    readonly allows: number;
    readonly denies: number;
    readonly fallbacks: number;
    /** Hard-disable (`never` policy) rejections — no reviewer ran for these. */
    readonly rejections: number;
    /** Mean duration of decision-carrying verdicts, rounded; 0 without any. */
    readonly avgDurationMs: number;
    /** The last three verdicts, newest first. */
    readonly recent: readonly SessionEventMap['autoReview/verdict'][];
}
/**
 * Fold one session's review statistics: verdict counts, never-rejection
 * count, mean duration, and the three most recent verdicts.
 * @param events - session events in log order.
 * @returns the statistics.
 */
export declare function reviewStats(events: readonly SessionEvent[]): ReviewStats;
/**
 * Correlate a pending approval request with the `approval/asked` event the
 * service just appended. The service appends the asked event synchronously
 * before waterfall dispatch, so the matching event is the last unpaired
 * asked event whose call id (or, without one, tool name) matches the request.
 * @param events - session events in log order.
 * @param toolName - the request's tool name.
 * @param callId - the request's call id, when present.
 * @returns the asked event's approval id, or undefined when the chain is broken.
 */
export declare function correlateApprovalId(events: readonly SessionEvent[], toolName: string, callId?: CallId): ApprovalRequestId | undefined;
/**
 * Find the already-presented tool call the approval request refers to — the
 * `tool/call` event whose arguments the model produced and the UI streamed.
 * @param events - session events in log order.
 * @param callId - the exact call to find.
 * @returns the call's raw arguments JSON string, or undefined without one.
 */
export declare function findPresentedCall(events: readonly SessionEvent[], callId: CallId): string | undefined;
//# sourceMappingURL=events.d.ts.map