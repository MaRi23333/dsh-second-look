/** A real wall-clock bound even when a provider or probe ignores AbortSignal. */
export async function withDeadline<T>(
  timeoutMs: number,
  parent: AbortSignal | undefined,
  work: (signal: AbortSignal) => Promise<T>,
  interrupted: (kind: 'timeout' | 'cancelled') => T,
): Promise<T> {
  if (parent?.aborted) return interrupted('cancelled')
  const controller = new AbortController()
  let stop!: (value: T) => void
  const stopped = new Promise<T>(resolve => { stop = resolve })
  const finish = (kind: 'timeout' | 'cancelled'): void => {
    stop(interrupted(kind))
    controller.abort()
  }
  const onAbort = (): void => finish('cancelled')
  parent?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => finish('timeout'), Math.max(0, timeoutMs))
  try {
    return await Promise.race([Promise.resolve().then(() => work(controller.signal)), stopped])
  } finally {
    clearTimeout(timer)
    parent?.removeEventListener('abort', onAbort)
    controller.abort()
  }
}
