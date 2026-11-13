/**
 * Modified for dsh-second-look, 2026-10-31 (安装前复核 R3 返修).
 *
 * Every piece of review evidence — the strict-tier diff/batch, the user
 * context transcript, tool-call arguments, probe results and the request
 * reason — is redacted before it leaves the machine, and a captured adapter
 * proves no raw secret is ever sent. The review's own outbound runs inside
 * the review scope (no "no-session" bypass) and carries the protected
 * session's id; a payload that STILL scans sensitive after redaction is
 * refused unsent with an explainable failure (reviewEvidenceBlockers), never
 * answered with a recursive review.
 */
import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { Session, SESSION_FORMAT_VERSION, SessionId } from '@deepseek-ai/dsh-session'
import {
  buildReviewPrompt,
  isReviewFailure,
  redactReviewEvidence,
  resolveConfig,
  ReviewerChildren,
  reviewEvidenceBlockers,
  runReview,
  type ReviewPromptOptions,
} from '../src/index.ts'
import type { ReviewRequest } from '../src/review-types.ts'
import { CallId } from './call-id.ts'
import { makeLlm, makeSubagents, appendRequestHeader, type ScriptedReview } from './harness.ts'

/** Synthetic, obviously fake secret shapes (never real credentials). */
const DIFF_SECRET = 'sk-FakeDiffSecretForRedaction123'
const CONTEXT_SECRET = 'password=FakeUserContextSecret42'
const ARGS_SECRET = 'FakeArgSecretValue999'
const RESULT_SECRET = 'ghp_FakeResultToken1234567890'
const PROBE_SECRET = 'AKIAFAKEAWSKEY1234'
const REASON_SECRET = 'FakeReasonSecret777'
const ALL_SECRETS = [DIFF_SECRET, CONTEXT_SECRET, ARGS_SECRET, RESULT_SECRET, PROBE_SECRET, REASON_SECRET]

const WORKSPACE = path.resolve('work')

function sessionWithEvents(id: string, events: { type: string; data: unknown }[]): Session {
  const session = Session.create(SessionId(id), undefined, {
    version: SESSION_FORMAT_VERSION,
    id: SessionId(id),
    createdAt: 0,
    cwd: WORKSPACE,
    isSeeded: false,
  })
  const surface = new Set(['user/message', 'assistant/message', 'tool/result'])
  const append = session.append as unknown as (type: string, data: unknown, options?: { surfaceOp: 'append' }) => unknown
  for (const event of events) {
    append.call(session, event.type, event.data, surface.has(event.type) ? { surfaceOp: 'append' } : undefined)
  }
  return session
}

function secretSession(id: string): Session {
  return sessionWithEvents(id, [
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'user/message', data: { content: [{ type: 'text', text: `please deploy with ${CONTEXT_SECRET}` }] } },
    { type: 'tool/call', data: { turn: 1, step: 1, callId: 'call-1', name: 'bash', arguments: `{"api_key":"${ARGS_SECRET}","cmd":"ls"}` } },
    { type: 'tool/result', data: { turn: 1, step: 1, message: { role: 'tool', toolCallId: 'call-1', content: [{ type: 'text', text: `done ${RESULT_SECRET}` }] } } },
  ])
}

function config(): ReturnType<typeof resolveConfig> {
  return resolveConfig({ reviewerProvider: 'mock', reviewerModel: 'mock-reviewer', reviewerModelProvider: 'mock-llm' })
}

function secretPromptOptions(): ReviewPromptOptions {
  return {
    batch: `diff --git a/x b/x\n+const credential = "${DIFF_SECRET}";`,
    evidenceRounds: [{
      question: 'what changed?',
      items: [{
        request: { kind: 'read', path: 'tools/build-demo.js' },
        result: { ok: true, text: `probe output ${PROBE_SECRET}`, disclosures: [] },
      }],
    }],
  }
}

function secretRequest(session: Session): ReviewRequest {
  return {
    toolName: 'bash',
    callId: CallId('call-1'),
    reason: `escalate sandbox because token=${REASON_SECRET}`,
    agent: { session },
  }
}

describe('review evidence redaction (安装前复核 R3)', () => {
  it('redactReviewEvidence masks value shapes and inline key=value, and marks each removal', () => {
    expect(redactReviewEvidence(`diff line: const k = "${DIFF_SECRET}"`)).not.toContain(DIFF_SECRET)
    expect(redactReviewEvidence(`ctx ${CONTEXT_SECRET} end`)).not.toContain(CONTEXT_SECRET)
    expect(redactReviewEvidence(`token=${REASON_SECRET}`)).not.toContain(REASON_SECRET)
    const marked = redactReviewEvidence(`x ${DIFF_SECRET} y`)
    expect(marked).toContain('[REDACTED]')
    // words and path mentions are NOT values — they survive untouched
    expect(redactReviewEvidence('check the PASSWORD field in config/app.env')).toContain('config/app.env')
  })

  it('buildReviewPrompt redacts diff/batch, user context, probe results and the reason alike', () => {
    const prompt = buildReviewPrompt(secretRequest(secretSession('redact-prompt')), config(), undefined, 'structured_output', secretPromptOptions())
    for (const secret of ALL_SECRETS) {
      expect(prompt, `prompt must not carry ${secret}`).not.toContain(secret)
    }
    expect(prompt).toContain('[REDACTED]')
    // the static verdict contract survives the redaction pass intact
    expect(prompt).toContain('Verdict rules')
    expect(prompt).toContain('need_evidence')
    expect(prompt).toContain('When sure it is unsafe, DENY')
  })

  it('never sends raw secrets and uses a stable reviewer cache identity separate from the work session', async () => {
    const session = secretSession('redact-chain')
    appendRequestHeader(session, { provider: 'mock', model: 'mock-model' })
    const script = (): ScriptedReview => ({ verdict: { decision: 'allow', reason: 'looks safe' } })
    const ctx = new Context()
    const llm = makeLlm(script)
    ctx.provide('subagents', makeSubagents(script, undefined, { withStart: false }) as never)
    ctx.provide('llm', llm as never)
    ctx.provide('tools', {})
    const resolution = await runReview(ctx, config(), secretRequest(session), new ReviewerChildren(), undefined, { prompt: secretPromptOptions() })
    if (isReviewFailure(resolution)) throw new Error(`expected a verdict, got failure: ${resolution.error}`)
    expect(llm.calls.length).toBe(1)
    const dispatched = JSON.stringify(llm.calls[0])
    for (const secret of ALL_SECRETS) {
      expect(dispatched, `adapter must never receive ${secret}`).not.toContain(secret)
    }
    expect(dispatched).toContain('[REDACTED]')
    expect(llm.calls[0]?.sessionId).not.toBe(session.id)
    expect(llm.calls[0]?.sessionId).toMatch(/^second-look-review-[a-f0-9]{32}$/)
    await runReview(ctx, config(), secretRequest(session), new ReviewerChildren(), undefined, { prompt: secretPromptOptions() })
    expect(llm.calls[1]?.sessionId).toBe(llm.calls[0]?.sessionId)
    await runReview(ctx, config(), secretRequest(secretSession('other-parent')), new ReviewerChildren(), undefined, { prompt: secretPromptOptions() })
    expect(llm.calls[2]?.sessionId).not.toBe(llm.calls[0]?.sessionId)
  })
})

describe('residual review evidence is never sent (安装前复核 R3)', () => {
  it('reviewEvidenceBlockers names the refusal for a still-sensitive payload', () => {
    expect(reviewEvidenceBlockers({ messages: [{ role: 'user', text: 'all clean here' }] })).toBeUndefined()
    const blocker = reviewEvidenceBlockers({ messages: [{ role: 'user', text: `token=${REASON_SECRET}` }] })
    expect(blocker).toContain('UNSENT')
    expect(blocker).toContain('human')
    expect(blocker).not.toContain(REASON_SECRET)
    // a redaction placeholder is not a secret — redacted evidence passes
    expect(reviewEvidenceBlockers({ messages: [{ text: 'Authorization: Bearer [REDACTED]' }] })).toBeUndefined()
  })
})
