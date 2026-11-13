import { loadReviewerCatalog } from './reviewer-catalog.ts'
import { registerSettingsNavIcon } from './nav-icon.ts'
/**
 * Modified for dsh-second-look, 2026-10-31 (部署后补: 客户端内置设置面板).
 *
 * Browser entry: contributes the Second Look section to the client's
 * built-in Settings panel (slot `settings.section`). Adapted from the local
 * fork `dsh-heavy-approval/src/client/index.ts` (workspace-local source,
 * reused with attribution; see THIRD-PARTY-SOURCES.md). Data flows through
 * the plugin's own loopback `/second-look/config` interface — the same
 * persistence and validation the web page uses; no credentials ever ride it.
 */

import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { GateSettings, type GateSettingsInjected } from './SettingsCard.tsx'
import { SessionPicker, type SessionPickerInjected } from './SessionPicker.tsx'
import { syncHostLanguage } from './locale-sync.ts'
import { SessionCatalog, type CatalogHost } from './session-catalog.ts'
import { accessEn, accessZh, type PermissionAccessKey } from './session-locales.ts'
import { en, zh, type SettingsKey } from './settings-locales.ts'
import { fetchConfig, fetchStatus, saveConfig, fetchAudit, clearAudit } from './settings-api.ts'

export { GateSettings } from './SettingsCard.tsx'
export type { GateSettingsInjected, GateSettingsProps } from './SettingsCard.tsx'
export type { SettingsKey } from './settings-locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Second Look settings section. */
    'second-look': SettingsKey
    'second-look.permission': PermissionAccessKey
  }
}

/** Browser services required by the settings section. */
export const inject = ['slots', 'locale', 'connection', 'sessions', 'remote', 'remote.permissionPresets']

/** Register the locale dictionaries through the structural locale surface. */
function registerLocale(
  ctx: ClientContext,
  namespace: string,
  dictionaries: { zh: Record<string, string>; en: Record<string, string> },
  label: string,
): void {
  const locale = ctx.locale as unknown as {
    register: (ns: string, dicts: { zh: Record<string, string>; en: Record<string, string> }) => () => void
  }
  const effectCtx = ctx as unknown as {
    effect: (fn: () => void | (() => void), label: string) => void
  }
  effectCtx.effect(() => {
    try {
      return locale.register(namespace, dictionaries)
    } catch {
      return () => undefined
    }
  }, label)
}

export function apply(ctx: ClientContext): void {
  registerSettingsNavIcon(ctx)
  registerLocale(ctx, 'second-look', { zh, en }, 'second-look: settings dictionaries')
  registerLocale(ctx, 'second-look.permission', { zh: accessZh, en: accessEn }, 'second-look: session dictionaries')
  const effectCtx = ctx as unknown as {
    effect: (fn: () => void | (() => void), label: string) => void
  }
  const host = ctx as unknown as CatalogHost & {
    remote: Parameters<typeof loadReviewerCatalog>[0]
    sessions: { binding: (id: string) => { session: { command: (line: string) => Promise<{ ok: boolean; value?: { matched: boolean } }> } } | undefined }
  }
  if (typeof ctx.locale.getLocale === 'function') effectCtx.effect(() => syncHostLanguage(
    () => ctx.locale.getLocale().active,
    changed => ctx.on('locale/change', changed),
    (ctx.get('connection') as CatalogHost['connection']).generation,
    async (language, signal) => (await fetch('/second-look/locale', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ language }), signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
    })).ok,
  ), 'second-look: host language')
  const catalog = new SessionCatalog({ connection: ctx.get('connection') as CatalogHost['connection'], remote: host.remote })
  effectCtx.effect(() => () => catalog.dispose(), 'second-look: session catalog')
  ctx.slots.inject('conversation.input.permission', () => ctx.slots.register({
    name: 'conversation.input.permission',
    priority: -10,
    locale: 'second-look.permission',
    inject: (sessionId): SessionPickerInjected => ({
      sessionKey: String(sessionId),
      catalogStore: catalog.store,
      retryCatalog: catalog.refresh,
      select: async preset => {
        const session = host.sessions.binding(String(sessionId))?.session
        if (session === undefined) return false
        const result = await session.command(`/permission ${preset}`)
        return result.ok && result.value?.matched === true
      },
    }),
  }, SessionPicker))

  let disposeSection: (() => void) | null = null
  const mountSection = (): void => {
    if (disposeSection !== null) {
      disposeSection()
      disposeSection = null
    }
    try {
      const locale = ctx.locale as unknown as {
        bind: (ns: string) => (key: SettingsKey) => string
      }
      const t = locale.bind('second-look')
      disposeSection = ctx.slots.register({
        name: 'settings.section',
        id: 'second-look',
        order: 56,
        label: () => t('settings.label'),
        inject: (): GateSettingsInjected => ({
          t,
          config: () => fetchConfig(),
          saveConfig: patch => saveConfig(patch),
          status: () => fetchStatus(),
          modelCatalog: () => loadReviewerCatalog(host.remote),
          audit: fetchAudit,
          clearAudit,
        }),
      }, GateSettings)
    } catch {
      disposeSection = null
    }
  }
  ctx.slots.inject('settings.section', () => {
    mountSection()
    const onLocale = ctx.on('locale/change', () => { mountSection() })
    return () => {
      onLocale()
      if (disposeSection !== null) {
        disposeSection()
        disposeSection = null
      }
    }
  })
}
