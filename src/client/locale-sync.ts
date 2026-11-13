import type { SnapshotSource } from './session-catalog.ts'

/** Publish the resolved UI language at startup, switches and host reconnects.
 * Serialize requests so an older language cannot arrive after a newer one. */
export function syncHostLanguage(
  read: () => string,
  subscribeLocale: (changed: () => void) => () => void,
  generation: SnapshotSource<{ id: number } | undefined>,
  send: (language: string, signal: AbortSignal) => Promise<boolean>,
): () => void {
  let disposed = false
  let revision = 0
  let sending = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const controller = new AbortController()
  const flush = async (): Promise<void> => {
    if (disposed || sending || generation.getSnapshot() === undefined) return
    sending = true
    const attempt = revision
    let ok = false
    try { ok = await send(/^zh(?:-|$)/i.test(read()) ? 'zh' : 'en', controller.signal) } catch { /* retry after reconnect or delay */ }
    sending = false
    if (disposed) return
    if (attempt !== revision) { void flush(); return }
    if (!ok) timer = setTimeout(() => { timer = undefined; void flush() }, 3000)
  }
  const changed = (): void => { revision++; if (timer) clearTimeout(timer); timer = undefined; void flush() }
  const stopLocale = subscribeLocale(changed)
  const stopConnection = generation.subscribe(changed)
  changed()
  return () => { disposed = true; controller.abort(); stopLocale(); stopConnection(); if (timer) clearTimeout(timer) }
}
