// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SessionPicker, type SessionPickerProps } from '../src/client/SessionPicker.tsx'
import { accessEn, accessZh } from '../src/client/session-locales.ts'
import { snapshotStore, type CatalogState } from '../src/client/session-catalog.ts'
import { apply } from '../src/client/index.ts'
import type { Context } from '@deepseek-ai/cordis'

// Exercise our picker with the public native primitive contract; native modal
// internals are host-owned, so these stubs expose its acknowledgement boundary.
vi.mock('../src/client/native-primitives.ts', () => ({
  Menu: (props: { open: boolean; anchor: ReactNode; items: { id: string; label: ReactNode; icon?: ReactNode }[]; onSelect: (id: string) => void }) => <>{props.anchor}{props.open ? <div role="menu">{props.items.map(item => <button key={item.id} data-preset={item.id} onClick={() => props.onSelect(item.id)}>{item.icon}{item.label}</button>)}</div> : null}</>,
  IconChevronDownOutlineRegular: () => <svg data-icon="chevron" />,
  PermissionIconReadOnlyRegular: () => <svg data-icon="readonly" />,
  PermissionIconWorkspaceWriteRegular: () => <svg data-icon="workspace" />,
  PermissionIconFullAccessRegular: () => <svg data-icon="full" />,
  PermissionIconAutoReviewRegular: () => <svg data-icon="auto" />,
  RiskConfirmation: (props: { title: string; description: string; acknowledged: boolean; onAcknowledgedChange: (value: boolean) => void; onCancel: () => void; onConfirm: () => void; confirmLabel: string }) => <div role="dialog"><h1>{props.title}</h1><p>{props.description}</p><input type="checkbox" checked={props.acknowledged} onChange={event => props.onAcknowledgedChange(event.target.checked)} /><button onClick={props.onCancel}>cancel-dialog</button><button disabled={!props.acknowledged} onClick={props.onConfirm}>{props.confirmLabel}</button></div>,
}))

const ids = ['read-only', 'workspace-write', 'danger-full-access', 'auto', 'second-look-daily', 'second-look-strict']
const catalog = { options: ids.map(value => ({ value, name: value })), defaultOptions: [], defaultPreset: 'read-only' }
let root: Root
let el: HTMLDivElement
let value: string
let store: ReturnType<typeof snapshotStore<CatalogState>>
let select: ReturnType<typeof vi.fn<SessionPickerProps['select']>>
let retry: ReturnType<typeof vi.fn>
const translator = (dict: typeof accessEn) => (key: string, params?: Record<string, unknown>) => (dict[key as keyof typeof dict] ?? key).replace('{name}', String(params?.name ?? ''))
function props(extra: Partial<SessionPickerProps> = {}): SessionPickerProps {
  return { sessionKey: 'session-a', locked: false, catalogStore: store, retryCatalog: retry, select, useProjection: () => ({ currentValue: value }), t: translator(accessEn), ...extra } as SessionPickerProps
}
async function render(extra: Partial<SessionPickerProps> = {}) { await act(async () => root.render(<SessionPicker {...props(extra)} />)) }
async function click(selector: string) { const target = el.querySelector<HTMLButtonElement>(selector); expect(target).not.toBeNull(); await act(async () => target!.click()) }
async function choose(id: string) { await click('.sl-permission'); await click(`[data-preset="${id}"]`) }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el)
  value = 'read-only'; store = snapshotStore({ value: catalog, connected: true, error: false, revision: 1 } as CatalogState)
  select = vi.fn(async () => true); retry = vi.fn()
})
afterEach(async () => { await act(async () => root.unmount()); el.remove(); vi.restoreAllMocks() })

it('shows both tiers with localized copy', async () => {
  await render(); await click('.sl-permission')
  expect(el.textContent).toContain('Routine review'); expect(el.textContent).toContain('Enhanced review')
  expect(el.querySelector('[data-preset="second-look"]')).toBeNull()
  expect(el.querySelectorAll('[data-preset^="second-look-"] svg')).toHaveLength(2)
  await render({ t: translator(accessZh) }); expect(el.textContent).toContain('日常审查'); expect(el.textContent).toContain('加强审查')
})
it('submits either tier once, leaves projection confirmation to the host, and recovers from failure', async () => {
  select.mockRejectedValueOnce(new Error('offline'))
  await render(); await choose('second-look-daily')
  expect(select).toHaveBeenLastCalledWith('second-look-daily'); expect(el.textContent).toContain('Switch failed')
  await choose('second-look-strict'); expect(select).toHaveBeenLastCalledWith('second-look-strict'); expect(el.textContent).not.toContain('Switch failed')
  expect(el.querySelector('.sl-permission-label')?.textContent).toBe('Read Only')
  value = 'second-look-strict'; await render(); expect(el.querySelector('.sl-permission-label')?.textContent).toBe('Enhanced review')
})
it.each(['danger-full-access', 'auto'])('keeps native risk acknowledgement before %s', async id => {
  await render(); await choose(id); expect(select).not.toHaveBeenCalled()
  expect(el.querySelector('[role="dialog"]')?.textContent).toContain(id === 'auto' ? 'without a sandbox' : 'sensitive operations')
  await click('[role="dialog"] button:last-child'); expect(select).not.toHaveBeenCalled()
  await click('[role="dialog"] input'); await click('[role="dialog"] button:last-child'); expect(select).toHaveBeenCalledWith(id)
})
it('revokes confirmation and stale options on catalog invalidation, disconnect and session switch', async () => {
  await render(); await choose('auto')
  await act(async () => store.set({ value: null, connected: false, error: false, revision: 2 }))
  expect(el.querySelector('[role="dialog"]')).toBeNull(); expect(el.querySelector('[role="menu"]')).toBeNull()
  expect(el.querySelector<HTMLButtonElement>('.sl-permission')?.disabled).toBe(true)
  await act(async () => store.set({ value: null, connected: true, error: true, revision: 3 }))
  await click('.sl-permission'); expect(retry).toHaveBeenCalledOnce()
  await act(async () => store.set({ value: catalog, connected: true, error: false, revision: 4 }))
  await choose('auto'); await render({ sessionKey: 'session-b' }); expect(el.querySelector('[role="dialog"]')).toBeNull()
})
it('ignores a previous session pending result and ignores completion after unmount', async () => {
  let settle!: (ok: boolean) => void
  select.mockImplementationOnce(() => new Promise(resolve => { settle = resolve }))
  await render(); await choose('second-look-strict'); expect(el.querySelector<HTMLButtonElement>('.sl-permission')?.disabled).toBe(true)
  await render({ sessionKey: 'session-b' }); await act(async () => settle(false))
  expect(el.textContent).not.toContain('Switch failed'); expect(el.querySelector<HTMLButtonElement>('.sl-permission')?.disabled).toBe(false)
  select.mockImplementationOnce(() => new Promise(resolve => { settle = resolve }))
  await choose('second-look-daily'); await act(async () => root.render(null)); await act(async () => settle(false)); expect(el.textContent).toBe('')
})

it('registers the official shadow slot, commands only its bound session, and releases resources', async () => {
  const disposals: (() => void)[] = []
  const commandA = vi.fn(async () => ({ ok: true, value: { matched: true } }))
  const commandB = vi.fn(async () => ({ ok: true, value: { matched: true } }))
  const unregister = vi.fn()
  const stopEvent = vi.fn()
  const generation = snapshotStore<{ id: number } | undefined>({ id: 1 })
  let injected!: (id: string) => SessionPickerInjectedForTest
  let registeredPriority: number | undefined
  const context = {
    locale: { register: () => () => undefined, bind: () => translator(accessEn) },
    effect: (fn: () => void | (() => void)) => { const stop = fn(); if (stop) disposals.push(stop) },
    get: () => ({ generation }),
    on: () => () => undefined,
    remote: { $on: () => stopEvent, permissionPresets: { catalog: async () => ({ ok: true, value: catalog }) } },
    sessions: { binding: (id: string) => id === 'session-a' ? { session: { command: commandA } } : id === 'session-b' ? { session: { command: commandB } } : undefined },
    slots: {
      inject: (_name: string, fn: () => () => void) => { disposals.push(fn()) },
      register: (options: { name: string; priority?: number; inject: typeof injected }) => {
        if (options.name === 'conversation.input.permission') { injected = options.inject; registeredPriority = options.priority }
        return unregister
      },
    },
  }
  apply(context as unknown as Context)
  expect(registeredPriority).toBe(-10)
  expect(await injected('session-a').select('second-look-daily')).toBe(true)
  expect(commandA).toHaveBeenCalledWith('/permission second-look-daily'); expect(commandB).not.toHaveBeenCalled()
  expect(await injected('session-b').select('second-look-strict')).toBe(true)
  expect(commandB).toHaveBeenCalledWith('/permission second-look-strict')
  expect(await injected('missing').select('second-look-daily')).toBe(false)
  for (const stop of disposals.reverse()) stop()
  expect(stopEvent).toHaveBeenCalledOnce(); expect(unregister).toHaveBeenCalled()
})
type SessionPickerInjectedForTest = Pick<SessionPickerProps, 'select'>
