/**
 * Reviewer subagent tests: what the answerer asks the subagent seam to run —
 * read-only tool filter, structured verdict schema, prompt contents, argument
 * redaction — plus verdict parsing and the deny-reason injection path.
 * @module dsh-auto-review/test/reviewer.spec
 */

import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { Session, SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'
import { SessionId } from '@deepseek-ai/dsh-session'
import { CallId } from './call-id.ts'
import {
  buildContextSection,
  buildReviewPrompt,
  DEFAULT_TIER_CONFIG,
  parseVerdict,
  renderCallContext,
  renderEvidenceRounds,
  sanitizedArgumentsText,
  sanitizeArguments,
  truncate,
  VERDICT_SCHEMA,
} from '../src/index.ts'
import { denyResultText, AutoReviewVerdictId, DENY_MARKER_PATTERN } from '../src/index.ts'
import type { ResolvedConfig } from '../src/index.ts'
import { makeAgent } from './harness.ts'

/** A portable absolute workspace path — `path.resolve` anchors it on every platform (the session header rejects non-absolute cwd). */
const WORKSPACE = path.resolve('work')

/** A session seeded with raw-typed events (append casts keep the fixtures compact). */
function sessionWithEvents(events: { type: string; data: unknown }[]): Session {
  const session = Session.create(SessionId(`ctx-${events.length}`), undefined, {
    version: SESSION_FORMAT_VERSION,
    id: SessionId(`ctx-${events.length}`),
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

/** A fully resolved config with spot overrides (the prompt tests need a literal). */
function promptConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    enableByDefault: true,
    toolsPolicy: { default: 'human', overrides: {} },
    riskRules: [],
    reviewerProvider: 'fork',
    reviewerModel: undefined,
    reviewerModelProvider: undefined,
    reviewerReasoningEffort: undefined,
    reviewerTimeoutMs: 60_000,
    reviewerTools: ['read', 'glob', 'grep'],
    fallbackPolicy: 'rejected',
    maxReviewsPerTurn: 10,
    maxFailuresPerTurn: 10,
    reasonMaxChars: 2000,
    argumentsMaxChars: 64000,
    reviewerGuidance: undefined,
    reviewerPolicyText: undefined,
    denyGuidance: 'do not bypass',
    contextBudget: { turns: 0, maxChars: 4000 },
    riskPolicy: { maxAutoAllow: 'high', onHighRisk: 'delegate' },
    circuitBreaker: { consecutiveDenies: 3, windowDenies: 10, windowSize: 50, action: 'delegate' },
    overrideTtlMs: 300_000,
    verdictCacheTtlMs: 60_000,
    verdictCacheMaxEntries: 256,
    language: 'en',
    allowUnmarkedAudit: false,
    verifiedMcpTools: undefined,
    settingsDir: undefined,
    tiers: DEFAULT_TIER_CONFIG,
    ...overrides,
  }
}

describe('reviewer prompt', () => {
  it('names the tool, the reason, the workspace, and the risk rules', () => {
    const session = Session.create(SessionId('prompt-session'), undefined, {
      version: SESSION_FORMAT_VERSION,
      id: SessionId('prompt-session'),
      createdAt: 0,
      cwd: WORKSPACE,
      isSeeded: false,
    })
    const prompt = buildReviewPrompt({
      agent: makeAgent(session),
      toolName: 'bash',
      reason: 'escalate sandbox to danger-full-access',
    }, {
      enableByDefault: true,
      toolsPolicy: { default: 'human', overrides: {} },
      riskRules: [{ pattern: 'killall', regex: /killall/u, policy: 'never', field: 'reason' }],
      reviewerProvider: 'fork',
      reviewerModel: undefined,
    reviewerModelProvider: undefined,
    reviewerReasoningEffort: undefined,
      reviewerTimeoutMs: 60_000,
      reviewerTools: ['read', 'glob', 'grep'],
      fallbackPolicy: 'rejected',
      maxReviewsPerTurn: 10,
      maxFailuresPerTurn: 10,
      reasonMaxChars: 2000,
      argumentsMaxChars: 64000,
      reviewerGuidance: undefined,
      reviewerPolicyText: undefined,
      denyGuidance: 'do not bypass',
      contextBudget: { turns: 0, maxChars: 4000 },
      riskPolicy: { maxAutoAllow: 'high', onHighRisk: 'delegate' },
      circuitBreaker: { consecutiveDenies: 3, windowDenies: 10, windowSize: 50, action: 'delegate' },
      overrideTtlMs: 300_000,
      verdictCacheTtlMs: 60_000,
      verdictCacheMaxEntries: 256,
      language: 'en',
      allowUnmarkedAudit: false,
      verifiedMcpTools: undefined,
      settingsDir: undefined,
      tiers: DEFAULT_TIER_CONFIG,
    })
    expect(prompt).toContain('Tool name: bash')
    expect(prompt).toContain('escalate sandbox to danger-full-access')
    expect(prompt).toContain(`Workspace: ${WORKSPACE}`)
    expect(prompt).toContain('/killall/u → never')
    expect(prompt).toContain('structured_output')
    expect(prompt).toContain('ask_user')
    expect(prompt).toContain('When sure it is unsafe, DENY')
    expect(prompt).toContain('need_evidence')
  })

  it('truncates the request reason to the shared budget', () => {
    const session = Session.create(SessionId('prompt-trunc'), undefined, {
      version: SESSION_FORMAT_VERSION,
      id: SessionId('prompt-trunc'),
      createdAt: 0,
      cwd: WORKSPACE,
      isSeeded: false,
    })
    const prompt = buildReviewPrompt({
      agent: makeAgent(session),
      toolName: 'bash',
      reason: 'escalate sandbox to danger-full-access',
    }, {
      enableByDefault: true,
      toolsPolicy: { default: 'human', overrides: {} },
      riskRules: [],
      reviewerProvider: 'fork',
      reviewerModel: undefined,
    reviewerModelProvider: undefined,
    reviewerReasoningEffort: undefined,
      reviewerTimeoutMs: 60_000,
      reviewerTools: ['read', 'glob', 'grep'],
      fallbackPolicy: 'rejected',
      maxReviewsPerTurn: 10,
      maxFailuresPerTurn: 10,
      reasonMaxChars: 10,
      argumentsMaxChars: 64000,
      reviewerGuidance: undefined,
      reviewerPolicyText: undefined,
      denyGuidance: 'do not bypass',
      contextBudget: { turns: 0, maxChars: 4000 },
      riskPolicy: { maxAutoAllow: 'high', onHighRisk: 'delegate' },
      circuitBreaker: { consecutiveDenies: 3, windowDenies: 10, windowSize: 50, action: 'delegate' },
      overrideTtlMs: 300_000,
      verdictCacheTtlMs: 60_000,
      verdictCacheMaxEntries: 256,
      language: 'en',
      allowUnmarkedAudit: false,
      verifiedMcpTools: undefined,
      settingsDir: undefined,
      tiers: DEFAULT_TIER_CONFIG,
    })
    expect(prompt).toContain('escalate s…')
    expect(prompt).not.toContain('danger-full-access')
  })
})

describe('argument sanitization', () => {
  it('redacts sensitive keys recursively and keeps the rest', () => {
    const sanitized = sanitizeArguments({
      command: 'echo hi',
      env: { API_KEY: 'sk-secret', PASSWORD: 'hunter2', SHELL: 'bash' },
      nested: [{ token: 'abc' }, { text: 'keep' }],
    })
    expect(sanitized).toEqual({
      command: 'echo hi',
      env: { API_KEY: '[REDACTED]', PASSWORD: '[REDACTED]', SHELL: 'bash' },
      nested: [{ token: '[REDACTED]' }, { text: 'keep' }],
    })
  })

  it('renders the presented call context redacted', () => {
    const events = [{
      type: 'tool/call',
      seq: 0,
      time: 0,
      data: { turn: 1, step: 1, callId: 'call-1', name: 'bash', arguments: '{"command":"curl -H Authorization: Bearer abc","apiKey":"sk-x"}' },
    }]
    const text = renderCallContext(events as never, CallId('call-1'), 2000)
    expect(text).toContain('"apiKey": "[REDACTED]"')
    expect(text).toContain('Authorization')
    expect(text).not.toContain('sk-x')
  })

  it('truncates long content without splitting surrogate pairs', () => {
    const text = truncate('a'.repeat(100) + '𠮷', 5)
    expect(text).toBe('aaaaa…')
  })
})

describe('verdict schema and parsing', () => {
  it('declares an object-rooted schema with the closed vocabularies', () => {
    expect(VERDICT_SCHEMA).toMatchObject({
      type: 'object',
      required: ['decision', 'reason'],
    })
  })

  it('accepts a valid verdict and rejects malformed values', () => {
    expect(parseVerdict({ decision: 'allow', reason: 'fine', riskLevel: 'low' }, 100)).toMatchObject({
      decision: 'allow',
      reason: 'fine',
      riskLevel: 'low',
    })
    expect(parseVerdict({ decision: 'maybe', reason: 'x' }, 100)).toBeUndefined()
    expect(parseVerdict({ decision: 'allow', reason: '  ' }, 100)).toBeUndefined()
    expect(parseVerdict({ decision: 'allow', reason: 'x', riskLevel: 'critical' }, 100)).toBeUndefined()
    expect(parseVerdict('nope', 100)).toBeUndefined()
  })

  it('accepts ask_user and need_evidence with a validated probe request', () => {
    const ask = parseVerdict({ decision: 'ask_user', reason: 'cannot verify authorization', question: 'allow git push?' }, 100)
    expect(ask).toMatchObject({ decision: 'ask_user', question: 'allow git push?' })
    const need = parseVerdict({
      decision: 'need_evidence',
      reason: 'need the script body',
      evidenceRequests: [{ kind: 'read', path: 'scripts/build.mjs', range: { startLine: 1, endLine: 40 } }],
    }, 100)
    expect(need?.evidenceRequests).toEqual([{ kind: 'read', path: 'scripts/build.mjs', range: { startLine: 1, endLine: 40 } }])
  })

  it('voids a need_evidence verdict outside the restricted probe vocabulary', () => {
    // no requests at all
    expect(parseVerdict({ decision: 'need_evidence', reason: 'x' }, 100)).toBeUndefined()
    // unknown probe kind (e.g. a shell command) — never executed
    expect(parseVerdict({ decision: 'need_evidence', reason: 'x', evidenceRequests: [{ kind: 'shell', path: 'rm -rf /' }] }, 100)).toBeUndefined()
    // search without its required pattern
    expect(parseVerdict({ decision: 'need_evidence', reason: 'x', evidenceRequests: [{ kind: 'search', path: 'src' }] }, 100)).toBeUndefined()
    // over the per-round item budget
    expect(parseVerdict({
      decision: 'need_evidence',
      reason: 'x',
      evidenceRequests: [
        { kind: 'stat', path: 'a' }, { kind: 'stat', path: 'b' }, { kind: 'stat', path: 'c' },
      ],
    }, 100, 2)).toBeUndefined()
    // one bad item voids the whole request — nothing is executed partially
    expect(parseVerdict({
      decision: 'need_evidence',
      reason: 'x',
      evidenceRequests: [{ kind: 'read', path: 'ok.txt' }, { kind: 'exec', path: 'nope' }],
    }, 100)).toBeUndefined()
  })

  it('renders evidence rounds with disclosures instead of silent absence', () => {
    const text = renderEvidenceRounds([{
      question: 'what does the script do?',
      items: [
        { request: { kind: 'read', path: 'x.sh' }, result: { ok: true, text: 'echo hi', disclosures: [] } },
        { request: { kind: 'read', path: '.env' }, result: { ok: false, text: '', disclosures: [{ kind: 'omitted', detail: 'probe refused: credential-store path requires a review decision first' }] } },
      ],
    }])
    expect(text).toContain('what does the script do?')
    expect(text).toContain('echo hi')
    expect(text).toContain('(probe refused — no content returned)')
    expect(text).toContain('disclosure: omitted')
  })

  it('truncates the verdict reason to the configured budget', () => {
    expect(parseVerdict({ decision: 'deny', reason: 'r'.repeat(50) }, 10)?.reason).toBe('rrrrrrrrrr…')
  })
})

describe('deny marker text', () => {
  it('embeds the review id and tool name so the invariant can reconstruct it', () => {
    const text = denyResultText(AutoReviewVerdictId('review-42'), 'bash', 'too risky')
    expect(text).toBe('Error: [auto-review] review review-42 denied tool "bash": too risky')
    expect(DENY_MARKER_PATTERN.exec(text)?.[1]).toBe('review-42')
  })
})

describe('Phase B prompt sections', () => {
  it('includes the ruling policy text, the override context, and field-scoped risk rules', () => {
    const session = Session.create(SessionId('prompt-phaseb'), undefined, {
      version: SESSION_FORMAT_VERSION,
      id: SessionId('prompt-phaseb'),
      createdAt: 0,
      cwd: WORKSPACE,
      isSeeded: false,
    })
    const prompt = buildReviewPrompt({
      agent: makeAgent(session),
      toolName: 'bash',
      reason: 'cleanup',
    }, promptConfig({
      riskRules: [{ pattern: 'bash', regex: /bash/u, policy: 'never', field: 'toolName' }],
      reviewerPolicyText: '# Policy\n- Always deny `rm -rf`',
    }), { reviewId: AutoReviewVerdictId('r9'), toolName: 'bash' })
    expect(prompt).toContain('Ruling policy')
    expect(prompt).toContain('Always deny `rm -rf`')
    expect(prompt).toContain('HUMAN OVERRIDE')
    expect(prompt).toContain('review r9')
    expect(prompt).toContain('toolName matches /bash/u → never')
  })

  it('omits the override and policy sections when not configured', () => {
    const session = Session.create(SessionId('prompt-phaseb-plain'), undefined, {
      version: SESSION_FORMAT_VERSION,
      id: SessionId('prompt-phaseb-plain'),
      createdAt: 0,
      cwd: WORKSPACE,
      isSeeded: false,
    })
    const prompt = buildReviewPrompt({ agent: makeAgent(session), toolName: 'bash' }, promptConfig())
    expect(prompt).not.toContain('HUMAN OVERRIDE')
    expect(prompt).not.toContain('Ruling policy')
    expect(prompt).not.toContain('Recent session transcript')
  })
})

describe('compact transcript context', () => {
  it('collects user/agent/tool lines bounded by the budget', () => {
    const session = sessionWithEvents([
      { type: 'turn/start', data: { turn: 1 } },
      { type: 'user/message', data: { content: [{ type: 'text', text: 'please fix the tests' }] } },
      { type: 'assistant/message', data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: 'running tests now' }] } } },
      { type: 'tool/call', data: { turn: 1, step: 1, callId: 'c1', name: 'bash', arguments: '{"command":"pnpm test"}' } },
      { type: 'tool/result', data: { turn: 1, step: 1, message: { role: 'tool', toolCallId: 'c1', content: [{ type: 'text', text: '76 passed' }] } } },
    ])
    const section = buildContextSection(session.snapshotEvents(), { turns: 1, maxChars: 1000 })
    expect(section).toContain('[user] please fix the tests')
    expect(section).toContain('[agent] running tests now')
    expect(section).toContain('[tool call bash]')
    expect(section).toContain('[tool result] 76 passed')
  })

  it('is disabled with turns 0 and truncates to the character cap', () => {
    const session = sessionWithEvents([
      { type: 'turn/start', data: { turn: 1 } },
      { type: 'user/message', data: { content: [{ type: 'text', text: 'a long message to truncate' }] } },
    ])
    expect(buildContextSection(session.snapshotEvents(), { turns: 0, maxChars: 1000 })).toBe('')
    expect(buildContextSection(session.snapshotEvents(), { turns: 1, maxChars: 20 })).toMatch(/…$/u)
  })

  it('spends the character budget on the most recent lines, not the oldest', () => {
    // The pending call and the request that authorized it live at the END of
    // the transcript; a budget spent from the front would hand the reviewer
    // the ancient history and cut exactly the evidence it needs.
    const session = sessionWithEvents([
      { type: 'turn/start', data: { turn: 1 } },
      { type: 'user/message', data: { content: [{ type: 'text', text: 'ancient history nobody needs' }] } },
      { type: 'user/message', data: { content: [{ type: 'text', text: 'create hello.txt in my home directory' }] } },
    ])
    const section = buildContextSection(session.snapshotEvents(), { turns: 1, maxChars: 60 })
    expect(section).toContain('create hello.txt in my home directory')
    expect(section).not.toContain('ancient history')
    expect(section.length).toBeLessThanOrEqual(60)
  })
})

describe('sanitized arguments text', () => {
  it('returns redacted pretty JSON for a presented call and undefined without one', () => {
    const events = [{
      type: 'tool/call',
      seq: 0,
      time: 0,
      data: { turn: 1, step: 1, callId: 'call-1', name: 'bash', arguments: '{"apiKey":"sk-x","cmd":"ls"}' },
    }]
    const text = sanitizedArgumentsText(events as never, CallId('call-1'))
    expect(text).toContain('"[REDACTED]"')
    expect(text).toContain('"cmd": "ls"')
    expect(sanitizedArgumentsText(events as never, CallId('ghost'))).toBeUndefined()
  })
})
