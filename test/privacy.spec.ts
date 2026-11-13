/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T06).
 *
 * Sensitive outbound detection, precise disclosure authorization and the
 * llm/stream pre-send guard — the T06 acceptance: raw secrets never enter a
 * review/model request/log before an allow; no infinite privacy recursion;
 * authorized retries don't re-prompt forever; a destination change re-reviews;
 * a refusal never implicitly resends; ordinary API auth is not treated as
 * secret exfiltration.
 */
import { describe, expect, it } from 'vitest'
import {
  createOutboundGuard,
  decideOutbound,
  DisclosureLedger,
  inReviewScope,
  redactSensitiveValues,
  runInReviewScope,
  scanOutbound,
  type OutboundAuditEvent,
  type OutboundDestination,
  type OutboundScan,
} from '../src/index.ts'

const DEST: OutboundDestination = { provider: 'deepseek-official', model: 'deepseek-flash' }
const OTHER: OutboundDestination = { provider: 'other-provider', model: 'other-model' }

function scopeOf(scan: OutboundScan, destination = DEST) {
  return { destination, dataFingerprint: scan.dataFingerprint }
}

describe('outbound sensitive detection (T06)', () => {
  it('finds credential values/keys but never stores raw secrets; path mentions only note', () => {
    const scan = scanOutbound({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'deploy with token ghp_abcdefgh12345678 and read .env' }] }],
      system: [{ apiKey: 'sk-live-SECRETVALUE123' }],
    })
    // values and credential-named keys block; the bare PATH is a note only
    expect(scan.findings.length).toBeGreaterThanOrEqual(2)
    expect(scan.findings.some(finding => finding.kind === 'credential-path')).toBe(false)
    expect(scan.notes.some(finding => finding.kind === 'credential-path')).toBe(true)
    const serialized = JSON.stringify(scan)
    expect(serialized).not.toContain('ghp_abcdefgh12345678')
    expect(serialized).not.toContain('sk-live-SECRETVALUE123')
    expect(serialized).toContain('[REDACTED]')
  })

  it('never blocks a request over a bare path mention (T08 replay false positive)', () => {
    const ledger = new DisclosureLedger()
    const scan = scanOutbound({ messages: [{ text: 'please read the file config/app.env for debugging' }] })
    expect(scan.findings).toEqual([])
    const decision = decideOutbound(scan, DEST, ledger)
    expect(decision.action).toBe('send')
  })

  it('redacts bare token values before probe egress (终审 Major 2)', () => {
    const text = redactSensitiveValues('in file: ghp_abcdefgh12345678 and sk-abcdef1234567890 done')
    expect(text).not.toContain('ghp_abcdefgh12345678')
    expect(text).not.toContain('sk-abcdef1234567890')
    expect(text).toContain('[REDACTED]')
    // a word is untouched
    expect(redactSensitiveValues('the PASSWORD field')).toContain('PASSWORD')
  })

  it('notes named env files like app.env as credential paths (T08 replay gap)', () => {
    const scan = scanOutbound({ messages: [{ text: 'read the file config/app.env for debugging' }] })
    expect(scan.findings).toEqual([]) // a path mention never blocks
    expect(scan.notes.some(note => note.kind === 'credential-path')).toBe(true)
    // ordinary words containing "env" never match
    expect(scanOutbound({ text: 'the venv environment is fine' }).notes).toEqual([])
  })

  it('does not read words starting with sk as tokens (T08 replay: skill_content)', () => {
    const scan = scanOutbound({ messages: [{ text: 'A user may also invoke a skill directly; its <skill_content> block is loaded.' }] })
    expect(scan.findings).toEqual([])
    expect(scan.notes).toEqual([])
    // real token shapes still block (incl. the 20-char AWS form; T08 F1)
    expect(scanOutbound({ text: 'key sk-abcdef1234567890 end' }).findings.length).toBe(1)
    expect(scanOutbound({ text: 'key ghp_abcdefgh12345678 end' }).findings.length).toBe(1)
    expect(scanOutbound({ text: 'key AKIAIOSFODNN7EXAMPLE end' }).findings.length).toBe(1)
    expect(scanOutbound({ text: 'key ASIAIOSFODNN7EXAMPLE end' }).findings.length).toBe(1)
  })

  it('does not flag redaction placeholders or ordinary API-auth-free traffic', () => {
    const redacted = scanOutbound({ messages: [{ role: 'user', text: 'Authorization: Bearer [REDACTED]' }] })
    expect(redacted.findings).toEqual([])
    const ordinary = scanOutbound({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'please refactor the parser and run the tests' }] }],
      system: 'You are a coding agent.',
    })
    expect(ordinary.findings).toEqual([])
    expect(ordinary.dataFingerprint).toHaveLength(32)
  })

  it('never blocks over bare credential WORDS (终审 Major 1) — they are notes, not values', () => {
    const ledger = new DisclosureLedger()
    const wordOnly = scanOutbound({ messages: [{ text: 'please check the PASSWORD field and the API_KEY name' }] })
    expect(wordOnly.findings).toEqual([])
    expect(wordOnly.notes.length).toBeGreaterThan(0)
    expect(decideOutbound(wordOnly, DEST, ledger).action).toBe('send')
    // but a real inline value still blocks
    const withValue = scanOutbound({ messages: [{ text: 'password=hunter2secret' }] })
    expect(withValue.findings.length).toBeGreaterThan(0)
    expect(decideOutbound(withValue, DEST, ledger).action).toBe('review')
  })

  it('a privacy review request made of redacted evidence is SENDABLE (Major 1 self-block fix)', () => {
    const ledger = new DisclosureLedger()
    // the finding's own evidence text flows back in review prompts — it must
    // not re-trigger blocking
    const evidenceText = 'credential-value at request.messages[4]: password=[REDACTED]\nAuthorization: Bearer [REDACTED]'
    const scan = scanOutbound({ messages: [{ text: evidenceText }] })
    expect(scan.findings).toEqual([])
    expect(decideOutbound(scan, DEST, ledger).action).toBe('send')
  })

  it('fingerprints identical spans equally and new sensitive content differently', () => {
    const secret = 'the token=abc123secretvalue here'
    const a = scanOutbound({ result: `tool output: ${secret}` })
    const b = scanOutbound({ messages: [{ role: 'user', content: [{ type: 'text', text: `context ${secret} end` }] }] })
    expect(a.findings.length).toBeGreaterThan(0)
    // the SAME sensitive spans fingerprint equally wherever they ride out
    expect(a.dataFingerprint).toBe(b.dataFingerprint)
    const more = scanOutbound({ messages: [{ text: `${secret} plus password=secondsecret999` }] })
    expect(more.dataFingerprint).not.toBe(a.dataFingerprint)
  })

  it('notes attachments it cannot scan (hook runs before projection)', () => {
    const scan = scanOutbound({ messages: [] }, { attachmentsPresent: true })
    expect(scan.attachmentsUnscanned).toBe(true)
  })
})

describe('precise disclosure authorization', () => {
  it('reuses a grant for identical retries but re-reviews on destination or data change', () => {
    const ledger = new DisclosureLedger()
    const scan = scanOutbound({ text: 'token=abcdef123456' })
    const scope = scopeOf(scan)
    ledger.record({ scope, granted: true, decidedBy: 'user', at: 1, evidence: ['credential-value: [REDACTED]'], requestRef: 'call-1' })
    // identical retry / repeated history send: no re-prompt
    expect(decideOutbound(scan, DEST, ledger).action).toBe('send-granted')
    // destination change: new decision
    expect(decideOutbound(scan, OTHER, ledger).action).toBe('review')
    // added sensitive content: new fingerprint → new decision
    const more = scanOutbound({ text: 'token=abcdef123456 password=hunter2extra' })
    expect(decideOutbound(more, DEST, ledger).action).toBe('review')
  })

  it('keeps a refusal sticky — no implicit resend, no re-prompt loop', () => {
    const ledger = new DisclosureLedger()
    const scan = scanOutbound({ text: 'token=refusedsecret123' })
    ledger.record({ scope: scopeOf(scan), granted: false, decidedBy: 'reviewer', at: 1, evidence: [], requestRef: 'c' })
    const first = decideOutbound(scan, DEST, ledger)
    expect(first.action).toBe('block-refused')
    expect(first.reason).toContain('previously REFUSED')
    expect(decideOutbound(scan, DEST, ledger).action).toBe('block-refused')
  })
})

describe('llm/stream pre-send guard', () => {
  function harness(ledger: DisclosureLedger, reviewOutcome: 'granted' | 'denied' | 'unavailable' | 'threw') {
    const events: OutboundAuditEvent[] = []
    let reviewCalls = 0
    let sent = 0
    const guard = createOutboundGuard({
      ledger,
      requestPrivacyReview: async () => {
        reviewCalls += 1
        if (reviewOutcome === 'threw') throw new Error('review exploded')
        return reviewOutcome
      },
      onEvent: event => {
        events.push(event)
      },
    })
    const run = async (payload: Record<string, unknown>): Promise<void> => {
      const stream = guard({ provider: DEST.provider, model: DEST.model, sessionId: 'session-1', ...payload }, async function* () {
        sent += 1
        yield { type: 'finish' }
      })
      for await (const _chunk of stream) void _chunk
    }
    return { events, run, reviewCount: () => reviewCalls, sentCount: () => sent }
  }

  const SECRET_REQUEST = { messages: [{ role: 'user', text: 'token=verysecretvalue42' }] }

  it('passes clean requests straight through', async () => {
    const h = harness(new DisclosureLedger(), 'granted')
    await h.run({ messages: [{ text: 'hello' }] })
    expect(h.sentCount()).toBe(1)
    expect(h.reviewCount()).toBe(0)
  })

  it('preserves the prompt prefix and options for clean and ungated requests', async () => {
    for (const gated of [true, false]) {
      const options = {
        provider: DEST.provider, model: DEST.model, sessionId: 'stable-main-session',
        system: 'Stable system prompt', messages: [{ role: 'user', content: [{ type: 'text', text: 'Read the project readme.' }] }],
        tools: [{ name: 'read', description: 'Read a file', parameters: { type: 'object' } }],
      }
      const before = JSON.stringify(options)
      const messages = options.messages
      let passed = 0
      const guard = createOutboundGuard({
        ledger: new DisclosureLedger(), isGatedRequest: () => gated,
        requestPrivacyReview: async () => { throw new Error('clean request should not need review') },
      })
      for await (const chunk of guard(options, async function* () { passed++; yield { type: 'finish' } })) void chunk
      expect(passed).toBe(1)
      expect(options.messages).toBe(messages)
      expect(JSON.stringify(options)).toBe(before)
    }
  })

  it('sends only after a granted privacy review, and records the scoped grant', async () => {
    const ledger = new DisclosureLedger()
    const h = harness(ledger, 'granted')
    await h.run(SECRET_REQUEST)
    expect(h.sentCount()).toBe(1)
    expect(h.reviewCount()).toBe(1)
    const scan = scanOutbound(SECRET_REQUEST)
    expect(ledger.check({ ...scopeOf(scan), sessionId: 'session-1' })).toBe('granted')
    // identical retry: sent WITHOUT another review (no re-prompt loop)
    await h.run(SECRET_REQUEST)
    expect(h.sentCount()).toBe(2)
    expect(h.reviewCount()).toBe(1)
    expect(h.events[1]?.action).toBe('send-granted')
  })

  it('keeps a refused disclosure unsent and never re-prompts', async () => {
    const ledger = new DisclosureLedger()
    const h = harness(ledger, 'denied')
    await h.run(SECRET_REQUEST)
    expect(h.sentCount()).toBe(0)
    expect(h.reviewCount()).toBe(1)
    await h.run(SECRET_REQUEST)
    expect(h.sentCount()).toBe(0)
    expect(h.reviewCount()).toBe(1) // sticky refusal — no second review
    expect(h.events.at(-1)?.action).toBe('block-refused')
  })

  it('keeps an unavailable review unsent WITHOUT a sticky record', async () => {
    const ledger = new DisclosureLedger()
    const h = harness(ledger, 'unavailable')
    await h.run(SECRET_REQUEST)
    expect(h.sentCount()).toBe(0)
    // no sticky refusal: a later retry may review again (but stays unsent now)
    expect(ledger.check(scopeOf(scanOutbound(SECRET_REQUEST)))).toBe('unknown')
  })

  it('checks review requests too but never recurses (T06 recursion rule)', async () => {
    const ledger = new DisclosureLedger()
    const h = harness(ledger, 'granted')
    // inside a review scope the outbound hit blocks without another review
    await runInReviewScope(async () => h.run(SECRET_REQUEST))
    expect(h.sentCount()).toBe(0)
    expect(h.reviewCount()).toBe(0)
    expect(h.events.at(-1)?.action).toBe('block-unsent')
    expect(inReviewScope()).toBe(false)
  })

  it('never throws out of the seam — an internal failure leaves the request unsent', async () => {
    const h = harness(new DisclosureLedger(), 'threw')
    await expect(h.run(SECRET_REQUEST)).resolves.toBeUndefined()
    expect(h.sentCount()).toBe(0)
    expect(h.events.at(-1)?.action).toBe('block-unsent')
    expect(h.events.at(-1)?.reason).toContain('UNSENT')
  })

  it('mentions unscanned attachments in every decision note', async () => {
    const h = harness(new DisclosureLedger(), 'denied')
    await h.run({ ...SECRET_REQUEST, attachments: [{ name: 'file.bin' }] })
    expect(h.events.at(-1)?.reason).toContain('NOT scanned')
    expect(h.events.at(-1)?.reason).toContain('attachment')
  })
})

describe('llm/stream guard scope (安装前复核 R3)', () => {
  const SECRET_REQUEST = { messages: [{ role: 'user', text: 'token=verysecretvalue42' }] }

  /** Guard wired like the gate, where `isGatedRequest` says "not our session". */
  function outsiderHarness() {
    const events: OutboundAuditEvent[] = []
    let reviewCalls = 0
    let sent = 0
    const guard = createOutboundGuard({
      ledger: new DisclosureLedger(),
      isGatedRequest: () => false,
      requestPrivacyReview: async () => {
        reviewCalls += 1
        return 'granted'
      },
      onEvent: event => {
        events.push(event)
      },
    })
    // NO sessionId — exactly how the review call used to reach the guard and
    // be misfiled as a native "no-session" request.
    const run = async (payload: Record<string, unknown>): Promise<void> => {
      const stream = guard({ provider: DEST.provider, model: DEST.model, ...payload }, async function* () {
        sent += 1
        yield { type: 'finish' }
      })
      for await (const _chunk of stream) void _chunk
    }
    return { events, run, reviewCount: () => reviewCalls, sentCount: () => sent }
  }

  it('a REVIEW request is scanned even with no session id — and never recurses', async () => {
    const h = outsiderHarness()
    await runInReviewScope(async () => h.run(SECRET_REQUEST))
    expect(h.sentCount()).toBe(0) // sensitive review evidence stays unsent
    expect(h.reviewCount()).toBe(0) // no recursive privacy review
    expect(h.events.at(-1)?.action).toBe('block-unsent')
    expect(h.events.at(-1)?.reason).toContain('REVIEW')
  })

  it('ordinary NATIVE sessions are untouched — pass-through keeps native semantics', async () => {
    const h = outsiderHarness()
    await h.run(SECRET_REQUEST) // outside a review scope: native request
    expect(h.sentCount()).toBe(1)
    expect(h.reviewCount()).toBe(0)
  })

  it('a CLEAN review request still flows (redacted evidence is sendable)', async () => {
    const h = outsiderHarness()
    await runInReviewScope(async () => h.run({ messages: [{ text: 'Authorization: Bearer [REDACTED]' }] }))
    expect(h.sentCount()).toBe(1)
    expect(h.reviewCount()).toBe(0)
  })
})
