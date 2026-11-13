import { symbols, type Context } from '@deepseek-ai/cordis'
import { GATE_PERMISSION_ROW_PRESETS } from './preset.ts'

type Spec = { sandbox: string; approval: string; name?: string; description?: string }
interface PermissionState { readonly preset: string | null }
interface PresetHost {
  presets: Record<string, Spec>
  names: readonly string[]
  catalog: () => { options: { value: string }[]; defaultOptions: { value: string }[]; defaultPreset: string }
  emitCatalogChanged: () => void
  derive: (state: PermissionState) => string
}
const mounted = new WeakSet<PresetHost>()

/** rc.5 has no public register-custom-preset API. Keep its private-field
 * accesses here, checked against the real service in tests. Bundle config
 * replacement would erase native/user presets. Never mutate config.presets.
 */
export function mountPermissionPresets(ctx: Context): void {
  ctx.inject(['permissionPresets'], scope => {
    const traced = scope.get('permissionPresets') as unknown as PresetHost & { [symbols.original]?: PresetHost }
    const host = traced[symbols.original] ?? traced
    if (!host.presets || typeof host.presets !== 'object' || Array.isArray(host.presets)
      || typeof host.catalog !== 'function' || typeof host.emitCatalogChanged !== 'function'
      || typeof host.derive !== 'function') {
      throw new Error('Second Look: unsupported permission preset service; review modes could not be registered')
    }
    scope.effect(() => {
      if (mounted.has(host)) throw new Error('Second Look: permission presets already registered')
      const previous = new Map<string, Spec | undefined>()
      const owned = Object.fromEntries(Object.entries(GATE_PERMISSION_ROW_PRESETS).map(([key, spec]) => [key, { ...spec }]))
      for (const [key, spec] of Object.entries(owned)) {
        const prior = host.presets[key]
        if (prior && (prior.sandbox !== spec.sandbox || prior.approval !== spec.approval)) {
          throw new Error(`Second Look: conflicting permission preset ${key}`)
        }
        previous.set(key, prior)
      }
      const catalog = host.catalog
      const derive = host.derive
      const ownKeys = new Set(Object.keys(owned))
      // The host normally infers the first matching preset from knob values.
      // Our two modes require a durable, explicit selection. Exclude them from
      // fallback inference without mutating the live table (or session events).
      // Wrapping derive also covers current(), the client projection and the
      // host's set/apply equality check, so choosing a mode writes its identity.
      const wrappedDerive = function (this: PresetHost, state: PermissionState): string {
        const result = derive.call(this, state)
        if (!ownKeys.has(result) || state.preset === result) return result
        const nativeView = Object.create(this) as PresetHost
        nativeView.presets = Object.fromEntries(Object.entries(this.presets).filter(([key]) => !ownKeys.has(key)))
        return derive.call(nativeView, state)
      }
      const contributed = new Set([...previous].filter(([, prior]) => prior === undefined).map(([key]) => key))
      // Runtime contributions are per-session, like native Auto. They must not
      // become persisted defaults that would be invalid after uninstall.
      const wrappedCatalog = function (this: PresetHost) {
        const result = catalog.call(this)
        return { ...result, defaultOptions: result.defaultOptions.filter(option => !contributed.has(option.value)) }
      }
      host.catalog = wrappedCatalog
      host.derive = wrappedDerive
      host.presets = { ...host.presets, ...owned }
      mounted.add(host)
      host.emitCatalogChanged()
      return () => {
        const next = { ...host.presets }
        for (const [key, spec] of Object.entries(owned)) {
          if (next[key] !== spec) continue // Preserve a later contributor's change.
          const prior = previous.get(key)
          if (prior === undefined) delete next[key]
          else next[key] = prior
        }
        host.presets = next
        if (host.catalog === wrappedCatalog) host.catalog = catalog
        if (host.derive === wrappedDerive) host.derive = derive
        mounted.delete(host)
        host.emitCatalogChanged()
      }
    }, 'second-look: permission presets')
  })
}
