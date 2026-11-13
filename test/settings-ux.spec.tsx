// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { GateSettings, type GateSettingsProps } from '../src/client/SettingsCard.tsx'
import { zh } from '../src/client/settings-locales.ts'
import { loadReviewerCatalog } from '../src/client/reviewer-catalog.ts'
import type { GateConfigView, GatePatch } from '../src/client/settings-api.ts'
let root: Root, el: HTMLDivElement
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); el = document.createElement('div'); document.body.append(el); root = createRoot(el) })
afterEach(async () => { await act(async () => root.unmount()); el.remove(); vi.restoreAllMocks() })
const catalog = { groups: [{ id: 'google', name: 'Google', models: [{ id: 'argon', name: 'Argon', reasoning: { efforts: [{ id: 'high', name: 'High' }] } }, { id: 'flash', name: 'Flash', reasoning: { efforts: [{ id: 'low', name: 'Low' }] } }] }], failures: [] }
function setup(extra: Partial<GateSettingsProps> = {}) {
  let view: GateConfigView = { ok: true, reviewerModelProvider: 'google', reviewerModel: 'argon', reviewerReasoningEffort: 'high', daily: { totalTimeoutMs: 60000 } }
  const save = vi.fn(async (patch: GatePatch) => { view = { ...view, ...patch } as GateConfigView; return view })
  const audit = vi.fn(async () => ({ ok: true, records: [] }))
  const props = { t: (key: keyof typeof zh) => zh[key], config: async () => view, saveConfig: save, status: async () => ({ ok: true, healthy: true }), audit, clearAudit: async () => ({ ok: true }), modelCatalog: async () => ({ ok: true, value: catalog }), ...extra } as GateSettingsProps
  return { props, save, audit }
}
async function click(selector: string) { await act(async () => el.querySelector<HTMLButtonElement>(selector)!.click()) }
async function select(selector: string, value: string) { await act(async () => { const input = el.querySelector<HTMLSelectElement>(selector)!; input.value = value; input.dispatchEvent(new Event('change', { bubbles: true })) }) }
async function fill(selector: string, value: string) { await act(async () => { const input = el.querySelector<HTMLInputElement>(selector)!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })) }) }
it('discovers models, resets an incompatible effort, preserves drafts across tabs and saves only changed fields', async () => {
  const { props, save, audit } = setup(); await act(async () => root.render(<GateSettings {...props} />))
  expect(audit).not.toHaveBeenCalled()
  await select('#sl-base-model', 'flash')
  expect(el.querySelector<HTMLSelectElement>('#sl-base-effort')!.value).toBe('')
  expect(el.querySelector('#sl-base-effort')!.textContent).toContain('低')
  expect(el.querySelector('#sl-base-effort')!.textContent).not.toContain('高')
  await click('#sl-tab-history'); expect(audit).toHaveBeenCalledOnce(); expect(el.querySelector('.sl-saveState')!.textContent).toContain('未保存')
  await click('#sl-tab-settings'); expect(el.querySelector<HTMLSelectElement>('#sl-base-model')!.value).toBe('flash')
  await click('.sl-save'); expect(save).toHaveBeenCalledWith({ reviewerModel: 'flash', reviewerReasoningEffort: null })
  expect(el.querySelector('.sl-readyRoute')!.textContent).toContain('flash')
  await act(async () => root.unmount()); root = createRoot(el); await act(async () => root.render(<GateSettings {...props} />))
  expect(el.querySelector<HTMLSelectElement>('#sl-base-model')!.value).toBe('flash')
})
it('preserves custom routes on catalog failure and save failure, retries discovery without replacing edits', async () => {
  const discovery = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true, value: catalog })
  const { props } = setup({ modelCatalog: discovery, saveConfig: async () => ({ ok: false, error: 'save-failed' }) })
  await act(async () => root.render(<GateSettings {...props} />)); await fill('#sl-base-model', 'custom-reviewer'); await click('.sl-save')
  expect(el.querySelector<HTMLInputElement>('#sl-base-model')!.value).toBe('custom-reviewer'); expect(el.textContent).toContain('设置未能写入磁盘')
  await click('.sl-catalogStatus button'); expect(el.querySelector<HTMLSelectElement>('#sl-base-model')!.value).toBe('custom-reviewer')
  expect(el.querySelector('#sl-base-model')!.textContent).toContain('当前自定义值')
  await click('.sl-discard'); expect(el.querySelector<HTMLSelectElement>('#sl-base-model')!.value).toBe('argon')
})
it('clears separate enhanced settings explicitly and can undo before saving', async () => {
  const { props, save } = setup({ config: async () => ({ ok: true, reviewerModelProvider: 'google', reviewerModel: 'argon', strictReviewerModel: 'flash', strictReviewerReasoningEffort: 'low' }) })
  await act(async () => root.render(<GateSettings {...props} />)); await click('.sl-sectionRow button'); await click('.sl-resetRoute')
  expect(el.querySelector('.sl-inheritSummary')!.textContent).toContain('复用基础'); expect(save).not.toHaveBeenCalled()
  await click('.sl-discard'); expect(el.querySelector<HTMLSelectElement>('#sl-strict-model')!.value).toBe('flash'); expect(el.querySelector('.sl-inheritSummary')!.textContent).toContain('思考强度: 低 (独立设置)')
  await click('.sl-resetRoute'); await click('.sl-save'); expect(save).toHaveBeenCalledWith({ strictReviewerModel: null, strictReviewerReasoningEffort: null })
})
it('searches reasons and keeps its filter when leaving and returning to history', async () => {
  const audit = vi.fn(async () => ({ ok: true, records: [{ at: 1000, sessionId: 'session-test', callId: 'call-1', toolName: 'node', tier: 'daily', configVersion: 'v1', model: 'argon', decision: 'deny', reason: '私钥上传', durationMs: 100, usage: 'unknown' }] }))
  const { props } = setup({ audit: audit as GateSettingsProps['audit'] }); await act(async () => root.render(<GateSettings {...props} />)); await click('#sl-tab-history')
  await fill('.sl-audit-search', 'not-found'); expect(el.querySelectorAll('.sl-audit-entry')).toHaveLength(0); expect(el.textContent).toContain('没有匹配')
  await click('#sl-tab-settings'); await click('#sl-tab-history'); expect(el.querySelector<HTMLInputElement>('.sl-audit-search')!.value).toBe('not-found')
  await fill('.sl-audit-search', '私钥'); expect(el.querySelectorAll('.sl-audit-entry')).toHaveLength(1)
})
it('handles a rejected model RPC without choosing a working model or clearing configuration', async () => {
  expect(await loadReviewerCatalog({ session: { modelCatalog: async () => { throw new Error('offline') } } })).toEqual({ ok: false })
  expect(await loadReviewerCatalog({ session: { modelCatalog: async () => ({ ok: true, value: catalog }) } })).toEqual({ ok: true, value: catalog })
})
