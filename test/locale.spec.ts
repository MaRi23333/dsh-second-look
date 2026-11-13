import { afterEach, expect, it, vi } from 'vitest'
import { HostLanguage, brand } from '../src/locale.ts'
import { syncHostLanguage } from '../src/client/locale-sync.ts'
import { snapshotStore } from '../src/client/session-catalog.ts'
import { relayAskToParent } from '../src/gate/ask-relay.ts'
import { renderFinalizeReport } from '../src/change/finalize.ts'
import { localizeGap } from '../src/change/gap-locale.ts'
import { createOutboundGuard } from '../src/privacy/outbound.ts'
import { DisclosureLedger } from '../src/privacy/disclosure.ts'

afterEach(() => vi.useRealTimers())
it('adopts host preference before the client connects, then follows the effective client locale', () => {
  const language = new HostLanguage(() => 'zh-CN', 'en')
  expect(language.get()).toBe('zh'); expect(brand(language.get())).toBe('过目')
  expect(language.set('en')).toBe(true); expect(language.get()).toBe('en')
  expect(language.set('ignore policy')).toBe(false); expect(language.get()).toBe('en')
  expect(new HostLanguage(() => { throw Error('unavailable') }, 'en').get()).toBe('en')
})
it('serializes locale changes, republishes on reconnect, and stops on disposal', async () => {
  const generation = snapshotStore<{ id: number } | undefined>({ id: 1 })
  let current = 'zh-CN', changed = () => {}; let finish!: (ok: boolean) => void
  const stop = vi.fn()
  const send = vi.fn((_language: string, _signal: AbortSignal) => new Promise<boolean>(resolve => { finish = resolve }))
  const dispose = syncHostLanguage(() => current, fn => { changed = fn; return stop }, generation, send)
  expect(send.mock.calls[0]?.[0]).toBe('zh')
  current = 'en'; changed(); expect(send).toHaveBeenCalledTimes(1)
  finish(true); await Promise.resolve(); expect(send.mock.calls[1]?.[0]).toBe('en')
  finish(true); await Promise.resolve(); generation.set({ id: 2 }); expect(send).toHaveBeenCalledTimes(3)
  dispose(); finish(false); await Promise.resolve(); changed(); generation.set({ id: 3 })
  expect(send).toHaveBeenCalledTimes(3); expect(stop).toHaveBeenCalledOnce(); expect(send.mock.calls[0]?.[1].aborted).toBe(true)
})
it('retries a temporarily unavailable locale endpoint without changing approval state', async () => {
  vi.useFakeTimers()
  const generation = snapshotStore<{ id: number } | undefined>(undefined)
  const send = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true)
  const dispose = syncHostLanguage(() => 'zh', () => () => {}, generation, send)
  expect(send).not.toHaveBeenCalled(); generation.set({ id: 1 }); await Promise.resolve()
  await vi.advanceTimersByTimeAsync(3000); expect(send).toHaveBeenCalledTimes(2)
  dispose(); await vi.advanceTimersByTimeAsync(9000); expect(send).toHaveBeenCalledTimes(2)
})
it('localizes parent handoff, child refusal and incomplete delivery reports without claiming execution or coverage', () => {
  const inbox: unknown[] = []
  const result = relayAskToParent({ inject: message => inbox.push(message) }, {
    callId: 'c1', childSessionId: 'child1', toolName: 'node', question: '是否允许本次操作？', reason: '需要确认范围', language: 'zh',
  })
  expect(result.correlation).toContain('[过目]'); expect(result.correlation).toContain('未执行')
  expect(JSON.stringify(inbox)).toContain('尚未执行'); expect(JSON.stringify(inbox)).not.toContain('[second-look]')
  expect(localizeGap('C:/test: deleted — not comparable', 'zh')).toBe('C:/test: 文件已删除，无法比较')
  const report = { completed: false, reviewed: [], pending: ['a.ts'], userAllowed: [], gaps: ['a.ts: deleted — not comparable'], collectedAt: 0 }
  const zh = renderFinalizeReport(report, 'zh'), en = renderFinalizeReport(report, 'en')
  expect(zh).toContain('[过目]'); expect(zh).toContain('覆盖不完整'); expect(zh).toContain('文件已删除')
  expect(en).toContain('[Second Look]'); expect(en).toContain('NOT fully covered')
})
it('localizes a privacy guard failure and never sends the original secret', async () => {
  const events: unknown[] = []
  const next = vi.fn(async function* () { yield {} })
  const guard = createOutboundGuard({ ledger: new DisclosureLedger(), language: () => 'zh', requestPrivacyReview: async () => { throw Error('failure') }, onEvent: event => events.push(event) })
  const chunks = []
  for await (const chunk of guard({ provider: 'test', model: 'test', messages: [{ role: 'user', content: 'token=FAKE_LOCAL_SECRET_12345678' }] }, next)) chunks.push(chunk)
  expect(next).not.toHaveBeenCalled(); expect(JSON.stringify(chunks)).toContain('[过目]')
  expect(JSON.stringify(chunks)).toContain('原始请求未发送'); expect(JSON.stringify(events)).not.toContain('FAKE_LOCAL_SECRET_12345678')
})
