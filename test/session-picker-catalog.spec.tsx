import { expect, it, vi } from 'vitest'
import { SessionCatalog, snapshotStore, type CatalogHost } from '../src/client/session-catalog.ts'
import type { PermissionCatalog } from '@deepseek-ai/dsh-permission-presets/client'

const catalog = (id: string): PermissionCatalog => ({ options: [{ value: id, name: id }], defaultOptions: [], defaultPreset: id })
const flush = async () => { for (let n = 0; n < 6; n++) await Promise.resolve() }
it('withdraws on disconnect, ignores late generations, and refreshes catalog changes', async () => {
  const generation = snapshotStore<{ id: number } | undefined>({ id: 1 })
  const reads: ((result: { ok: true; value: PermissionCatalog }) => void)[] = []
  const read = vi.fn(() => new Promise<{ ok: true; value: PermissionCatalog }>(resolve => { reads.push(resolve) }))
  let changed!: () => void
  const stopEvent = vi.fn()
  const host: CatalogHost = { connection: { generation }, remote: { $on: (_name, fn) => { changed = fn; return stopEvent }, permissionPresets: { catalog: read } } }
  const directory = new SessionCatalog(host)
  await flush(); expect(read).toHaveBeenCalledTimes(1)
  generation.set(undefined); expect(directory.store.getSnapshot().value).toBeNull(); expect(directory.store.getSnapshot().connected).toBe(false)
  generation.set({ id: 2 }); await flush()
  reads[0]!({ ok: true, value: catalog('stale') }); await flush(); expect(directory.store.getSnapshot().value).toBeNull()
  reads[1]!({ ok: true, value: catalog('current') }); await flush(); expect(directory.store.getSnapshot().value?.options[0]?.value).toBe('current')
  changed(); expect(directory.store.getSnapshot().value).toBeNull(); await flush()
  reads[2]!({ ok: true, value: catalog('changed') }); await flush(); expect(directory.store.getSnapshot().value?.options[0]?.value).toBe('changed')
  changed(); await flush(); directory.dispose(); reads[3]!({ ok: true, value: catalog('disposed') }); await flush()
  expect(directory.store.getSnapshot().value).toBeNull(); expect(stopEvent).toHaveBeenCalledOnce()
  generation.set({ id: 3 }); await flush(); expect(read).toHaveBeenCalledTimes(4)
})
it('allows retry after rejected reads and fences older refreshes in the same generation', async () => {
  const generation = snapshotStore<{ id: number } | undefined>({ id: 1 })
  const read = vi.fn<CatalogHost['remote']['permissionPresets']['catalog']>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ok: true, value: catalog('ready') })
  const directory = new SessionCatalog({ connection: { generation }, remote: { $on: () => () => undefined, permissionPresets: { catalog: read } } })
  await flush(); expect(directory.store.getSnapshot().error).toBe(true)
  directory.refresh(); await flush(); expect(directory.store.getSnapshot().value?.options[0]?.value).toBe('ready')
  directory.dispose()
})
