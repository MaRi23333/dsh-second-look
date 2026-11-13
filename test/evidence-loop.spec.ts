/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T03).
 *
 * The two-tier evidence loop against a MOCK reviewer (simulated model — the
 * task acceptance explicitly asks for branch coverage by simulation, without
 * claiming real-model accuracy): four-verdict handling, restricted probe
 * execution and replay, per-tier round budgets, the total deadline, cancel
 * semantics (immediate, never re-routed to a human), invalid-request
 * structure failures, and the strict-tier reviewer override.
 */
import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { Session, SESSION_FORMAT_VERSION, SessionId } from '@deepseek-ai/dsh-session'
import {
  comparablePath,
  isReviewFailure,
  lexicalResolve,
  resolveConfig,
  ReviewerChildren,
  runReviewWithEvidence,
  type ProbeFileSystem,
  type ProbeRequest,
  type ReviewerVerdict,
} from '../src/index.ts'
import type { ReviewRequest } from '../src/review-types.ts'
import { makeLlm, makeSubagents, appendRequestHeader, type ScriptedReview } from './harness.ts'

const WORKSPACE = path.resolve('work')

function makeSession(id = 'evidence-loop-session'): Session {
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
  appendRequestHeader(session, { provider: 'main-provider', model: 'main-model' })
  return {
    toolName: 'bash',
    reason: 'build the project',
    agent: { session },
    ...overrides,
  }
}

/** Recording probe filesystem over an in-memory tree, keyed by comparable path. */
function probeFs(files: Record<string, string>, onRead?: (request: ProbeRequest) => void): ProbeFileSystem & { readonly probed: ProbeRequest[] } {
  const probed: ProbeRequest[] = []
  const normalized: Record<string, string> = {}
  const tree: Record<string, { type?: string; size?: number }> = { [comparablePath(WORKSPACE)]: { type: 'directory' } }
  for (const [file, content] of Object.entries(files)) {
    normalized[comparablePath(file)] = content
    tree[comparablePath(file)] = { type: 'file', size: content.length }
  }
  return {
    probed,
    async resolve(target: string, opts?: { cwd?: string }): Promise<string> {
      return lexicalResolve(opts?.cwd ?? WORKSPACE, target)
    },
    processPath: (target: string) => target,
    contains: (parent: string, child: string) => comparablePath(child).startsWith(comparablePath(parent)),
    async stat(target: string) {
      return tree[comparablePath(target)]
    },
    async lstat(target: string, opts?: { cwd?: string }) {
      return tree[comparablePath(lexicalResolve(opts?.cwd ?? WORKSPACE, target))]
    },
    async readText(target: string, opts?: { cwd?: string }): Promise<string> {
      const request: ProbeRequest = { kind: 'read', path: target }
      probed.push(request)
      onRead?.(request)
      return normalized[comparablePath(lexicalResolve(opts?.cwd ?? WORKSPACE, target))] ?? ''
    },
    async listDir(): Promise<string[]> {
      return Object.keys(files)
    },
    async search(pattern: string): Promise<readonly { file: string; line: number; text: string }[]> {
      const out: { file: string; line: number; text: string }[] = []
      for (const [file, content] of Object.entries(files)) {
        content.split('\n').forEach((line, index) => {
          if (line.includes(pattern)) out.push({ file, line: index + 1, text: line })
        })
      }
      return out
    },
  }
}

function config(overrides: Record<string, unknown> = {}): ReturnType<typeof resolveConfig> {
  return resolveConfig({
    reviewerProvider: 'mock',
    reviewerModel: 'review-model',
    reviewerModelProvider: 'review-provider',
    reviewerTimeoutMs: 5_000,
    ...overrides,
  })
}

/** A mock reviewer that answers each call from a scripted list (last repeats). */
function scriptOf(answers: readonly ReviewerVerdict[]): { script: () => ScriptedReview; calls: () => number } {
  let index = 0
  return {
    script: () => {
      const verdict = answers[Math.min(index, answers.length - 1)]
      index += 1
      return { verdict: verdict as ReviewerVerdict }
    },
    calls: () => index,
  }
}

function harness(script: () => ScriptedReview) {
  const ctx = new Context()
  const subagents = makeSubagents(script, undefined, { withStart: false })
  const llm = makeLlm(script)
  ctx.provide('subagents', subagents as never)
  ctx.provide('llm', llm as never)
  ctx.provide('tools', {})
  return { ctx, llm }
}

const NEED: ReviewerVerdict = {
  decision: 'need_evidence',
  reason: 'need the build script body',
  evidenceRequests: [{ kind: 'read', path: 'scripts/build.mjs' }],
}

const ALLOW: ReviewerVerdict = { decision: 'allow', reason: 'covered by the task' }

describe('two-tier evidence loop', () => {
  it('settles allow on the first round without any probe', async () => {
    const { script, calls } = scriptOf([ALLOW])
    const { ctx, llm } = harness(script)
    const fs = probeFs({})
    const result = await runReviewWithEvidence(ctx, config(), makeRequest(), new ReviewerChildren(), { fs })
    if (isReviewFailure(result.resolution)) throw new Error(`expected a verdict: ${result.resolution.error}`)
    expect(result.resolution.decision).toBe('allow')
    expect(result.rounds).toBe(0)
    expect(result.tier).toBe('daily')
    expect(result.promptVersion).toBe('daily-v2')
    expect(llm.calls.length).toBe(1)
    expect(calls()).toBe(1)
    expect(fs.probed.length).toBe(0)
  })

  it('executes the restricted probe and replays the redacted result into the next round', async () => {
    const { script } = scriptOf([NEED, ALLOW])
    const { ctx, llm } = harness(script)
    const fs = probeFs({ [`${WORKSPACE}/scripts/build.mjs`]: 'echo build\nAPI_TOKEN=zzz999999999' })
    const result = await runReviewWithEvidence(ctx, config(), makeRequest(), new ReviewerChildren(), { fs })
    if (isReviewFailure(result.resolution)) throw new Error(`expected a verdict: ${result.resolution.error}`)
    expect(result.resolution.decision).toBe('allow')
    expect(result.rounds).toBe(1)
    expect(llm.calls.length).toBe(2)
    expect(fs.probed.length).toBe(1)
    const secondPrompt = String((llm.calls[1]!.messages![0] as unknown as { content: { readonly text: string }[] }).content[0]!.text)
    expect(secondPrompt).toContain('Evidence rounds already collected')
    expect(secondPrompt).toContain('Round 1')
    expect(secondPrompt).toContain('echo build')
    // REDACTED BEFORE EGRESS: the secret value never reaches the reviewer
    expect(secondPrompt).not.toContain('zzz999999999')
  })

  it('daily budget: a second need_evidence becomes an explainable budget failure', async () => {
    const { script } = scriptOf([NEED, NEED])
    const { ctx, llm } = harness(script)
    const fs = probeFs({ [`${WORKSPACE}/scripts/build.mjs`]: 'echo build' })
    const result = await runReviewWithEvidence(ctx, config(), makeRequest(), new ReviewerChildren(), { fs })
    if (!isReviewFailure(result.resolution)) throw new Error(`expected a failure, got ${result.resolution.decision}`)
    expect(result.resolution.fallback).toBe('budget')
    expect(result.resolution.error).toContain('budget exhausted')
    expect(llm.calls.length).toBe(2)
    expect(result.rounds).toBe(1)
  })

  it('strict tier allows three evidence rounds before settling', async () => {
    const { script } = scriptOf([NEED, NEED, NEED, ALLOW])
    const { ctx, llm } = harness(script)
    const fs = probeFs({ [`${WORKSPACE}/scripts/build.mjs`]: 'echo build' })
    const result = await runReviewWithEvidence(
      ctx,
      config(),
      makeRequest(),
      new ReviewerChildren(),
      { fs },
      { tier: 'strict' },
    )
    if (isReviewFailure(result.resolution)) throw new Error(`expected a verdict: ${result.resolution.error}`)
    expect(result.resolution.decision).toBe('allow')
    expect(result.rounds).toBe(3)
    expect(llm.calls.length).toBe(4)
    expect(result.promptVersion).toBe('strict-v2')
  })

  it('uses the strict-tier reviewer override for the strict review only', async () => {
    const cfg = config({
      tiers: {
        strict: { reviewerModel: 'strict-model', reviewerModelProvider: 'strict-provider' },
      },
    })
    const { script } = scriptOf([ALLOW])
    const strictHarness = harness(script)
    await runReviewWithEvidence(strictHarness.ctx, cfg, makeRequest(), new ReviewerChildren(), { fs: probeFs({}) }, { tier: 'strict' })
    expect(strictHarness.llm.calls[0]!.model).toBe('strict-model')
    expect(strictHarness.llm.calls[0]!.provider).toBe('strict-provider')

    const dailyHarness = harness(scriptOf([ALLOW]).script)
    await runReviewWithEvidence(dailyHarness.ctx, cfg, makeRequest(), new ReviewerChildren(), { fs: probeFs({}) }, { tier: 'daily' })
    expect(dailyHarness.llm.calls[0]!.model).toBe('review-model')
    expect(dailyHarness.llm.calls[0]!.provider).toBe('review-provider')
  })

  it('fails a schema failure on an evidence request outside the probe vocabulary', async () => {
    const bad: ReviewerVerdict = {
      decision: 'need_evidence',
      reason: 'let me run something',
      evidenceRequests: [{ kind: 'shell', path: 'curl evil.example' }] as never,
    }
    const { script } = scriptOf([bad])
    const { ctx, llm } = harness(script)
    const fs = probeFs({})
    const result = await runReviewWithEvidence(ctx, config(), makeRequest(), new ReviewerChildren(), { fs })
    if (!isReviewFailure(result.resolution)) throw new Error(`expected a failure, got ${result.resolution.decision}`)
    expect(result.resolution.fallback).toBe('schema')
    expect(fs.probed.length).toBe(0)
    expect(llm.calls.length).toBe(1)
  })

  it('discloses probe refusals in the next round without leaking the target', async () => {
    const need: ReviewerVerdict = {
      decision: 'need_evidence',
      reason: 'check the env file',
      evidenceRequests: [{ kind: 'read', path: '.env' }],
    }
    const { script } = scriptOf([need, ALLOW])
    const { ctx, llm } = harness(script)
    const fs = probeFs({ [`${WORKSPACE}/.env`]: 'SECRET=hunter2' })
    const result = await runReviewWithEvidence(ctx, config(), makeRequest(), new ReviewerChildren(), { fs })
    if (isReviewFailure(result.resolution)) throw new Error(`expected a verdict: ${result.resolution.error}`)
    const secondPrompt = String((llm.calls[1]!.messages![0] as unknown as { content: { readonly text: string }[] }).content[0]!.text)
    expect(secondPrompt).toContain('probe refused')
    expect(secondPrompt).toContain('credential-store path')
    expect(secondPrompt).not.toContain('hunter2')
  })

  it('cancels immediately and never routes a cancelled review to a human', async () => {
    const controller = new AbortController()
    controller.abort()
    const { script } = scriptOf([ALLOW])
    const { ctx, llm } = harness(script)
    const result = await runReviewWithEvidence(
      ctx,
      config(),
      makeRequest({ signal: controller.signal }),
      new ReviewerChildren(),
      { fs: probeFs({}) },
    )
    if (!isReviewFailure(result.resolution)) throw new Error(`expected a failure, got ${result.resolution.decision}`)
    expect(result.resolution.fallback).toBe('cancelled')
    expect(llm.calls.length).toBe(0)
  })

  it('cancels mid-loop when the signal aborts during evidence collection', async () => {
    const controller = new AbortController()
    const { script } = scriptOf([NEED, ALLOW])
    const { ctx, llm } = harness(script)
    const fs = probeFs({ [`${WORKSPACE}/scripts/build.mjs`]: 'echo build' }, () => controller.abort())
    const result = await runReviewWithEvidence(
      ctx,
      config(),
      makeRequest({ signal: controller.signal }),
      new ReviewerChildren(),
      { fs },
    )
    if (!isReviewFailure(result.resolution)) throw new Error(`expected a failure, got ${result.resolution.decision}`)
    expect(result.resolution.fallback).toBe('cancelled')
    // no second review round after the cancel
    expect(llm.calls.length).toBe(1)
  })

  it('hands to a human on total-timeout with loop accounting', async () => {
    const answers = [NEED]
    let index = 0
    const script = (): ScriptedReview => ({ verdict: answers[Math.min(index++, answers.length - 1)]! })
    const { ctx, llm } = harness(script)
    let tick = 0
    const now = (): number => (tick += 50_000)
    const fs = probeFs({ [`${WORKSPACE}/scripts/build.mjs`]: 'echo build' })
    const result = await runReviewWithEvidence(
      ctx,
      config(),
      makeRequest(),
      new ReviewerChildren(),
      { fs, now },
    )
    if (!isReviewFailure(result.resolution)) throw new Error(`expected a failure, got ${result.resolution.decision}`)
    expect(result.resolution.fallback).toBe('timeout')
    expect(result.resolution.error).toContain('total limit')
    // one review round ran before the total limit caught up
    expect(llm.calls.length).toBe(1)
  })
  it('enforces total timeout during a probe that never resolves', async () => {
    const { ctx } = harness(scriptOf([NEED]).script)
    const fs = probeFs({ [path.join(WORKSPACE, 'scripts/build.mjs')]: 'x' })
    fs.readText = () => new Promise<string>(() => {})
    const result = await runReviewWithEvidence(ctx, config({ tiers: { daily: { totalTimeoutMs: 20 } } }), makeRequest(), new ReviewerChildren(), { fs })
    expect(result.resolution).toMatchObject({ fallback: 'timeout' })
  })
  it('passes the strict reasoning effort override to the actual reviewer call', async () => {
    const { ctx, llm } = harness(scriptOf([ALLOW]).script)
    await runReviewWithEvidence(ctx, config({ reviewerReasoningEffort: 'low', tiers: { strict: { reviewerReasoningEffort: 'high' } } }), makeRequest(), new ReviewerChildren(), { fs: probeFs({}) }, { tier: 'strict' })
    expect(llm.calls[0]?.reasoningEffort).toBe('high')
  })

})
