import type { Context } from '@deepseek-ai/cordis'
import { createElement, type ReactNode } from 'react'

// Backport the DSH 0.2.2 contract to the older development-only slot types.
// Runtime availability is owned by the settings shell through slots.inject.
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'settings.section.icon': {
      kind: 'list'
      scope: 'root'
      owner: { size: number; active: boolean }
    }
  }
}

/** Shield and checkmark in the settings row's current theme color. */
export function SettingsNavIcon({ size = 16 }: { size?: number; active?: boolean }): ReactNode {
  return createElement('svg', {
    width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.25, strokeLinecap: 'round',
    strokeLinejoin: 'round', 'aria-hidden': true,
  },
  createElement('path', { d: 'M8 1.75 13 3.6v4.1c0 3-2 5.15-5 6.55-3-1.4-5-3.55-5-6.55V3.6L8 1.75Z' }),
  createElement('path', { d: 'm5.5 8 1.65 1.65 3.4-3.4' }))
}

export function registerSettingsNavIcon(ctx: Pick<Context, 'slots'>): void {
  ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
    name: 'settings.section.icon', id: 'second-look',
  }, SettingsNavIcon))
}
