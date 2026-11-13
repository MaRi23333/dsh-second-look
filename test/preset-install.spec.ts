import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { Context, symbols } from '@deepseek-ai/cordis'
import SessionStore, { Session, SessionId } from '@deepseek-ai/dsh-session'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ApprovalService from '@deepseek-ai/dsh-user-approval'
import PermissionPresets from '@deepseek-ai/dsh-permission-presets'
import * as source from '../src/index.ts'

const bundlePath = '../lib/index.js'
const plugin = process.env.SECOND_LOOK_TEST_BUNDLE === '1' ? await import(bundlePath) as typeof source : source
const contexts: Context[] = []
const dirs: string[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})
const native = () => ({
  'read-only': { sandbox: 'read-only' as const, approval: 'ask' as const },
  'workspace-write': { sandbox: 'workspace-write' as const, approval: 'ask' as const },
  'danger-full-access': { sandbox: 'danger-full-access' as const, approval: 'never' as const },
  'other-plugin': { sandbox: 'workspace-write' as const, approval: 'never' as const },
})
const keys = ['second-look-daily', 'second-look-strict']
async function fixture() {
  const ctx = new Context(); contexts.push(ctx)
  const dir = await mkdtemp(join(tmpdir(), 'second-look-install-')); dirs.push(dir)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjections)
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime, { mode: 'native' })
  ctx.provide('shell', { sandboxMode: 'danger-full-access' } as never)
  await ctx.plugin(ApprovalService, { policy: 'ask' })
  return { ctx, dir }
}

it('fresh install uses the production entry to contribute both modes without changing config or defaults', async () => {
  const { ctx, dir } = await fixture()
  const presets = native()
  const permission = await ctx.plugin(PermissionPresets, { presets, defaultPreset: 'danger-full-access' })
  let changes = 0
  ctx.on('permission-presets/catalog-changed', () => { changes++ })
  const installed = await ctx.plugin(plugin, { settingsDir: dir })
  const catalog = ctx.permissionPresets.catalog()
  expect(catalog.options.map(x => x.value)).toEqual([...Object.keys(presets), ...keys])
  expect(catalog.defaultOptions.map(x => x.value)).toEqual(Object.keys(presets))
  expect(catalog.defaultPreset).toBe('danger-full-access')
  expect(Object.keys(presets)).toEqual(Object.keys(native()))
  const session = Session.create(SessionId('fresh-install'))
  for (const key of [...keys, 'danger-full-access', 'workspace-write', 'read-only']) {
    ctx.permissionPresets.set(session, key)
    expect(ctx.permissionPresets.current(session)).toBe(key)
  }
  // Later contributions survive our disposal; only our own rows disappear.
  const service = (ctx.permissionPresets as unknown as { [symbols.original]: { presets: Record<string, unknown> } })[symbols.original]
  if (!service) throw new Error('Expected the real host service behind the trace proxy')
  service.presets['later-plugin'] = { sandbox: 'read-only', approval: 'never' }
  await installed.dispose()
  expect(ctx.permissionPresets.names).toEqual([...Object.keys(presets), 'later-plugin'])
  expect(ctx.permissionPresets.catalog().defaultOptions.map(x => x.value)).toContain('later-plugin')
  expect(changes).toBe(2)
  await permission.dispose()
})

it('mounts after a late permission service and registers again after service replacement', async () => {
  const { ctx, dir } = await fixture()
  const installed = await ctx.plugin(plugin, { settingsDir: dir })
  const first = await ctx.plugin(PermissionPresets, { presets: native(), defaultPreset: 'danger-full-access' })
  expect(ctx.permissionPresets.names).toEqual([...Object.keys(native()), ...keys])
  await first.dispose()
  await ctx.plugin(PermissionPresets, { presets: native(), defaultPreset: 'workspace-write' })
  expect(ctx.permissionPresets.names).toEqual([...Object.keys(native()), ...keys])
  expect(ctx.permissionPresets.catalog().defaultPreset).toBe('workspace-write')
  await installed.dispose()
  expect(ctx.permissionPresets.names).toEqual(Object.keys(native()))
})

it('does not adopt native custom or stale selections on installation, replay or uninstall', async () => {
  const { ctx, dir } = await fixture()
  await ctx.plugin(PermissionPresets, { presets: native(), defaultPreset: 'danger-full-access' })
  const sessions = [null, 'missing-plugin', 'read-only'].map((preset, i) => {
    const session = Session.create(SessionId(`native-custom-${i}`))
    if (preset) session.append('permission/preset', { preset })
    // The transitive sandbox package owns this real host event augmentation.
    ;(session.append as (type: string, data: unknown) => unknown)('sandbox/mode', { mode: 'danger-full-access' })
    session.append('approval/policy', { policy: 'ask' })
    expect(ctx.permissionPresets.current(session)).toBe('custom')
    return session
  })
  const histories = sessions.map(session => session.snapshotEvents())
  const installed = await ctx.plugin(plugin, { settingsDir: dir })
  for (const [i, session] of sessions.entries()) {
    expect(ctx.permissionPresets.current(session)).toBe('custom')
    expect(plugin.shouldGate(ctx.permissionPresets, session, undefined)).toBe(false)
    const replay = Session.create(session.id, session.snapshotEvents(), session.header)
    expect(ctx.sessionProjections.snapshot(replay).values.permissions).toEqual({ currentValue: 'custom' })
    expect(session.snapshotEvents()).toEqual(histories[i])
    const child = { header: { origin: 'subagent' } }
    expect(plugin.shouldGate(ctx.permissionPresets, child, { session })).toBe(false)
  }
  await installed.dispose()
  for (const session of sessions) expect(ctx.permissionPresets.current(session)).toBe('custom')
})

it('persists an explicit selection even when the original knobs equal the review bundle', async () => {
  const { ctx, dir } = await fixture()
  await ctx.plugin(PermissionPresets, { presets: native(), defaultPreset: 'danger-full-access' })
  await ctx.plugin(plugin, { settingsDir: dir })
  const session = Session.create(SessionId('explicit-from-custom'))
  ;(session.append as (type: string, data: unknown) => unknown)('sandbox/mode', { mode: 'danger-full-access' })
  session.append('approval/policy', { policy: 'ask' })
  const before = session.seq
  ctx.permissionPresets.set(session, 'second-look-daily')
  expect(session.snapshotEvents(before).map(event => event.type)).toEqual(['permission/preset'])
  expect(ctx.sessionProjections.stateOf(session, 'permissions')?.preset).toBe('second-look-daily')
  const selected = session.seq
  ctx.permissionPresets.set(session, 'second-look-daily')
  expect(session.seq).toBe(selected)
  ctx.permissionPresets.set(session, 'second-look-strict')
  expect(ctx.sessionProjections.stateOf(session, 'permissions')?.preset).toBe('second-look-strict')
  const fresh = await fixture()
  await fresh.ctx.plugin(PermissionPresets, { presets: native(), defaultPreset: 'danger-full-access' })
  await fresh.ctx.plugin(plugin, { settingsDir: fresh.dir })
  const replay = Session.create(session.id, session.snapshotEvents(), session.header)
  expect(fresh.ctx.permissionPresets.current(replay)).toBe('second-look-strict')
  expect(fresh.ctx.sessionProjections.snapshot(replay).values.permissions).toEqual({ currentValue: 'second-look-strict' })
  expect(plugin.shouldGate(fresh.ctx.permissionPresets, { header: { origin: 'subagent' } }, { session: replay })).toBe(true)
})
