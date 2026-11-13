// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuditPanel } from '../src/client/AuditPanel.tsx'
import { auditZh, auditEn } from '../src/client/audit-locales.ts'
import { groupAudit, exportAudit } from '../src/client/audit-view.ts'
import type { AuditRecord, AuditResponse } from '../src/client/settings-api.ts'

const row = (extra: Partial<AuditRecord> = {}): AuditRecord => ({
  at: 1000, sessionId: 'session-a', callId: 'call-a', toolName: 'pwsh', tier: 'daily',
  configVersion: 'test', model: 'reviewer', decision: 'ask_user', reason: '删除范围需要确认',
  durationMs: 12000, usage: 'unknown', ...extra,
})
let root: Root
let el: HTMLDivElement
beforeEach(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el) })
afterEach(async () => { await act(async () => root.unmount()); el.remove(); vi.restoreAllMocks() })
const t = (key: keyof typeof auditZh) => auditZh[key]
async function click(text: string) {
  const button = [...el.querySelectorAll('button')].find(b => b.textContent === text)
  expect(button).toBeDefined()
  await act(async () => button!.click())
}
async function mount(audit: () => Promise<AuditResponse>, clearAudit = async () => ({ ok: true })) {
  await act(async () => root.render(<AuditPanel t={t} audit={audit} clearAudit={clearAudit} />))
}
describe('approval history', () => {
  it('shows durable blocks separately, exports their retention, and clears only the selected history', async () => {
    const clear = vi.fn(async () => ({ ok: true }))
    await mount(async () => ({ ok: true, records: [row({ decision: 'allow', reason: 'recent approval' })],
      blockedRecords: [row({ decision: 'outbound-blocked', reason: 'retained outbound refusal' })] }), clear)
    expect(el.textContent).not.toContain('retained outbound refusal')
    await click('拒绝与拦截')
    expect(el.textContent).toContain('retained outbound refusal')
    expect(el.textContent).toContain('出站拦截')
    expect(el.textContent).toContain('100')
    expect(JSON.parse(exportAudit([row()], 'blocked')).retention).toContain('persistent')
    await click('清空记录'); await click('确认清空')
    expect(clear).toHaveBeenCalledWith('blocked')
    expect(el.querySelectorAll('details')).toHaveLength(0)
    await click('最近记录')
    expect(el.textContent).toContain('recent approval')
  })
  it('groups same-session decisions, keeps human transition, and separates sessions', () => {
    const entries = groupAudit([row({ at: 2000, decision: 'human-settled', model: 'human', humanOutcome: 'allowed-once' }), row(), row({ sessionId: 'session-b' })])
    expect(entries).toHaveLength(2); expect(entries[0]?.records).toHaveLength(2)
    expect(entries[0]?.category).toBe('allow')
    expect(groupAudit([row({ sessionId: undefined }), row({ sessionId: undefined })])).toHaveLength(2)
  })
  it('shows a human outcome with original reason and expands the timeline', async () => {
    await mount(async () => ({ ok: true, records: [row({ at: 2000, decision: 'human-settled', model: 'human', humanOutcome: 'allowed-once', reason: 'human settled' }), row()] }))
    expect(el.querySelectorAll('details')).toHaveLength(1)
    expect(el.querySelector('summary')?.textContent).toContain('用户允许')
    expect(el.querySelector('summary')?.textContent).toContain('删除范围需要确认')
    await act(async () => el.querySelector('summary')!.click())
    expect(el.querySelector('details')?.open).toBe(true)
    expect(el.textContent).toContain('转人工'); expect(el.textContent).toContain('12.0 秒')
  })
  it('filters and paginates without dropping export data', async () => {
    const records = Array.from({ length: 8 }, (_, i) => row({ at: i + 1, callId: String(i), decision: i === 7 ? 'deny' : 'allow' }))
    await mount(async () => ({ ok: true, records }))
    expect(el.querySelectorAll('details')).toHaveLength(5)
    await click('查看更多'); expect(el.querySelectorAll('details')).toHaveLength(8)
    await act(async () => { const select = el.querySelector('select')!; select.value = 'deny'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(el.querySelectorAll('details')).toHaveLength(1)
    expect(JSON.parse(exportAudit(records)).records).toHaveLength(8)
    expect(exportAudit([row({ extra: 'must-not-export' } as Partial<AuditRecord>)])).not.toContain('must-not-export')
  })
  it('requires confirmation, keeps records on failed clear, then clears successfully', async () => {
    const clear = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true })
    await mount(async () => ({ ok: true, records: [row()] }), clear)
    await click('清空记录'); expect(clear).not.toHaveBeenCalled()
    await click('确认清空'); expect(el.querySelectorAll('details')).toHaveLength(1); expect(el.textContent).toContain('清空失败')
    await click('确认清空'); expect(el.querySelectorAll('details')).toHaveLength(0); expect(el.textContent).toContain('记录已清空')
  })
  it('distinguishes failed load from empty history and allows retry', async () => {
    const audit = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ok: true, records: [] })
    await mount(audit); expect(el.textContent).toContain('记录读取失败'); expect(el.textContent).not.toContain('暂无审批记录')
    await click('刷新'); expect(el.textContent).toContain('暂无审批记录')
  })
  it('does not render HTML carried by a review reason', async () => {
    await mount(async () => ({ ok: true, records: [row({ reason: '<img src=x onerror=alert(1)>' })] }))
    expect(el.querySelector('img')).toBeNull(); expect(el.textContent).toContain('<img src=x')
  })
  it('downloads a JSON snapshot and cleans up the download anchor', async () => {
    const create = vi.fn().mockReturnValue('blob:audit')
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await mount(async () => ({ ok: true, records: [row()] }))
    await click('导出日志'); expect(create).toHaveBeenCalledOnce(); expect(download).toHaveBeenCalledOnce()
    expect(document.querySelector('a[download]')).toBeNull()
  })
})

it('labels the existing outbound model as destination in both languages, never as reviewer', async () => {
  const records = [row({ decision: 'outbound-blocked', model: 'deepseek-account/deepseek-flash' })]
  const audit = async () => ({ ok: true, records })
  await mount(audit)
  expect(el.querySelector('.sl-audit-meta')?.textContent).toContain('发送目标模型: deepseek-account/deepseek-flash')
  expect(el.querySelector('.sl-audit-meta')?.textContent).not.toContain('审核模型')
  await act(async () => root.render(<AuditPanel t={key => auditEn[key]} audit={audit} clearAudit={async () => ({ ok: true })} />))
  expect(el.querySelector('.sl-audit-meta')?.textContent).toContain('Destination model: deepseek-account/deepseek-flash')
  expect(el.querySelector('.sl-audit-meta')?.textContent).not.toContain('Reviewer')
  expect(JSON.parse(exportAudit(records)).records[0]).toMatchObject({ model: 'deepseek-account/deepseek-flash', modelRole: 'destination' })
})
it('continues to identify a tool review model as reviewer', async () => {
  await mount(async () => ({ ok: true, records: [row({ model: 'opencodex/gemini' })] }))
  expect(el.querySelector('.sl-audit-meta')?.textContent).toContain('审核模型: opencodex/gemini')
  expect(el.querySelector('.sl-audit-meta')?.textContent).not.toContain('发送目标模型')
})
