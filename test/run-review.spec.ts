/**
 * Direct behaviour tests for the decoupled review service: `runReview` against
 * the neutral {@link ReviewRequest} input (T01 review closure F01 — the review
 * core's structured path, capability prechecks, inline fallback routing and
 * cancellation, without mounting the upstream answerer).
 */
import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { Session, SESSION_FORMAT_VERSION, SessionId } from '@deepseek-ai/dsh-session'
import { CallId } from './call-id.ts'
import {
  isReviewFailure,
  resolveConfig,
  ReviewerChildren,
  runReview,
  VERDICT_SCHEMA,
} from '../src/index.ts'
import type { ReviewRequest } from '../src/review-types.ts'
import { makeLlm, makeSubagents, appendRequestHeader, type ScriptedReview } from './harness.ts'

/** A portable absolute workspace path (the session header rejects relative cwd). */
const WORKSPACE = path.resolve('work')

function makeSession(id = 'run-review-session'): Session {
  return Session.create(SessionId(id), undefined, {
    version: SESSION_FORMAT_VERSION,
    id: SessionId(id),
    createdAt: 0,
    cwd: WORKSPACE,
    isSeeded: false,
  })
}

function makeRequest(overrides: Partial<ReviewRequest> = {}): ReviewRequest {
  const session = makeSession()
  // The inline reviewer seam resolves the route from the last request header.
  appendRequestHeader(session, { provider: 'mock', model: 'mock-model' })
  return {
    toolName: 'bash',
    callId: CallId('call-1'),
    reason: 'escalate sandbox',
    agent: { session },
    ...overrides,
  }
}

function config(): ReturnType<typeof resolveConfig> {
  // The independent reviewer route (T03): model + provider explicitly named —
  // never inherited from the main model's request header.
  return resolveConfig({ reviewerProvider: 'mock', reviewerModel: 'mock-reviewer', reviewerModelProvider: 'mock-llm' })
}

interface ReviewHarness {
  ctx: Context
  subagents: ReturnType<typeof makeSubagents>
  llm: ReturnType<typeof makeLlm>
}

function reviewHarness(
  script: () => ScriptedReview,
  capabilities?: object,
  withStart = true,
  provideLlm = true,
): ReviewHarness {
  const ctx = new Context()
  const subagents = makeSubagents(script, capabilities, { withStart })
  const llm = makeLlm(script)
  ctx.provide('subagents', subagents as never)
  if (provideLlm) ctx.provide('llm', llm as never)
  ctx.provide('tools', {})
  return { ctx, subagents, llm }
}

describe('runReview on the neutral ReviewRequest input', () => {
  it('extracts a structured verdict through the one-shot child seam', async () => {
    const { ctx, subagents } = reviewHarness(() => ({ verdict: { decision: 'allow', reason: 'looks safe' } }))
    const resolution = await runReview(ctx, config(), makeRequest(), new ReviewerChildren())
    if (isReviewFailure(resolution)) throw new Error(`expected a verdict, got failure: ${resolution.error}`)
    expect(resolution.decision).toBe('allow')
    expect(resolution.reason).toBe('looks safe')
    const start = subagents.starts[0]!
    expect(start.name).toBe('mock')
    expect((start.request as { toolFilter?: unknown }).toolFilter).toEqual({ allow: ['read', 'glob', 'grep'] })
    expect(start.request.outputSchema).toEqual(VERDICT_SCHEMA)
    expect(start.request.maxDepth).toBe(1)
    expect(start.request.signal).toBeInstanceOf(AbortSignal)
  })

  it('fails unavailable when the provider lacks outputSchema', async () => {
    const { ctx } = reviewHarness(() => ({ verdict: { decision: 'allow', reason: 'x' } }), { capabilities: { outputSchema: false } })
    const resolution = await runReview(ctx, config(), makeRequest(), new ReviewerChildren())
    if (!isReviewFailure(resolution)) throw new Error(`expected a failure, got verdict: ${resolution.decision}`)
    expect(resolution.fallback).toBe('unavailable')
    expect(resolution.error).toContain('outputSchema')
  })

  it('fails unavailable when the provider lacks toolFilter', async () => {
    const { ctx } = reviewHarness(() => ({ verdict: { decision: 'allow', reason: 'x' } }), { capabilities: { toolFilter: false } })
    const resolution = await runReview(ctx, config(), makeRequest(), new ReviewerChildren())
    if (!isReviewFailure(resolution)) throw new Error(`expected a failure, got verdict: ${resolution.decision}`)
    expect(resolution.fallback).toBe('unavailable')
    expect(resolution.error).toContain('toolFilter')
  })

  it('routes to the tool-less inline call when the one-shot seam is gone', async () => {
    const { ctx, llm } = reviewHarness(() => ({ verdict: { decision: 'deny', reason: 'too risky' } }), undefined, false)
    const resolution = await runReview(ctx, config(), makeRequest(), new ReviewerChildren())
    if (isReviewFailure(resolution)) throw new Error(`expected a verdict, got failure: ${resolution.error}`)
    expect(resolution.decision).toBe('deny')
    expect(llm.calls.length).toBe(1)
    // Unconfigured effort: the provider's own default applies.
    expect(llm.calls[0]).not.toHaveProperty('reasoningEffort')
  })

  it('passes the configured reasoning effort to the inline reviewer call verbatim', async () => {
    const { ctx, llm } = reviewHarness(() => ({ verdict: { decision: 'allow', reason: 'ok' } }), undefined, false)
    const cfg = resolveConfig({
      reviewerProvider: 'mock',
      reviewerModel: 'mock-reviewer',
      reviewerModelProvider: 'mock-llm',
      reviewerReasoningEffort: 'high',
    })
    const resolution = await runReview(ctx, cfg, makeRequest(), new ReviewerChildren())
    if (isReviewFailure(resolution)) throw new Error(`expected a verdict, got failure: ${resolution.error}`)
    expect(llm.calls[0]!.reasoningEffort).toBe('high')
  })

  it('passes the configured reasoning effort to the reviewer child options', async () => {
    const { ctx, subagents } = reviewHarness(() => ({ verdict: { decision: 'allow', reason: 'ok' } }))
    const cfg = resolveConfig({
      reviewerProvider: 'mock',
      reviewerModel: 'mock-reviewer',
      reviewerModelProvider: 'mock-llm',
      reviewerReasoningEffort: 'low',
    })
    const resolution = await runReview(ctx, cfg, makeRequest(), new ReviewerChildren())
    if (isReviewFailure(resolution)) throw new Error(`expected a verdict, got failure: ${resolution.error}`)
    const agentOptions = (subagents.starts[0]!.request as { agentOptions?: { reasoningEffort?: string } }).agentOptions
    expect(agentOptions?.reasoningEffort).toBe('low')
  })

  it('fails unavailable when neither reviewer seam exists', async () => {
    const { ctx } = reviewHarness(() => ({ verdict: { decision: 'allow', reason: 'x' } }), undefined, false, false)
    const resolution = await runReview(ctx, config(), makeRequest(), new ReviewerChildren())
    if (!isReviewFailure(resolution)) throw new Error(`expected a failure, got verdict: ${resolution.decision}`)
    expect(resolution.fallback).toBe('unavailable')
    expect(resolution.error).toContain('neither subagents.start nor llm')
  })

  it('resolves to a cancelled failure when the request signal aborts mid-review', async () => {
    const controller = new AbortController()
    const { ctx } = reviewHarness(() => ({
      verdict: { decision: 'allow', reason: 'late' },
      delayMs: 200,
    }))
    const pending = runReview(ctx, config(), makeRequest({ signal: controller.signal }), new ReviewerChildren())
    setTimeout(() => controller.abort(), 20)
    const resolution = await pending
    if (!isReviewFailure(resolution)) throw new Error(`expected a failure, got verdict: ${resolution.decision}`)
    expect(resolution.fallback).toBe('cancelled')
  })

  it('fails unavailable when no independent reviewer is configured (never the main model)', async () => {
    const { ctx, llm, subagents } = reviewHarness(() => ({ verdict: { decision: 'allow', reason: 'x' } }), undefined, false)
    const resolution = await runReview(ctx, resolveConfig({ reviewerProvider: 'mock' }), makeRequest(), new ReviewerChildren())
    if (!isReviewFailure(resolution)) throw new Error(`expected a failure, got verdict: ${resolution.decision}`)
    expect(resolution.fallback).toBe('unavailable')
    expect(resolution.error).toContain('independent reviewer')
    expect(llm.calls.length).toBe(0)
    expect(subagents.starts.length).toBe(0)
  })

  it('keeps the reviewer route when the main model route changes', async () => {
    // The session header names a DIFFERENT main-model route; the reviewer call
    // must still use the configured reviewer model/provider.
    const { ctx, llm } = reviewHarness(() => ({ verdict: { decision: 'allow', reason: 'x' } }), undefined, false)
    const request = makeRequest()
    appendRequestHeader(request.agent.session, { provider: 'main-provider', model: 'main-model-2' })
    const resolution = await runReview(ctx, config(), request, new ReviewerChildren())
    if (isReviewFailure(resolution)) throw new Error(`expected a verdict, got failure: ${resolution.error}`)
    const call = llm.calls[0]!
    expect(call.model).toBe('mock-reviewer')
    expect(call.provider).toBe('mock-llm')
    expect(call.model).not.toBe('main-model-2')
  })

  it('returns a need_evidence verdict with its validated probe requests', async () => {
    const { ctx, llm } = reviewHarness(() => ({
      verdict: {
        decision: 'need_evidence',
        reason: 'need the script body',
        evidenceRequests: [{ kind: 'read', path: 'scripts/build.mjs' }],
      } as never,
    }), undefined, false)
    const resolution = await runReview(ctx, config(), makeRequest(), new ReviewerChildren())
    if (isReviewFailure(resolution)) throw new Error(`expected a verdict, got failure: ${resolution.error}`)
    expect(resolution.decision).toBe('need_evidence')
    expect(resolution.evidenceRequests).toEqual([{ kind: 'read', path: 'scripts/build.mjs' }])
    expect(llm.calls.length).toBe(1)
  })
})
