// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { GateSettings, type GateSettingsProps } from '../src/client/SettingsCard.tsx'
import { en, zh } from '../src/client/settings-locales.ts'
import type { GatePatch } from '../src/client/settings-api.ts'

it('brands settings in either language and never stages the legacy global defaultTier', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const element = document.createElement('div'); document.body.appendChild(element)
  const root = createRoot(element)
  const view = { ok: true, reviewerModel: 'reviewer', defaultTier: 'strict' as const, savedKeys: ['reviewerModel'] }
  const save = vi.fn(async (_patch: GatePatch) => view)
  const props = {
    config: async () => view, saveConfig: save,
    status: async () => ({ ok: true, healthy: true }),
    audit: async () => ({ ok: true, records: [] }), clearAudit: async () => ({ ok: true }),
    t: (key: keyof typeof en) => en[key],
  } as unknown as GateSettingsProps
  try {
    await act(async () => root.render(<GateSettings {...props} />))
    expect(element.querySelector('.sl-title')?.textContent).toBe('Second Look')
    expect(element.querySelector('.sl-scopeNote')?.textContent).toContain('each conversation')
    expect(element.textContent).not.toContain('Default tier')
    await act(async () => { const input = element.querySelector<HTMLInputElement>('#sl-base-model')!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'changed'); input.dispatchEvent(new Event('input', { bubbles: true })) })
    await act(async () => element.querySelector<HTMLButtonElement>('.sl-save')!.click())
    expect(save).toHaveBeenCalledOnce()
    expect(save.mock.calls[0]?.[0]).not.toHaveProperty('defaultTier')
    await act(async () => root.render(<GateSettings {...props} t={key => zh[key]} />))
    expect(element.querySelector('.sl-title')?.textContent).toBe('过目')
    expect(element.textContent).not.toContain('默认档位')
  } finally { await act(async () => root.unmount()); element.remove() }
})


it('renders save failures in the active locale without leaking English server text', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const element = document.createElement('div'); document.body.appendChild(element)
  const root = createRoot(element)
  const view = { ok: true, reviewerModel: 'reviewer', savedKeys: ['reviewerModel'] }
  const props = { config: async () => view,
    saveConfig: async () => ({ ok: false, error: 'save-failed', message: 'raw English storage exception' }),
    status: async () => ({ ok: true, healthy: true }), audit: async () => ({ ok: true, records: [] }), clearAudit: async () => ({ ok: true }),
    t: (key: keyof typeof zh) => zh[key],
  } as unknown as GateSettingsProps
  try {
    await act(async () => root.render(<GateSettings {...props} />))
    await act(async () => { const input = element.querySelector<HTMLInputElement>('#sl-base-model')!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'changed'); input.dispatchEvent(new Event('input', { bubbles: true })) })
    await act(async () => element.querySelector<HTMLButtonElement>('.sl-save')!.click())
    expect(element.textContent).toContain('设置未能写入磁盘'); expect(element.textContent).not.toContain('raw English')
    await act(async () => root.render(<GateSettings {...props} t={key => en[key]} />))
    expect(element.textContent).toContain('Settings could not be written to disk')
  } finally { await act(async () => root.unmount()); element.remove() }
})
