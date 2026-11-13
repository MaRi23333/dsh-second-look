import type { Context } from '@deepseek-ai/cordis';
import type { CallId } from './call-id.js';
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session';
import type { ReviewRequest } from './review-types.js';
import { type ObjectJsonSchema } from '@deepseek-ai/dsh-tools';
import type { AutoReviewFallback } from './events.js';
import { AutoReviewCircuitId, AutoReviewRejectionId, AutoReviewVerdictId } from './events.js';
import type { ContextBudgetConfig, ResolvedConfig, RiskLevel } from './config.js';
import type { ReviewerChildren } from './isolation.js';
import type { ProbeRequest } from './evidence/probe.js';
import { type EvidenceRoundRecord } from './evidence/requests.js';
import { type ReviewTier, type TierSettings } from './tier.js';
/** A reviewer verdict, validated against the closed decision vocabulary. */
export interface ReviewerVerdict {
    /**
     * The closed four-verdict vocabulary (T03): the model may only return one
     * of these states — it never executes its own free-text suggestions.
     */
    readonly decision: 'allow' | 'ask_user' | 'deny' | 'need_evidence';
    readonly reason: string;
    readonly riskLevel?: RiskLevel;
    /**
     * For `ask_user`: what the human is being asked to decide. Advisory
     * framing only — the plugin decides what is asked and how.
     */
    readonly question?: string;
    /**
     * For `need_evidence`: the restricted local probes requested. Required and
     * validated (closed probe vocabulary) for `need_evidence`; ignored for the
     * other decisions.
     */
    readonly evidenceRequests?: readonly ProbeRequest[];
    /** The reviewer child's session id (its own log is auditable). */
    readonly reviewerSessionId?: SessionId;
    /** The explicitly configured reviewer model, when one was set. */
    readonly model?: string;
}
/**
 * A review that produced no verdict. The caller maps the failure to the
 * configured fallback policy.
 */
export interface ReviewFailure {
    readonly fallback: AutoReviewFallback;
    readonly error: string;
    readonly reviewerSessionId?: SessionId;
    readonly model?: string;
}
/** The closed result of one review attempt. */
export type ReviewResolution = ReviewerVerdict | ReviewFailure;
/** Distinguish a verdict resolution from a failure. */
export declare function isReviewFailure(resolution: ReviewResolution): resolution is ReviewFailure;
/** Object-rooted verdict schema enforced on the child's structured_output capture. */
export declare const VERDICT_SCHEMA: ObjectJsonSchema;
/**
 * Redact inline secrets from a free-form string argument. The key-based pass
 * in {@link sanitizeArguments} only inspects object KEYS, so a secret spelled
 * inside a shell command line would otherwise reach the reviewer verbatim.
 * @param text - the free-form string to redact.
 * @returns the string with every recognized inline secret masked.
 */
export declare function redactInlineSecrets(text: string): string;
/**
 * The ONE redaction pass every review-evidence string crosses before it
 * leaves the machine (安装前复核 R3): inline `key=value`/`--flag value` forms
 * first (the key side stays visible as the redaction ANCHOR), then every
 * secret-VALUE shape (PEM, token prefixes, AWS key ids, JWTs, bearer headers).
 * Removed spans are MARKED with `[REDACTED]` — evidence is annotated, never
 * silently dropped. Coverage is aligned with {@link scanOutbound}'s blocking
 * families, so a fully redacted payload scans clean.
 * @param text - the raw evidence text.
 * @returns the redacted text.
 */
export declare function redactReviewEvidence(text: string): string;
/**
 * The pre-send residual check (安装前复核 R3): a review payload that STILL
 * scans for sensitive material after redaction is NEVER sent — the review
 * fails closed to a human with this explanation instead of disclosing, and
 * never launches a second (recursive) review of the same material.
 * @param payload - the exact request content about to leave.
 * @returns the explainable failure reason, or undefined when the payload is clean.
 */
export declare function reviewEvidenceBlockers(payload: unknown): string | undefined;
/**
 * Recursively redact sensitive values from a JSON value: any object key
 * matching {@link SENSITIVE_KEY_PATTERN} has its value replaced, and any
 * free-form string is passed through {@link redactInlineSecrets}.
 * @param value - the detached JSON value to sanitize.
 * @returns a detached copy with sensitive values redacted.
 */
export declare function sanitizeArguments(value: unknown): unknown;
/**
 * The already-presented call arguments, parsed and key-redacted, as pretty
 * JSON — the raw material for both the reviewer prompt section and the
 * `arguments` risk-rule field.
 * @param events - the requesting session's log.
 * @param callId - the call to render.
 * @returns the sanitized JSON text, or undefined when the log lacks a parseable call.
 */
export declare function sanitizedArgumentsText(events: readonly SessionEvent[], callId: CallId): string | undefined;
/**
 * Render the tool-call context for the reviewer: the already-streamed call
 * arguments (parsed, redacted, truncated) or a note when the log lacks them.
 *
 * A truncated preview is DISCLOSED as truncated and matched with an explicit
 * uncertainty rule (see {@link buildReviewPrompt}): previously the
 * prompt silently showed a `…`-suffixed head and left the verdict rules to
 * infer that the evidence was incomplete, so a reviewer reading the visible
 * part as benign could allow an action whose decisive arguments were cut off.
 * @param events - the requesting session's log.
 * @param callId - the call to render.
 * @param maxChars - the independent argument evidence cap.
 * @returns the prompt section text.
 */
export declare function renderCallContext(events: readonly SessionEvent[], callId: CallId | undefined, maxChars: number): string;
/**
 * Build the compact-transcript section for the reviewer: the tail of the
 * session's user/assistant messages and tool calls/results, most recent
 * last, bounded by {@link ContextBudgetConfig}. `turns: 0` yields an empty
 * section. Tool-call arguments pass through {@link redactInlineSecrets} and
 * tool-result text enters verbatim — both are already-presented transcript
 * content, and the pending request's own call is redacted separately in
 * {@link renderCallContext}.
 *
 * The character budget is spent from the NEWEST line backwards, so an
 * over-budget transcript loses its oldest lines. Truncating the joined text
 * instead would cut the tail — the open turn that carries the user's request
 * and the reasoning behind the pending call, which is exactly the evidence
 * the verdict rules ask for.
 * @param events - the requesting session's log.
 * @param budget - how much context to include.
 * @returns the prompt section text (empty when disabled).
 */
export declare function buildContextSection(events: readonly SessionEvent[], budget: ContextBudgetConfig): string;
/** Context of a pending human override, passed into the reviewer prompt. */
export interface OverrideContext {
    readonly reviewId: AutoReviewVerdictId;
    readonly toolName: string;
}
/**
 * Truncate a string to a character budget without cutting surrogate pairs.
 * @param text - the string to cap.
 * @param maxChars - the positive budget.
 * @returns the capped string.
 */
export declare function truncate(text: string, maxChars: number): string;
/** Optional per-attempt prompt composition: tier policy and prior evidence rounds. */
export interface ReviewPromptOptions {
    /** The review tier whose policy section to include. */
    readonly tier?: ReviewTier;
    /** The tier's resolved settings (version stamp, budgets). */
    readonly tierSettings?: TierSettings;
    /** Extra tier guidance appended after the tier section. */
    readonly tierGuidance?: string;
    /** Evidence rounds already collected by the loop, replayed in order. */
    readonly evidenceRounds?: readonly EvidenceRoundRecord[];
    /** Strict-tier change-batch context (files + versions + gaps). */
    readonly batch?: string | undefined;
}
/**
 * Render the already-collected evidence rounds for the next review attempt:
 * each round's question, each probe request, and each REDACTED, BOUNDED result
 * with its disclosure accounting — the reviewer is never misled about reduced
 * or refused evidence.
 * @param rounds - the completed rounds.
 * @returns the prompt section text (empty when there are none).
 */
export declare function renderEvidenceRounds(rounds: readonly EvidenceRoundRecord[] | undefined): string;
/**
 * Build the reviewer prompt: role, the pending request's tool/reason/context/
 * workspace, the resolved risk rules, the tier policy section, the ruling
 * policy text, the optional human-override context, prior evidence rounds,
 * and the four-verdict contract.
 * @param request - the pending approval request.
 * @param config - resolved config (rules, guidance, budgets).
 * @param override - a pending human one-shot override, when one applies.
 * @param verdictChannel - how the reviewer is expected to answer: the
 *   `structured_output` tool (the isolated child has one) or a bare JSON text
 *   (the tool-less call has no tools at all, so naming a tool would ask for
 *   something the model cannot do).
 * @param options - tier policy and prior evidence rounds (T03).
 * @returns the exact prompt text block.
 */
export declare function buildReviewPrompt(request: ReviewRequest, config: ResolvedConfig, override?: OverrideContext, verdictChannel?: 'structured_output' | 'text', options?: ReviewPromptOptions): string;
/**
 * Validate the provider-validated structured capture against the closed
 * verdict vocabulary. The subagent seam validates against the schema, but its
 * result is typed `unknown`; this is the boundary that narrows it. A
 * `need_evidence` verdict must carry a structurally valid, budget-fitting
 * evidence request — anything outside the restricted probe vocabulary makes
 * the WHOLE verdict invalid (structure failure → explainable human handoff),
 * never a partially executed request.
 * @param value - the captured structured value.
 * @param reasonMaxChars - the reason cap.
 * @param maxEvidenceItems - the tier's per-round evidence-item budget.
 * @returns the verdict, or undefined when the value cannot be a verdict.
 */
export declare function parseVerdict(value: unknown, reasonMaxChars: number, maxEvidenceItems?: number): ReviewerVerdict | undefined;
/** Per-attempt options: deadline override and prompt composition (T03). */
export interface ReviewAttemptOptions {
    /**
     * Per-attempt deadline override in milliseconds (the evidence loop passes
     * `min(reviewerTimeoutMs, remaining-total)`). Defaults to
     * `config.reviewerTimeoutMs`.
     */
    readonly timeoutMs?: number;
    /** Tier policy / prior evidence rounds for the prompt. */
    readonly prompt?: ReviewPromptOptions;
}
/**
 * The independent-reviewer requirement (T03): the reviewer route must be
 * explicitly configured — reviewer model AND its LLM provider. Falling back
 * to the main model's route is forbidden, so "replace the main model" can
 * never change who reviews. The reviewer's credentials live in the host
 * credential service behind those provider names; nothing is stored here.
 * @param config - resolved config.
 * @returns an explanatory error when no independent reviewer is configured.
 */
export declare function requireIndependentReviewer(config: ResolvedConfig): string | undefined;
/**
 * Run one review attempt through whichever seam the host offers: the isolated
 * structured-capture child, or — when the host no longer takes a `toolFilter` —
 * the tool-less model call. Every path resolves to a {@link ReviewResolution},
 * and every failure path resolves to a {@link ReviewFailure}: never a grant.
 * @param ctx - the plugin context (`ctx.subagents`, and `ctx.llm` feature-detected).
 * @param config - resolved config (provider, timeout, tools, model, budgets).
 * @param request - the neutral review request (parent, signal, and evidence).
 * @param reviewerSessions - the mount's reviewer-child registry, so the
 *   answerer can refuse the child's own approval asks while the review runs
 *   and the context firewall knows whose steps to strip.
 * @param override - a pending human one-shot override, when one applies.
 * @param options - per-attempt deadline and prompt composition.
 * @returns the verdict or the failure.
 */
export declare function runReview(ctx: Context, config: ResolvedConfig, request: ReviewRequest, reviewerSessions: ReviewerChildren, override?: OverrideContext, options?: ReviewAttemptOptions): Promise<ReviewResolution>;
/**
 * Mint one verdict id. Wrapped for testability (audit uniqueness is a UUID).
 * @returns a fresh branded id.
 */
export declare function newVerdictId(): AutoReviewVerdictId;
/**
 * Mint one circuit-trip id. Wrapped for testability (audit uniqueness is a UUID).
 * @returns a fresh branded id.
 */
export declare function newCircuitId(): AutoReviewCircuitId;
/**
 * Mint one hard-disable rejection id. Wrapped for testability (audit
 * uniqueness is a UUID).
 * @returns a fresh branded id.
 */
export declare function newRejectionId(): AutoReviewRejectionId;
//# sourceMappingURL=review.d.ts.map