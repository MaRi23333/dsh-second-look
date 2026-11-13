import { text } from './locale.ts'
import { withDeadline } from './deadline.ts'
/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T03).
 *
 * The two-tier review loop: run the reviewer, and on `need_evidence` execute
 * the reviewer's RESTRICTED local probes ourselves (stat/read/search/diff
 * through {@link runProbe} — never a shell, never the network, never parent
 * session tools) and feed the redacted, bounded results into the next round.
 * Budgets are per tier (daily 1 round, strict 3 by default) with one total
 * deadline per review. Cancel is immediate and terminal (never re-routed to a
 * human); only timeout, internal error, invalid structure or budget exhaustion
 * produce an explainable human-handoff failure — never a silent allow and
 * never a switch to the main model.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { ResolvedConfig } from './config.ts'
import type { ReviewRequest } from './review-types.ts'
import type { ReviewerChildren } from './isolation.ts'
import {
  isReviewFailure,
  runReview,
  type OverrideContext,
  type ReviewerVerdict,
  type ReviewFailure,
  type ReviewResolution,
} from './review.ts'
import { effectiveReviewer, tierPromptVersion, type ReviewTier, type TierSettings } from './tier.ts'
import { runProbe, type ProbeFileSystem, type ProbeResult } from './evidence/probe.ts'
import type { EvidenceRoundItem, EvidenceRoundRecord } from './evidence/requests.ts'

/** Read `aborted` through a function so control-flow narrowing cannot cache it. */
function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true
}

/** Execution-side dependencies of the loop (the probe surface and the clock). */
export interface EvidenceLoopDeps {
  /** The restricted probe filesystem (see `createNodeProbeFs`). */
  readonly fs: ProbeFileSystem
  /** Injectable clock for tests; defaults to `Date.now`. */
  readonly now?: () => number
}

/** Options for one tiered review. */
export interface TieredReviewOptions {
  /** The tier to review under; defaults to `config.tiers.defaultTier`. */
  readonly tier?: ReviewTier
  /** A pending human one-shot override, when one applies. */
  readonly override?: OverrideContext
  /** Strict-tier change-batch context to review together with the action. */
  readonly batch?: string | undefined
}

/** The closed result of one tiered review. */
export interface TieredReviewResult {
  readonly resolution: ReviewResolution
  /** Evidence rounds consumed (0 when the reviewer never asked). */
  readonly rounds: number
  /** The prompt version stamp actually used (for audit). */
  readonly promptVersion: string
  readonly tier: ReviewTier
}

/**
 * Run one tiered review with the restricted evidence loop.
 * @param ctx - the plugin context (the reviewer seams are feature-detected).
 * @param config - the resolved plugin config.
 * @param request - the neutral review request (parent, signal, evidence).
 * @param reviewerSessions - the reviewer-child registry.
 * @param deps - the probe filesystem and clock.
 * @param options - tier selection and optional override.
 * @returns the verdict or the explainable failure, plus loop accounting.
 */
export async function runReviewWithEvidence(
  ctx: Context,
  config: ResolvedConfig,
  request: ReviewRequest,
  reviewerSessions: ReviewerChildren,
  deps: EvidenceLoopDeps,
  options: TieredReviewOptions = {},
): Promise<TieredReviewResult> {
  const tier = options.tier ?? config.tiers.defaultTier
  const budget = config.tiers[tier].totalTimeoutMs
  return withDeadline(budget, request.signal,
    signal => runEvidenceLoop(ctx, config, { ...request, signal }, reviewerSessions, deps, options),
    kind => ({ resolution: { fallback: kind, error: kind === 'timeout' ? text(config.language, `审核总时限 ${budget} 毫秒已用完（含补证）`, `review exceeded ${budget} ms total limit, including evidence collection`) : text(config.language, '审核已取消', 'review cancelled') },
      rounds: 0, promptVersion: tierPromptVersion(tier, config.tiers[tier]), tier }),
  )
}

async function runEvidenceLoop(
  ctx: Context, config: ResolvedConfig, request: ReviewRequest, reviewerSessions: ReviewerChildren,
  deps: EvidenceLoopDeps, options: TieredReviewOptions,
): Promise<TieredReviewResult> {
  const now = deps.now ?? Date.now
  const tier = options.tier ?? config.tiers.defaultTier
  const settings: TierSettings = config.tiers[tier]
  const reviewer = effectiveReviewer(settings, config)
  // The tier's reviewer overrides apply to the review config only; an unset
  // override inherits the base reviewer — never the main model.
  const effectiveConfig: ResolvedConfig = {
    ...config,
    reviewerModel: reviewer.reviewerModel,
    reviewerModelProvider: reviewer.reviewerModelProvider,
    reviewerProvider: reviewer.reviewerProvider,
    reviewerPreset: reviewer.reviewerPreset,
    reviewerReasoningEffort: reviewer.reviewerReasoningEffort,
  }
  const promptVersion = tierPromptVersion(tier, settings)
  const deadline = now() + settings.totalTimeoutMs
  const records: EvidenceRoundRecord[] = []
  let rounds = 0
  const failure = (fallback: ReviewFailure['fallback'], error: string): TieredReviewResult => ({
    resolution: { fallback, error },
    rounds,
    promptVersion,
    tier,
  })
  for (;;) {
    // Cancel is immediate and terminal: it never becomes a human question.
    if (isAborted(request.signal)) {
      return failure('cancelled', text(config.language, '用户或父任务在裁决前取消了审核', 'review cancelled by the user or parent task before a verdict'))
    }
    const remaining = deadline - now()
    if (remaining <= 0) {
      return failure('timeout', text(config.language, `审核总时限 ${settings.totalTimeoutMs} 毫秒已用完（含 ${rounds} 轮补证）`, `review exceeded its ${settings.totalTimeoutMs} ms total limit (including ${rounds} evidence round(s))`))
    }
    const resolution = await runReview(ctx, effectiveConfig, request, reviewerSessions, options.override, {
      timeoutMs: Math.min(config.reviewerTimeoutMs, remaining),
      prompt: {
        tier,
        tierSettings: settings,
        ...settings.guidance === undefined ? {} : { tierGuidance: settings.guidance },
        evidenceRounds: records,
        ...options.batch === undefined ? {} : { batch: options.batch },
      },
    })
    if (isAborted(request.signal)) return failure('cancelled', text(config.language, '裁决返回前审核已取消', 'review cancelled before verdict delivery'))
    if (now() >= deadline) return failure('timeout', text(config.language, '审核裁决到达时已超过总时限', 'review verdict arrived after its total limit'))
    if (isReviewFailure(resolution)) {
      return { resolution, rounds, promptVersion, tier }
    }
    if (resolution.decision !== 'need_evidence') {
      return { resolution, rounds, promptVersion, tier }
    }
    // need_evidence: spend a round only while the tier's budget allows.
    if (rounds >= settings.evidenceRounds) {
      return failure('budget', text(config.language, `已用完 ${settings.evidenceRounds} 轮补证，转由你确认`, `evidence round budget exhausted after ${settings.evidenceRounds} round(s); handing to a human instead of guessing`))
    }
    const probeRequests = resolution.evidenceRequests
    if (probeRequests === undefined || probeRequests.length === 0) {
      return failure('schema', text(config.language, '审核模型要求补证，但未给出有效补证请求', 'need_evidence verdict carried no usable evidence request'))
    }
    const items: EvidenceRoundItem[] = []
    for (const probeRequest of probeRequests) {
      if (isAborted(request.signal)) {
        return failure('cancelled', text(config.language, '用户或父任务在补证期间取消了审核', 'review cancelled by the user or parent task during evidence collection'))
      }
      items.push({
        request: probeRequest,
        result: await runProbeGuarded(deps.fs, probeRequest, request, settings),
      })
    }
    records.push({ question: resolution.question ?? resolution.reason, items })
    rounds += 1
  }
}

/**
 * Run one restricted probe, turning any throw into a REFUSED result (disclosed)
 * instead of losing the round: the reviewer sees that the probe failed and why,
 * never silent absence.
 */
async function runProbeGuarded(
  fs: ProbeFileSystem,
  probeRequest: Parameters<typeof runProbe>[1],
  request: ReviewRequest,
  settings: TierSettings,
): Promise<ProbeResult> {
  try {
    return await runProbe(fs, probeRequest, {
      workspaceRoot: request.cwd ?? request.agent.session.header.cwd,
      maxOutputChars: settings.maxEvidenceCharsPerItem,
      signal: request.signal,
    })
  } catch (error: unknown) {
    return {
      ok: false,
      text: '',
      disclosures: [{ kind: 'omitted', detail: `probe failed: ${error instanceof Error ? error.message : String(error)}` }],
    }
  }
}

/** Narrow helper: the verdict side of a successful tiered review. */
export function tieredVerdict(result: TieredReviewResult): ReviewerVerdict | undefined {
  return isReviewFailure(result.resolution) ? undefined : result.resolution
}
