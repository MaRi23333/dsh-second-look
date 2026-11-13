/**
 * Modified for dsh-second-look, 2026-10-31 (T01 migration; see THIRD-PARTY-SOURCES.md).
 * Runtime of `dsh-auto-review`: the `approval/request` answerer (claim when
 * the session and tool policy say `ai`, otherwise strictly `next()`), the
 * reviewer verdict handling with fail-closed fallback, the risk-policy
 * escalation, the rejection circuit breaker, the deny-reason injection into
 * the denied tool result, and the `/auto-review` session command. Every
 * registration is an effect (ctx.on / commands.register).
 * @module dsh-auto-review/runtime
 */
import type { Context } from '@deepseek-ai/cordis';
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands';
import type { SessionEventMap } from '@deepseek-ai/dsh-session';
import type { ApprovalOutcome, ApprovalRequest, ApprovalRequestId } from '@deepseek-ai/dsh-user-approval';
import type { PostToolDecision, ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools';
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent';
import type { UserMessage } from '@deepseek-ai/dsh-llm/message';
import type { CallId } from './call-id.js';
import type { Config, ResolvedConfig } from './config.js';
import type { AutoReviewProjection, AutoReviewProjectionState } from './projection-types.js';
import { type AutoReviewFallback } from './events.js';
import type { ReviewerDecision } from './review-types.js';
/** Structured receipt independent of the host's custom session-event support. */
export interface ReviewReceipt {
    sessionId: string;
    approvalId?: ApprovalRequestId;
    callId?: CallId;
    toolName: string;
    reviewId?: string;
    category: 'review' | 'fault' | 'policy' | 'delegate' | 'circuit' | 'cancelled';
    reason: string;
    decision?: ReviewerDecision;
    fallback?: AutoReviewFallback;
    delegated?: boolean;
    cached?: boolean;
    configuredReviewerBackend?: string;
    configuredReviewerModelProvider?: string;
    reviewerModel?: string;
    reviewerSessionId?: string;
    durationMs?: number;
    delegationReason?: string;
    escalation?: 'risk-policy';
    circuit?: SessionEventMap['autoReview/circuit'];
    circuitTriggered?: boolean;
    outcome?: ApprovalOutcome;
}
/** Closed answer plus the evidence needed by an external audit owner. */
export interface DetailedAnswer {
    outcome: ApprovalOutcome;
    receipt: ReviewReceipt;
}
export declare const name = "dsh-second-look";
export declare const inject: string[];
/**
 * Answerer state and behavior. One instance per plugin mount; disposals are
 * owned by the ctx.on / commands.register effects in {@link apply}, plus the
 * teardown effect that clears the pending circuit-breaker timers.
 */
export declare class AutoReviewRuntime {
    private readonly ctx;
    readonly config: ResolvedConfig;
    private disposed;
    /**
     * Live reviewer children — their approval asks never re-enter AI review,
     * and their steps are stripped of injected context by
     * {@link AutoReviewRuntime.guardReviewerContext}.
     */
    private readonly reviewerSessions;
    /** Feedback texts keyed by call id, consumed (and deleted) by the post-execute listener. */
    private readonly feedback;
    /** Whether the host honors the audit envelope's `ignorable` marker: unknown until the first append (or the peer-version pre-check). */
    private auditSupport;
    /** In-memory audit mirrors per session, used when the host cannot stamp audit events. */
    private readonly memory;
    /**
     * Process-lifetime review tallies per session, which the
     * per-turn mirror cannot carry. Keyed by session so a restarted turn (which
     * rebuilds the mirror) keeps the panel's cumulative rows. A `WeakMap`, so a
     * discarded session releases its tally with it.
     */
    private readonly tallies;
    /** The one-time warning that session-log audit was disabled was already logged. */
    private warnedUnmarked;
    /** Pending circuit-breaker abort-turn timers, cleared when the plugin unloads. */
    private readonly pendingAborts;
    /** Same-fingerprint verdict cache (TTL + eviction only; no verdict semantics). */
    private readonly cache;
    constructor(ctx: Context, config: ResolvedConfig);
    /**
     * The `provider` recorded in the verdict audit event: the subagent provider
     * on the generative path.
     * @returns the provider label for this mount's reviewer backend.
     */
    private reviewerProviderName;
    /**
     * Whether the session-log audit may append now: enabled when the host
     * stamps the `ignorable` marker (peer-version pre-check, then the append
     * probe) or when `allowUnmarkedAudit` opts back in. Degrades to the
     * in-memory mirror otherwise, with a one-time warning. Decides BEFORE the
     * first append: an unresolvable version also fails closed (host
     * `0.1.2-alpha.1`+ rejects unknown event types on read, so a probe append
     * would pollute the log).
     * @returns true when audit appends are safe on this host.
     */
    private auditMayAppend;
    /** After the first append on an unversioned host, probe the returned envelope for the ignorable marker. */
    private probeAuditResult;
    /** One-time warning that session-log audit was disabled to keep session logs loadable. */
    private warnUnmarkedAuditHost;
    /** The seq of the open turn/start, or undefined between turns (first-party events exist on every host). */
    private openTurnSeq;
    /** The in-memory audit mirror for a session, reset when the open turn advances. */
    private memoryFor;
    /**
     * The process-lifetime tally behind the panel's cumulative
     * rows, created on first use and kept for the life of the mount.
     * @param session - the session the tally belongs to.
     * @returns the session's tally, creating it when absent.
     */
    private tallyFor;
    /** Record one settled review outcome in the in-memory mirror (audit-disabled hosts). */
    private recordVerdictMemory;
    /** The number of leading consecutive denials in a newest-first verdict list. */
    private static leadingDenials;
    /** The per-turn metrics the caller should read: event folds on marker-aware hosts, the memory mirror otherwise. */
    private verdictsInOpenTurn;
    private failuresInOpenTurn;
    private circuitFor;
    /** The pending one-shot override for a tool: the event fold on marker-aware hosts, the memory mirror otherwise. */
    private activeOverrideFor;
    /** Turn-scoped statistics from the in-memory mirror (audit-disabled hosts), in the {@link reviewStats} shape. */
    private memoryStats;
    /**
     * The live session whose id is `id`, or undefined when no
     * live session matches. The projection fold carries the owning session id as
     * plain text, so the runtime has to resolve it back to a `Session` before it
     * can read the in-memory mirror. Read through `ctx.get` rather than
     * injected: the projection view is a render-time convenience, and a missing
     * service must only cost the mirror, never park this plugin in a pending
     * fiber.
     * @param id - the session id carried by the fold state.
     * @returns the live session, or undefined.
     */
    private sessionById;
    /**
     * The panel view. The pure event fold can
     * never carry this plugin's statistics on a host that refuses unmarked
     * unknown event types (see {@link AutoReviewRuntime.auditMayAppend}), which
     * is why the panel read an empty log and showed all zeros. On such a host
     * this reads the in-memory mirror instead, so the panel reports the real
     * switch state and the real activity; on a marker-aware host the fold stays
     * authoritative and this returns it untouched.
     * @param state - the fold state, which carries its session id.
     * @returns the projection view the panel renders.
     */
    livePanelView(state: AutoReviewProjectionState): AutoReviewProjection;
    /**
     * The `approval/request` answerer. Claims a request ONLY when auto-review
     * is enabled for the session AND the policy for this tool/reason is `ai`
     * AND both per-turn budgets remain AND the rejection circuit breaker is
     * not tripped; everything else delegates via `next()` (or deterministically
     * rejects for `never`). The reviewer's own asks are always delegated
     * (anti-recursion).
     * @param request - the pending decision.
     * @param next - the downstream answerer chain.
     * @returns the closed approval outcome.
     */
    answer(request: ApprovalRequest, next: () => Promise<ApprovalOutcome>): Promise<ApprovalOutcome>;
    /** Return a request-local audit receipt without appending unknown host events. */
    answerDetailed(request: ApprovalRequest, next: () => Promise<ApprovalOutcome>): Promise<DetailedAnswer>;
    /** 回执由调用方持有，嵌套 trip 也必须与内部熔断状态隔离。 */
    private circuitSnapshot;
    private answerCore;
    /**
     * Settle a `never`-policy request deterministically: record the log-only
     * `autoReview/rejection` audit event, and feed a model-visible
     * `[auto-review-never]` marker text (plus the deny guidance) into the
     * denied call's tool result — without it the model only sees the generic
     * rejection and keeps retrying a hard-disabled action. No reviewer runs
     * and no budget is consumed.
     * @param request - the hard-disabled decision.
     * @param source - the matched risk rule or policy table entry.
     * @returns the closed rejection.
     */
    private neverReject;
    /**
     * The same-fingerprint cache key for a pending request, or undefined when
     * the verdict is not replayable from `tool + arguments` alone: the cache is
     * disabled (`verdictCacheTtlMs: 0`), the reviewer transcript is enabled
     * (the verdict depends on session context), or the log lacks a parseable
     * presented call. The caller also bypasses the cache for a pending human
     * override, which changes the reviewer's evidence.
     * @param request - the pending approval request.
     * @returns the fingerprint, or undefined to skip the cache (fail-closed:
     *   the request then runs the reviewer as before).
     */
    private fingerprintFor;
    /**
     * Run the reviewer for one claimed request, register the child for
     * anti-recursion, apply the risk policy, record the verdict, trip the
     * circuit breaker on denials, and settle the answerer chain.
     * @param request - the pending decision.
     * @param approvalId - the correlated `approval/asked` id.
     * @param next - the downstream chain (used by risk-policy delegation).
     * @param override - a pending human one-shot override, when one applies.
     * @returns the closed approval outcome.
     */
    private review;
    /**
     * Append the fallback verdict event and apply the configured fallback
     * policy. A user cancellation settles `cancelled` regardless of policy;
     * otherwise `rejected` (fail closed), `allow-once`, or `delegate`
     * (continue the chain) per config.
     */
    private finish;
    /**
     * Map one reviewer failure to the approval outcome the answerer settles
     * with: `cancelled` when the user aborted the request; otherwise the
     * configured fallback policy.
     * @param failure - the review failure.
     * @returns the outcome, or undefined when the chain must continue.
     */
    private fallbackOutcome;
    /**
     * Settle one request while the rejection circuit breaker is tripped:
     * `delegate` continues the chain; `reject` (and `abort-turn`, whose abort
     * already happened at trip time) rejects with an auditable marker.
     * @param request - the pending decision.
     * @param circuit - the turn's recorded circuit trip.
     * @param next - the downstream chain.
     * @returns the closed approval outcome.
     */
    private circuitSettle;
    /**
     * Trip the rejection circuit breaker after a denial, at most once per
     * turn. `abort-turn` also injects a model-visible warning and cancels the
     * agent (deferred a macrotask so the service's `approval/decided` append
     * commits first — the pair must stay turn-enclosed).
     * @param request - the request whose denial may trip the breaker.
     */
    private checkCircuit;
    /**
     * Store one model-visible feedback text for a denied/failed call's tool
     * result, keyed by call id. Consumed once by the post-execute listener;
     * entries expire after a bounded TTL so a result path that never reaches
     * post-execute cannot grow the map. Same call id twice is last-wins (a
     * retried approval replaces its own pending feedback).
     */
    private recordFeedback;
    /**
     * Record a deny reason (plus the anti-circumvention guidance) for the
     * denied call's tool result. On hosts whose audit envelope cannot be
     * written the text is marker-free — the injected text itself becomes the
     * logged tool result, so model-visible ⟺ logged still holds.
     * @param callId - the denied call.
     * @param toolName - the denied tool.
     * @param reviewId - the verdict event's id (embedded in the injected text).
     * @param reason - the reviewer's reason.
     */
    private recordDenyReason;
    /**
     * Record a fallback-rejection text for the failed call's tool result.
     * @param callId - the failed call.
     * @param reviewId - the fallback verdict event's id (embedded in the text).
     * @param fallback - the failure category.
     * @param error - the failure detail.
     */
    private recordFallbackFeedback;
    /**
     * The `tools/post-execute` listener: replace the generic rejection text of
     * a call THIS answerer denied with the recorded feedback (the model-visible
     * content, reconstructable via the embedded marker). Any other call
     * delegates untouched.
     */
    injectDenyReason(exec: ToolExecution, result: Readonly<ToolExecutionResult>, next: () => Promise<PostToolDecision>): Promise<PostToolDecision>;
    /**
     * Execute the `/auto-review` command: `on` / `off` write the durable
     * `autoReview/state` override (surviving restore) and inject a switch
     * notice; `status` reports the effective state, both per-turn budgets,
     * and the session's cumulative statistics; `approve [n]` records a
     * one-shot human override for a recent denial.
     * @param invocation - the received command invocation.
     * @returns the command result shown to the user.
     */
    command(invocation: CommandInvocation): CommandResult;
    /**
     * Execute `/auto-review approve [n]`: record a single-use human override
     * for the n-th most recent denial (1 = most recent). The override is
     * consumed by the NEXT same-tool review within `overrideTtlMs`, which
     * carries the authorization as reviewer context — the reviewer still
     * decides.
     * @param invocation - the received command invocation.
     * @returns the command result shown to the user.
     */
    private approveCommand;
    /**
     * The `agent/pre-step` context firewall: for a reviewer child only, drop
     * every message the step would carry that is not the reviewer's own prompt
     * or one of its read-only tool results. See `./isolation.ts` for why the
     * reviewer must not read workspace instructions, the runtime-context
     * snapshot, or third-party context injections.
     * @param payload - the proposed step.
     * @param next - the rest of the pre-step waterfall.
     * @returns the decision, with injected context removed for reviewer children.
     */
    guardReviewerContext(payload: {
        agent: Agent;
        messages: UserMessage[];
    }, next: () => Promise<PreStepDecision>): Promise<PreStepDecision>;
    /** Clear every pending circuit-breaker abort-turn timer; called by the plugin fiber's teardown effect. */
    dispose(): void;
}
/**
 * Mount the plugin: resolve config, register the answerer, the post-execute
 * listener and the reviewer context firewall as effects, register the slash
 * command, and register
 * the `autoReview` session projection (when the host provides the
 * session-projection capability — the web profile does; bare test mounts and
 * minimal compositions may not, and the answerer must not depend on it).
 * @param ctx - the host context.
 * @param config - raw plugin config.
 */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=runtime.d.ts.map