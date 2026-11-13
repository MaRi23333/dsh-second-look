/** Adapted from DeepSeek Harness ui-permission-presets/src/client/catalog.ts
 * (MIT, Copyright (c) 2026 DeepSeek).
 * A local snapshot store avoids a runtime client-store dependency.
 */
import type { PermissionCatalog } from '@deepseek-ai/dsh-permission-presets/client'

export interface SnapshotSource<T> {
  getSnapshot: () => T
  subscribe: (listener: () => void) => () => void
}
export function snapshotStore<T>(initial: T): SnapshotSource<T> & { set: (value: T) => void } {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
    set: next => { value = next; for (const listener of [...listeners]) listener() },
  }
}

export interface CatalogState {
  value: PermissionCatalog | null
  connected: boolean
  error: boolean
  revision: number
}
/** Only the public Remote + Connection contracts used by the native catalog. */
export interface CatalogHost {
  connection: { generation: SnapshotSource<{ id: number } | undefined> }
  remote: {
    $on: (name: 'permission-presets/catalog-changed', listener: () => void) => () => void
    permissionPresets: { catalog: () => Promise<
      { ok: true; value: PermissionCatalog } | { ok: false; error: { code: string; message: string } }
    > }
  }
}

export class SessionCatalog {
  readonly store = snapshotStore<CatalogState>({ value: null, connected: false, error: false, revision: 0 })
  private readonly stopCatalog: () => void
  private readonly stopGeneration: () => void
  private generationId: number | undefined
  private epoch = 0
  private disposed = false
  constructor(private readonly host: CatalogHost) {
    this.stopCatalog = host.remote.$on('permission-presets/catalog-changed', () => this.refresh())
    this.stopGeneration = host.connection.generation.subscribe(() => this.syncGeneration())
    this.syncGeneration()
  }
  private syncGeneration(): void {
    if (this.disposed) return
    const id = this.host.connection.generation.getSnapshot()?.id
    if (id === this.generationId && this.epoch > 0) return
    this.generationId = id
    ++this.epoch
    this.publish(null, false)
    if (id !== undefined) this.refresh()
  }
  private publish(value: PermissionCatalog | null, error: boolean): void {
    this.store.set({ value, error, connected: this.generationId !== undefined, revision: this.store.getSnapshot().revision + 1 })
  }
  /** Withdraw stale rows immediately; only the newest same-generation read may settle. */
  refresh = (): void => {
    if (this.disposed) return
    const id = this.host.connection.generation.getSnapshot()?.id
    if (id !== this.generationId) { this.syncGeneration(); return }
    if (id === undefined) return
    const epoch = ++this.epoch
    this.publish(null, false)
    void Promise.resolve().then(() => this.host.remote.permissionPresets.catalog()).then(result => {
      if (!this.accepts(epoch, id)) return
      this.publish(result.ok ? result.value : null, !result.ok)
    }).catch(() => { if (this.accepts(epoch, id)) this.publish(null, true) })
  }
  private accepts(epoch: number, id: number): boolean {
    return !this.disposed && epoch === this.epoch && id === this.host.connection.generation.getSnapshot()?.id
  }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    ++this.epoch
    this.stopCatalog()
    this.stopGeneration()
  }
}
