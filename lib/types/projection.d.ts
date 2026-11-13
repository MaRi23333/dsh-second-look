/**
 * Modified for dsh-second-look, 2026-10-31 (T01 migration; see THIRD-PARTY-SOURCES.md).
 * Host projection unit for the `autoReview` panel value: folds the log-only
 * `autoReview/*` events into one wire-JSON whole value the browser review
 * panel reads via `useProjection('autoReview')`. Pure mathematics only — the
 * framework owns subscriptions, watermarks, change feeds, and persistence.
 * The fold mirrors the `events.ts` pure folds (budgets, statistics, denials).
 * @module dsh-auto-review/projection
 */
import { z } from 'zod';
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import type { AutoReviewProjection, AutoReviewProjectionState } from './projection-types.js';
/** Strict wire schema — validates the `view` output before it leaves the host. */
export declare const AUTO_REVIEW_PROJECTION_SCHEMA: z.ZodObject<{
    enabled: z.ZodBoolean;
    verdictsUsed: z.ZodNumber;
    failuresUsed: z.ZodNumber;
    allows: z.ZodNumber;
    denies: z.ZodNumber;
    fallbacks: z.ZodNumber;
    neverRejects: z.ZodNumber;
    cacheHits: z.ZodNumber;
    avgDurationMs: z.ZodNumber;
    circuit: z.ZodNullable<z.ZodObject<{
        action: z.ZodUnion<readonly [z.ZodLiteral<"delegate">, z.ZodLiteral<"reject">, z.ZodLiteral<"abort-turn">]>;
        trip: z.ZodObject<{
            kind: z.ZodUnion<readonly [z.ZodLiteral<"consecutive">, z.ZodLiteral<"window">]>;
            count: z.ZodNumber;
        }, z.core.$strip>;
        toolName: z.ZodString;
    }, z.core.$strip>>;
    recent: z.ZodArray<z.ZodObject<{
        reviewId: z.ZodString;
        toolName: z.ZodString;
        at: z.ZodNumber;
        durationMs: z.ZodNumber;
        decision: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<"allow">, z.ZodLiteral<"deny">]>>;
        riskLevel: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<"low">, z.ZodLiteral<"medium">, z.ZodLiteral<"high">]>>;
        escalation: z.ZodOptional<z.ZodLiteral<"risk-policy">>;
        fallback: z.ZodOptional<z.ZodString>;
        outcome: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<"allowed-once">, z.ZodLiteral<"rejected">, z.ZodLiteral<"cancelled">, z.ZodLiteral<"unavailable">]>>;
        reason: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    recentDenies: z.ZodArray<z.ZodObject<{
        reviewId: z.ZodString;
        toolName: z.ZodString;
        reason: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
/**
 * State for the empty log. `enabled` starts at the resolved
 * `enableByDefault` — the projection cannot know the plugin config on its
 * own, so the unit is built per mount by {@link makeAutoReviewProjection}.
 *
 * `sessionId` is part of the state since state version 4: the fold records
 * which session it belongs to so a host that cannot accept the
 * `autoReview/*` audit events can serve the panel from the live in-memory
 * mirror instead (see `AutoReviewRuntime.livePanelView`). The pure fold
 * cannot resolve a session on its own, so the id is supplied by the caller
 * that knows the log header.
 * @param enabledByDefault - the resolved `enableByDefault` config value.
 * @param sessionId - the owning session id, as text.
 */
export declare function initAutoReviewProjection(enabledByDefault: boolean, sessionId: string): AutoReviewProjectionState;
/**
 * Pure transition: previous state + one committed event → next state.
 * Uninterested events return the same state reference.
 * @param state - the state covering all prior events.
 * @param event - the next committed session event.
 * @returns the next state (same reference when the event is not this unit's).
 */
export declare function applyAutoReview(state: AutoReviewProjectionState, event: SessionEvent): AutoReviewProjectionState;
/** State → wire payload (the read-side projection). */
export declare function viewAutoReview(state: AutoReviewProjectionState): AutoReviewProjection;
/** Strict state schema — validates the persisted fold state before it seeds a fold. */
export declare const AUTO_REVIEW_STATE_SCHEMA: z.ZodObject<{
    sessionId: z.ZodString;
    enabled: z.ZodBoolean;
    turnOpen: z.ZodBoolean;
    verdictsUsed: z.ZodNumber;
    failuresUsed: z.ZodNumber;
    allows: z.ZodNumber;
    denies: z.ZodNumber;
    fallbacks: z.ZodNumber;
    neverRejects: z.ZodNumber;
    cacheHits: z.ZodNumber;
    durationSum: z.ZodNumber;
    decided: z.ZodNumber;
    circuit: z.ZodNullable<z.ZodObject<{
        action: z.ZodUnion<readonly [z.ZodLiteral<"delegate">, z.ZodLiteral<"reject">, z.ZodLiteral<"abort-turn">]>;
        trip: z.ZodObject<{
            kind: z.ZodUnion<readonly [z.ZodLiteral<"consecutive">, z.ZodLiteral<"window">]>;
            count: z.ZodNumber;
        }, z.core.$strip>;
        toolName: z.ZodString;
    }, z.core.$strip>>;
    recent: z.ZodArray<z.ZodObject<{
        reviewId: z.ZodString;
        toolName: z.ZodString;
        at: z.ZodNumber;
        durationMs: z.ZodNumber;
        decision: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<"allow">, z.ZodLiteral<"deny">]>>;
        riskLevel: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<"low">, z.ZodLiteral<"medium">, z.ZodLiteral<"high">]>>;
        escalation: z.ZodOptional<z.ZodLiteral<"risk-policy">>;
        fallback: z.ZodOptional<z.ZodString>;
        outcome: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<"allowed-once">, z.ZodLiteral<"rejected">, z.ZodLiteral<"cancelled">, z.ZodLiteral<"unavailable">]>>;
        reason: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    recentDenies: z.ZodArray<z.ZodObject<{
        reviewId: z.ZodString;
        toolName: z.ZodString;
        reason: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
/**
 * The register-ready client-visible unit shape: the rc2 `register` overload
 * requires `wire` to be PRESENT for a `SessionProjectionMap` key (the plain
 * `ProjectionDefinition` keeps `wire` optional for host-only units).
 */
type AutoReviewProjectionUnit = Omit<ProjectionDefinition<'autoReview', AutoReviewProjectionState>, 'wire'> & {
    wire: NonNullable<ProjectionDefinition<'autoReview', AutoReviewProjectionState>['wire']>;
};
/** The wire-side `view` function this unit accepts (state → wire payload). */
export type AutoReviewLiveView = NonNullable<ProjectionDefinition<'autoReview', AutoReviewProjectionState>['wire']>['view'];
/**
 * Build the registered unit for one mount. The unit's initial `enabled` is
 * the mount's resolved `enableByDefault` (the pure `init` cannot see plugin
 * config otherwise), and the panel therefore reports the same switch state
 * the answerer applies. Registrants sharing the `autoReview` key share one
 * unit; the first mount's default wins, which only matters for a double
 * mount with conflicting `enableByDefault` values.
 *
 * `liveView` substitutes the wire `view`
 * with a runtime-aware one. The pure fold can only report what the session
 * log carries, and a host that refuses the unmarked `autoReview/*` events
 * writes none of them — which is why the panel used to read an empty log and
 * show all zeros. The runtime passes `AutoReviewRuntime.livePanelView`, which
 * falls back to the in-memory mirror on such a host and to the fold
 * everywhere else. Omitted (or `undefined`) keeps the pure fold.
 * @param enabledByDefault - the resolved `enableByDefault` config value.
 * @param liveView - an optional runtime-aware wire view.
 * @returns the projection unit for `ctx.sessionProjections.register`.
 */
export declare function makeAutoReviewProjection(enabledByDefault: boolean, liveView?: AutoReviewLiveView): AutoReviewProjectionUnit;
export {};
//# sourceMappingURL=projection.d.ts.map