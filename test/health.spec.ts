import { isGateControlPath } from '../src/protected-paths.ts'
import { describe, expect, it } from 'vitest'
import { BlockAssembler } from '@deepseek-ai/dsh-llm'
import { createOutboundGuard, runInReviewScope, type OutboundOptionsLike } from '../src/privacy/outbound.ts'
import { scanOutbound, redactOutboundPayload } from '../src/privacy/detect.ts'
import { DisclosureLedger } from '../src/privacy/disclosure.ts'
import { withDeadline } from '../src/deadline.ts'
import { boundBatchEvidence, hashContent } from '../src/change/collect.ts'
import { callKeyOf } from '../src/gate/index.ts'
import { SettingsStore, runtimeSettingsFromConfig, MemorySettingsPersistence, resolveConfig } from '../src/index.ts'
import { AuditLog } from '../src/settings/audit.ts'

async function chunks(source: AsyncIterable<unknown>) { const list = []; for await (const item of source) list.push(item); return list }
const cleanReply = async function* () { yield { type: 'finish', reason: { kind: 'stop' } } }
const secret = 'ghp_FAKE_HEALTH_SYNTHETIC_123456'
const payload = { provider: 'main', model: 'model', sessionId: 's1', messages: [{ role: 'user', content: [{ type: 'text', text: `token=${secret}` }] }] }

describe('takeover failure regressions', () => {
  it.each(['const token: string = input;', 'const token = process.env.DEMO_TOKEN;', 'password: z.string()', 'api_key=[REDACTED]', 'token=null'])('does not mistake code/type/placeholder for a credential: %s', text => {
    expect(scanOutbound({ messages: [{ text }] }).findings).toEqual([])
  })
  it('ignores credential field names in tool schemas but inspects actual defaults', () => {
    expect(scanOutbound({ tools: [{ parameters: { properties: { api_key: { type: 'string' } } } }] }).findings).toEqual([])
    expect(scanOutbound({ messages: [{ password: 'x' }] }).findings).toHaveLength(1)
  })
  it.each(['"api_key": "x"', 'API_TOKEN=secret123', 'API_SECRET="secret123"', 'password="two words"', '--token plain-secret-value', '-----BEGIN PRIVATE KEY-----\nFAKEBODY\n-----END PRIVATE KEY-----'])('uses matching detection and redaction for %s', text => {
    expect(scanOutbound({ text }).findings.length).toBeGreaterThan(0)
    const clean = redactOutboundPayload({ text })
    expect(JSON.stringify(clean)).toContain('[REDACTED]')
    expect(scanOutbound(clean).findings).toEqual([])
    expect(JSON.stringify(clean)).not.toContain('FAKEBODY')
  })
  it('denial without recovery produces a real terminal error, never empty successful completion', async () => {
    let sent = 0
    const guard = createOutboundGuard({ ledger: new DisclosureLedger(), requestPrivacyReview: async () => ({ outcome: 'denied', reason: 'not authorized' }) })
    const result = await chunks(guard(payload, async function* () { sent++; yield* cleanReply() }))
    const assembler = new BlockAssembler()
    result.forEach(chunk => assembler.push(chunk as never))
    expect(result).toMatchObject([{ type: 'finish', reason: { kind: 'error', failure: { message: expect.stringContaining('not authorized') } } }])
    expect(sent).toBe(0)
  })
  it('re-enters the entire guard chain with a detached redacted request and preserves history', async () => {
    let reviews = 0
    const sent: OutboundOptionsLike[] = []
    const auditReasons: string[] = []
    const original = structuredClone(payload)
    Object.freeze(original)
    const guard: ReturnType<typeof createOutboundGuard> = createOutboundGuard({
      ledger: new DisclosureLedger(), requestPrivacyReview: async () => { reviews++; return { outcome: 'denied', reason: 'destination not authorized' } },
      restart: options => guard(options, async function* () { sent.push(options); yield* cleanReply() }),
      onEvent: event => { auditReasons.push(event.reason) },
    })
    for (let i = 0; i < 3; i++) await chunks(guard(original, () => { throw new Error('raw request dispatched') }))
    expect(reviews).toBe(1)
    expect(sent).toHaveLength(3)
    expect(JSON.stringify(sent)).not.toContain(secret)
    expect(auditReasons.some(reason => reason.includes('destination not authorized'))).toBe(true)
    expect(new Set(sent.map(options => options.system)).size).toBe(1)
    expect(JSON.stringify(original)).toContain(secret)
  })
  it('does not share disclosure grants between sessions', async () => {
    let reviews = 0
    const guard = createOutboundGuard({ ledger: new DisclosureLedger(), requestPrivacyReview: async () => { reviews++; return 'granted' } })
    await chunks(guard(payload, cleanReply))
    await chunks(guard({ ...payload, sessionId: 's2' }, cleanReply))
    expect(reviews).toBe(2)
  })
  it('keeps consecutive redacted requests prefix-stable despite changing privacy reasons', async () => {
    let reviews = 0
    const sent: OutboundOptionsLike[] = []
    const audited: string[] = []
    const guard = createOutboundGuard({
      ledger: new DisclosureLedger(),
      requestPrivacyReview: async () => ({ outcome: 'unavailable', reason: `Review temporarily unavailable, attempt ${++reviews}` }),
      restart: async function* (options) { sent.push(options); yield* cleanReply() },
      onEvent: event => { audited.push(event.reason) },
    })
    const history = [...payload.messages]
    for (let i = 0; i < 3; i++) {
      await chunks(guard({ ...payload, system: 'Fixed project instructions', messages: structuredClone(history) }, () => { throw new Error('raw disclosure dispatched') }))
      history.push({ role: 'user', content: [{ type: 'text', text: `Continue safe work ${i}` }] })
    }
    expect(reviews).toBe(3)
    expect(sent).toHaveLength(3)
    expect(new Set(sent.map(options => options.system)).size).toBe(1)
    for (let i = 1; i < sent.length; i++) {
      const prior = sent[i - 1]!.messages as unknown[]
      expect((sent[i]!.messages as unknown[]).slice(0, prior.length)).toEqual(prior)
      expect(sent[i]!.sessionId).toBe(payload.sessionId)
    }
    expect(JSON.stringify(sent)).not.toContain(secret)
    expect(audited.some(reason => reason.includes('attempt 3'))).toBe(true)
  })
  it('review requests never recursively review or recover residual secrets', async () => {
    let nested = 0
    const owners: string[] = []
    const guard = createOutboundGuard({ ledger: new DisclosureLedger(), isGatedRequest: () => false,
      requestPrivacyReview: async () => { nested++; return 'granted' }, restart: cleanReply,
      onEvent: event => { owners.push(event.requestRef) },
    })
    const result = await runInReviewScope(() => chunks(guard({ ...payload, sessionId: 'review-cache-id' }, cleanReply)), 'protected-parent')
    expect(nested).toBe(0)
    expect(result).toMatchObject([{ reason: { kind: 'error' } }])
    expect(owners).toEqual(['protected-parent'])
  })
  it('does not swallow errors raised by a downstream adapter', async () => {
    const guard = createOutboundGuard({ ledger: new DisclosureLedger(), requestPrivacyReview: async () => 'granted' })
    await expect(chunks(guard({ messages: [] }, () => { throw new Error('adapter failed') }))).rejects.toThrow('adapter failed')
  })
  it('bounds noncooperative async work and rejects late success', async () => {
    let finish!: (value: string) => void
    let seenSignal: AbortSignal | undefined
    const result = await withDeadline(10, undefined, signal => { seenSignal = signal; return new Promise<string>(resolve => { finish = resolve }) }, kind => kind)
    expect(result).toBe('timeout')
    expect(seenSignal?.aborted).toBe(true)
    finish('late-allow')
    const cancelled = new AbortController()
    const task = withDeadline(5000, cancelled.signal, () => new Promise<string>(() => {}), kind => kind)
    cancelled.abort()
    expect(await task).toBe('cancelled')
  })
  it('does not mark omitted file content as reviewed evidence', () => {
    const snapshot = boundBatchEvidence({ collectedAt: 0, gaps: [], files: [
      { path: 'a.ts', kind: 'untracked', contentHash: hashContent('a'), reviewText: 'a' },
      { path: 'b.ts', kind: 'untracked', contentHash: hashContent('12345'), reviewText: '12345' },
    ] }, 3)
    expect(snapshot.files[0]?.reviewText).toBe('a')
    expect(snapshot.files[1]?.reviewText).toBeUndefined()
    expect(snapshot.gaps).toContain('b.ts: content omitted from aggregate evidence budget; NOT reviewed')
  })
  it('does not confuse distinct opaque tokens with the same display label', () => {
    const one = { token: Symbol('exec') }; const two = { token: Symbol('exec') }
    expect(callKeyOf(one)).not.toBe(callKeyOf(two))
    expect(callKeyOf(one)).toBe(callKeyOf(one))
  })
  it('redacts bare credential patterns in audit reasons', () => {
    const audit = new AuditLog()
    audit.append({ at: 0, callId: 'a', toolName: 'pwsh', tier: 'daily', configVersion: 'v1', model: 'r', decision: 'deny', reason: secret, durationMs: 1, usage: 'unknown' })
    expect(JSON.stringify(audit.recent())).not.toContain(secret)
  })
  it('validates persisted overrides before they can corrupt the running config', () => {
    const persistence = new MemorySettingsPersistence()
    persistence.save({ reviewerModel: { poisoned: true }, defaultTier: 'invalid', evidenceRoundsDaily: -2, reviewerModelProvider: 'valid-provider' })
    const store = new SettingsStore(runtimeSettingsFromConfig(resolveConfig({ reviewerModel: 'base-model' })), persistence)
    expect(store.get().reviewerModel).toBe('base-model')
    expect(store.get().defaultTier).toBe('daily')
    expect(store.get().reviewerModelProvider).toBe('valid-provider')
    expect(store.describePersistence()).toContain('invalid saved fields ignored')
  })
  it('marks image bytes as unscanned even when attached through real content blocks', () => {
    expect(scanOutbound({ messages: [{ content: [{ type: 'image', attachment: { id: 'test-image' } }] }] }).attachmentsUnscanned).toBe(true)
  })

  it('identifies edits to its own code and host permission configuration as control changes', () => {
    expect(isGateControlPath('src/gate/index.ts', process.cwd())).toBe(true)
    expect(isGateControlPath('lib/index.js', process.cwd())).toBe(true)
    expect(isGateControlPath('docs/notes.md', process.cwd())).toBe(false)
    expect(isGateControlPath('C:/Users/example/.dsh/profiles/desktop/cordis.patch.yml')).toBe(true)
  })

})
