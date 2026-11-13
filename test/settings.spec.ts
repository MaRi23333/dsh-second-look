/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T07).
 *
 * Settings store, audit log, the /second-look command and the loopback-only
 * settings routes — the T06 acceptance carried into the UI surface: empty
 * config / route errors / timeouts / cancellation / pending / plugin failure
 * are distinguishable, and NO sensitive value ever appears in snapshots,
 * error text or logs.
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  AuditLog,
  FileSettingsPersistence,
  MemorySettingsPersistence,
  registerSettingsRoutes,
  runtimeSettingsFromConfig,
  SettingsError,
  SettingsStore,
  resolveConfig,
  type SettingsPersistence,
  type SettingsViewSources,
  type WebServerFace,
} from '../src/index.ts'

function seedStore(): SettingsStore {
  return new SettingsStore(runtimeSettingsFromConfig(resolveConfig({
    reviewerModel: 'rv',
    reviewerModelProvider: 'rp',
  })))
}

describe('settings store (T07)', () => {
  it('applies a valid patch and fires onChange (old results void for new config)', () => {
    let changes = 0
    const store = new SettingsStore(runtimeSettingsFromConfig(resolveConfig({ reviewerModel: 'rv', reviewerModelProvider: 'rp' })), new MemorySettingsPersistence(), () => { changes += 1 })
    const next = store.update({ reviewerModel: 'rv2', defaultTier: 'strict', evidenceRoundsStrict: 5 })
    expect(next.reviewerModel).toBe('rv2')
    expect(next.defaultTier).toBe('strict')
    expect(next.strict.evidenceRounds).toBe(5)
    expect(changes).toBe(1)
    expect(store.get().reviewerModel).toBe('rv2')
  })

  it('stages and clears the manual reviewer reasoning-effort overrides', () => {
    const store = seedStore()
    const next = store.update({ reviewerReasoningEffort: 'high', strictReviewerReasoningEffort: 'low' })
    expect(next.reviewerReasoningEffort).toBe('high')
    expect(next.strictReviewerReasoningEffort).toBe('low')
    expect(Object.keys(store.savedOverrides()).sort()).toEqual(['reviewerReasoningEffort', 'strictReviewerReasoningEffort'])
    // null (and "") clear: the fields fall back to the loader-config base.
    const cleared = store.update({ reviewerReasoningEffort: null, strictReviewerReasoningEffort: '' })
    expect(cleared.reviewerReasoningEffort).toBeUndefined()
    expect(cleared.strictReviewerReasoningEffort).toBeUndefined()
    expect(store.savedOverrides()).toEqual({})
  })

  it('rejects unknown keys and credential material BY NAME without echoing values', () => {
    const store = seedStore()
    expect(() => store.update({ nope: 1 })).toThrow(SettingsError)
    let message = ''
    try {
      store.update({ apiKey: 'sk-SUPER-SECRET' })
    } catch (error: unknown) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message).toContain('credential')
    expect(message).toContain('apiKey')
    expect(message).not.toContain('sk-SUPER-SECRET')
  })

  it('validates tier and budget values loudly and clears empty overrides', () => {
    const store = seedStore()
    expect(() => store.update({ defaultTier: 'paranoid' })).toThrow(/defaultTier/u)
    expect(() => store.update({ evidenceRoundsDaily: -1 })).toThrow(/evidenceRoundsDaily/u)
    expect(() => store.update({ totalTimeoutMsStrict: 0 })).toThrow(/totalTimeoutMsStrict/u)
    expect(() => store.update({ sensitiveScope: ['ok-path', ''] })).toThrow(/sensitiveScope/u)
    // an empty string CLEARS an override (the page sends "" for "留空=复用基础")
    const cleared = store.update({ strictReviewerModel: '', strictReviewerModelProvider: '  ' })
    expect(cleared.strictReviewerModel).toBeUndefined()
    expect(cleared.strictReviewerModelProvider).toBeUndefined()
  })
})

describe('audit log (T07)', () => {
  it('redacts and bounds reasons and reports degradation state', () => {
    const log = new AuditLog()
    log.append({
      at: 1,
      callId: 'c1',
      toolName: 'bash',
      tier: 'daily',
      configVersion: 'cfg-1',
      model: 'rp/rv',
      decision: 'allow',
      reason: `ok token=SECRETVALUE123 ${'x'.repeat(600)}`,
      durationMs: 12,
      usage: 'unknown',
    })
    const record = log.recent(1)[0]!
    expect(record.reason).not.toContain('SECRETVALUE123')
    expect(record.reason.length).toBeLessThanOrEqual(401)
    expect(record.usage).toBe('unknown') // never estimated
    expect(log.degraded).toBe(false)
    expect(log.degradationReason).toBeUndefined()
    expect(log.size).toBe(1)
  })
})

describe('loopback settings routes (T07)', () => {
  function fakeExchange(method: string, url: string, body?: unknown, overrides: { remoteAddress?: string; origin?: string } = {}) {
    const written: { status?: number; body?: string; headers?: Record<string, string> } = {}
    const req = {
      method,
      url,
      headers: {
        host: '127.0.0.1:3080',
        'content-type': 'application/json',
        ...overrides.origin === undefined ? {} : { origin: overrides.origin },
      },
      socket: { remoteAddress: overrides.remoteAddress ?? '127.0.0.1' },
      async *[Symbol.asyncIterator]() {
        yield Buffer.from(JSON.stringify(body ?? {}))
      },
    } as unknown as IncomingMessage
    const res = {
      writeHead(status: number, headers: Record<string, string>) {
        written.status = status
        written.headers = headers
      },
      end(payload: string) {
        written.body = payload
      },
    } as unknown as ServerResponse
    return { req, res, written }
  }

  function fakeWeb() {
    let handler: ((req: IncomingMessage, res: ServerResponse) => void | Promise<void>) | undefined
    let registered: { kind: string; path: string } | undefined
    const web: WebServerFace = {
      register(route) {
        handler = route.handler
        registered = { kind: route.kind, path: route.path }
        return () => {
          handler = undefined
        }
      },
    }
    return {
      web,
      registered: () => registered,
      invoke: async (method: string, url: string, body?: unknown, overrides: { remoteAddress?: string; origin?: string } = {}) => {
        const exchange = fakeExchange(method, url, body, overrides)
        await handler?.(exchange.req, exchange.res)
        return exchange.written
      },
    }
  }

  function views(store: SettingsStore): SettingsViewSources {
    return {
      config: () => ({ reviewerModel: store.get().reviewerModel ?? '' }),
      status: () => ({ healthy: true, tier: 'daily' }),
      audit: () => [{ at: 1, decision: 'allow' }],
      clearAudit: () => undefined,
      setTier: () => undefined,
    }
  }

  it('serves the JSON API on loopback only — NO HTML page (部署后补: panel-only config)', async () => {
    const { web, registered, invoke } = fakeWeb()
    const store = seedStore()
    registerSettingsRoutes(web, store, views(store))
    // 安装前复核 R1: ONE prefix route claiming /second-look and everything
    // beneath it — an exact route can never match the sub-interfaces on the
    // real host router (see host-router.spec.ts for the real-matcher proof).
    expect(registered()).toEqual({ kind: 'prefix', path: '/second-look' })
    // 部署后补: NO standalone HTML page — the bare paths answer JSON 404;
    // configuration happens only in the client's built-in Settings panel.
    const page = await invoke('GET', '/second-look')
    expect(page.status).toBe(404)
    expect(String(page.body)).toContain('not-found')
    const slash = await invoke('GET', '/second-look/')
    expect(slash.status).toBe(404)
    expect((await invoke('GET', '/second-look/status')).body).toContain('"healthy":true')
    expect((await invoke('GET', '/second-look/config')).body).toContain('rv')
    expect((await invoke('GET', '/second-look/audit')).body).toContain('allow')
    // a NON-loopback client is refused on every route
    const remote = await invoke('GET', '/second-look/status', undefined, { remoteAddress: '10.0.0.5' })
    expect(remote.status).toBe(403)
    const remoteWrite = await invoke('POST', '/second-look/config', { reviewerModel: 'evil' }, { remoteAddress: '10.0.0.5' })
    expect(remoteWrite.status).toBe(403)
  })

  it('requires explicit same-origin clear and never mutates settings', async () => {
    const { web, invoke } = fakeWeb()
    const store = seedStore()
    let count = 1
    const before = store.get()
    registerSettingsRoutes(web, store, { ...views(store), audit: () => count ? [{ decision: 'allow' }] : [], clearAudit: () => { count = 0 } })
    expect((await invoke('GET', '/second-look/audit/clear')).status).toBe(404)
    expect((await invoke('POST', '/second-look/audit/clear', {})).status).toBe(400)
    expect((await invoke('POST', '/second-look/audit/clear', { confirm: true }, { origin: 'http://evil.example' })).status).toBe(403)
    expect(count).toBe(1)
    expect((await invoke('POST', '/second-look/audit/clear', { confirm: true })).status).toBe(200)
    expect((await invoke('GET', '/second-look/audit')).body).toContain('"records":[]')
    expect(store.get()).toEqual(before)
  })

  it('validates config/tier writes and rejects forged origins', async () => {
    const { web, invoke } = fakeWeb()
    const store = seedStore()
    registerSettingsRoutes(web, store, views(store))
    const saved = await invoke('POST', '/second-look/config', { reviewerModel: 'rv3' })
    expect(saved.body).toContain('rv3')
    const bad = await invoke('POST', '/second-look/config', { apiKey: 'sk-x' })
    expect(bad.status).toBe(400)
    expect(String(bad.body)).toContain('credential')
    expect(String(bad.body)).not.toContain('sk-x')
    const badTier = await invoke('POST', '/second-look/tier', { tier: 'paranoid' })
    expect(badTier.status).toBe(400)
    const globalTier = await invoke('POST', '/second-look/config', { defaultTier: 'strict' })
    expect(globalTier.status).toBe(400)
    expect(globalTier.body).toContain('session-only')
    expect(store.get().defaultTier).toBe('daily')
    const okTier = await invoke('POST', '/second-look/tier', { tier: 'strict', sessionId: 'session-1' })
    expect(okTier.status).toBe(200)
    // forged cross-origin write is refused
    const forged = await invoke('POST', '/second-look/config', { reviewerModel: 'evil' }, { origin: 'http://evil.example' })
    expect(forged.status).toBe(403)
  })

  it('reports a FAILED persistence write as 500 and never claims success (安装前复核 R2)', async () => {
    const { web, invoke } = fakeWeb()
    class FailingPersistence implements SettingsPersistence {
      load(): Record<string, unknown> {
        return {}
      }

      save(): void {
        throw new Error('disk full')
      }

      describe(): string {
        return 'failing (test)'
      }
    }
    const store = new SettingsStore(runtimeSettingsFromConfig(resolveConfig({ reviewerModel: 'rv', reviewerModelProvider: 'rp' })), new FailingPersistence())
    registerSettingsRoutes(web, store, views(store))
    const failed = await invoke('POST', '/second-look/config', { reviewerModel: 'never-saved' })
    expect(failed.status).toBe(500)
    expect(String(failed.body)).toContain('save-failed')
    expect(String(failed.body)).toContain('"ok":false')
    // the failed save changed NOTHING in memory
    expect(store.get().reviewerModel).toBe('rv')
    expect(store.savedOverrides()).toEqual({})
  })
})

describe('settings persistence (安装前复核 R2)', () => {
  const base = () => runtimeSettingsFromConfig(resolveConfig({ reviewerModel: 'rv', reviewerModelProvider: 'rp' }))

  function tempDir(): string {
    return mkdtempSync(join(tmpdir(), 'second-look-settings-'))
  }

  it('persists names and budgets across store recreation (reload/restart keeps them)', () => {
    const dir = tempDir()
    try {
      const store = new SettingsStore(base(), new FileSettingsPersistence(dir))
      store.update({
        reviewerModel: 'user-entered-model',
        reviewerModelProvider: 'user-entered-provider',
        defaultTier: 'strict',
        evidenceRoundsDaily: 2,
        totalTimeoutMsStrict: 55_000,
        maxEvidenceItemsDaily: 4,
        strictReviewerModel: 'strict-model',
      })
      // durable: the document exists on disk and carries NAMES only
      const doc = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8')) as Record<string, unknown>
      expect(doc.version).toBe(1)
      expect(doc.reviewerModel).toBe('user-entered-model')
      expect(JSON.stringify(doc)).not.toContain('sk-')
      // recreate from the same directory (= plugin reload / profile restart)
      const reloaded = new SettingsStore(base(), new FileSettingsPersistence(dir))
      expect(reloaded.get().reviewerModel).toBe('user-entered-model')
      expect(reloaded.get().reviewerModelProvider).toBe('user-entered-provider')
      expect(reloaded.get().defaultTier).toBe('strict')
      expect(reloaded.get().daily.evidenceRounds).toBe(2)
      expect(reloaded.get().strict.totalTimeoutMs).toBe(55_000)
      expect(reloaded.get().daily.maxEvidenceItems).toBe(4)
      expect(reloaded.get().strictReviewerModel).toBe('strict-model')
      expect(reloaded.describePersistence()).toContain('loaded')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('precedence: a saved override beats the loader config; clearing falls back to it', () => {
    const dir = tempDir()
    try {
      const store = new SettingsStore(base(), new FileSettingsPersistence(dir))
      store.update({ reviewerModel: 'saved-model' })
      expect(store.get().reviewerModel).toBe('saved-model') // override wins
      // empty string CLEARS the override — the loader config value applies again
      const cleared = store.update({ reviewerModel: '' })
      expect(cleared.reviewerModel).toBe('rv')
      expect(Object.prototype.hasOwnProperty.call(store.savedOverrides(), 'reviewerModel')).toBe(false)
      const doc = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8')) as Record<string, unknown>
      expect(Object.prototype.hasOwnProperty.call(doc, 'reviewerModel')).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('a failed save throws save-failed and leaves memory AND disk unchanged', () => {
    const dir = tempDir()
    try {
      class ExplodingPersistence extends FileSettingsPersistence {
        override save(): void {
          throw new Error('disk full')
        }
      }
      const store = new SettingsStore(base(), new ExplodingPersistence(dir))
      let code = ''
      try {
        store.update({ reviewerModel: 'never-saved' })
      } catch (error: unknown) {
        code = error instanceof SettingsError ? error.code : `unexpected: ${String(error)}`
      }
      expect(code).toBe('save-failed')
      expect(store.get().reviewerModel).toBe('rv')
      expect(store.savedOverrides()).toEqual({})
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('a corrupt settings document degrades to the loader config and says so', () => {
    const dir = tempDir()
    try {
      writeFileSync(join(dir, 'settings.json'), '{not json', 'utf8')
      const store = new SettingsStore(base(), new FileSettingsPersistence(dir))
      expect(store.get().reviewerModel).toBe('rv')
      expect(store.describePersistence()).toContain('invalid')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
