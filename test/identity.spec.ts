import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { defaultSettingsDir, FileSettingsPersistence } from '../src/settings/persistence.ts'
import { isGateSession, GATE_PERMISSION_ROW_PRESETS } from '../src/gate/preset.ts'
import { name } from '../src/index.ts'
afterEach(() => vi.unstubAllEnvs())
it('uses only the new package identity and two explicit presets', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  expect(pkg.name).toBe('dsh-second-look'); expect(name).toBe(pkg.name)
  expect(Object.keys(GATE_PERMISSION_ROW_PRESETS)).toEqual(['second-look-daily', 'second-look-strict'])
  for (const current of ['gate-check', 'gate-check-daily', 'gate-check-strict', 'second-look']) {
    expect(isGateSession({ current: () => current }, {})).toBe(false)
  }
  expect(isGateSession({ current: () => 'second-look-daily' }, {})).toBe(true)
})
it('does not read or migrate settings from the retired data directory', () => {
  const home = mkdtempSync(join(tmpdir(), 'second-look-identity-'))
  try {
    vi.stubEnv('DSH_HOME', home)
    mkdirSync(join(home, 'gate-check'))
    writeFileSync(join(home, 'gate-check', 'settings.json'), JSON.stringify({ version: 1, reviewerModel: 'old-route' }))
    expect(defaultSettingsDir()).toBe(join(home, 'second-look'))
    const store = new FileSettingsPersistence(defaultSettingsDir())
    expect(store.load()).toEqual({})
    store.save({ reviewerModel: 'new-route' }); expect(store.load()).toEqual({ reviewerModel: 'new-route' })
    expect(JSON.parse(readFileSync(join(home, 'gate-check', 'settings.json'), 'utf8')).reviewerModel).toBe('old-route')
  } finally { rmSync(home, { recursive: true, force: true }) }
})

it('ships complete MIT notices for bundled and adapted sources', () => {
  const notices = readFileSync(new URL('../THIRD-PARTY-SOURCES.md', import.meta.url), 'utf8')
  const zod = readFileSync(new URL('../node_modules/zod/LICENSE', import.meta.url), 'utf8').trim()
  expect(notices.replace(/\r\n/g, '\n')).toContain(zod.replace(/\r\n/g, '\n'))
  expect(notices).toContain('Copyright (c) 2026 dsh-heavy-approval contributors')
  expect(notices).toContain('Copyright (c) 2026 JimDeng891 (dsh-smart-approval)')
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  expect(pkg.files).toContain('THIRD-PARTY-SOURCES.md')
})
