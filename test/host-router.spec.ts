/**
 * Modified for dsh-second-look, 2026-10-31 (安装前复核 R1 返修).
 *
 * The settings surface must match the REAL host router, not just a directly
 * invoked handler. This spec drives the shipped host router implementation
 * (`@deepseek-ai/dsh-host-webserver@0.2.1-rc.5` — the exact runtime version)
 * through its own `register`/`match`, without listening on a socket: an
 * `exact` route can only match its full path, while a `prefix` route claims
 * `path` and `path + '/'…`. Before the fix only `/second-look` matched and
 * every sub-interface fell through to the host fallback.
 */
import { describe, expect, it } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { WebServer } from '@deepseek-ai/dsh-host-webserver'
import {
  registerSettingsRoutes,
  resolveConfig,
  runtimeSettingsFromConfig,
  SettingsStore,
  type SettingsViewSources,
  type WebServerFace,
} from '../src/index.ts'

interface HostRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

interface HostRouterFace {
  exact: Map<string, HostRoute>
  prefixes: Map<string, HostRoute>
  register(route: HostRoute): () => void
  match(pathname: string): HostRoute | undefined
}

/** The REAL shipped router prototype, constructed without a listener. */
function realRouter(): HostRouterFace {
  const router = Object.create(WebServer.prototype) as HostRouterFace
  router.exact = new Map()
  router.prefixes = new Map()
  return router
}

function store(): SettingsStore {
  return new SettingsStore(runtimeSettingsFromConfig(resolveConfig({ reviewerModel: 'rv', reviewerModelProvider: 'rp' })))
}

function views(current: SettingsStore): SettingsViewSources {
  let tier = 'daily'
  return {
    config: () => ({ reviewerModel: current.get().reviewerModel ?? '' }),
    status: () => ({ healthy: true, tier }),
    audit: () => [{ at: 1, decision: 'allow' }],
      clearAudit: () => undefined,
    setTier: (_sessionId, next) => {
      tier = next
    },
  }
}

function fakeExchange(method: string, url: string, body?: unknown) {
  const written: { status?: number; body?: string } = {}
  const req = {
    method,
    url,
    headers: { host: '127.0.0.1:3080', 'content-type': 'application/json' },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify(body ?? {}))
    },
  } as unknown as IncomingMessage
  const res = {
    writeHead(status: number) {
      written.status = status
    },
    end(payload: string) {
      written.body = payload
    },
  } as unknown as ServerResponse
  return { req, res, written }
}

describe('settings routes against the REAL host router (安装前复核 R1)', () => {
  const ALL_SURFACES = ['/second-look', '/second-look/', '/second-look/status', '/second-look/config', '/second-look/audit', '/second-look/tier']

  it('matches every settings surface — bare page, trailing slash and all sub-interfaces', () => {
    const router = realRouter()
    const current = store()
    registerSettingsRoutes(router as unknown as WebServerFace, current, views(current))
    for (const path of ALL_SURFACES) {
      expect(router.match(path), `route must match ${path}`).toBeDefined()
    }
  })

  it('claims ONLY the /second-look subtree (prefix contract: path or path + "/")', () => {
    const router = realRouter()
    const current = store()
    registerSettingsRoutes(router as unknown as WebServerFace, current, views(current))
    for (const path of ['/second-look-extra', '/second-lookx/status', '/other', '/', '/gate-check', '/gate-check/config']) {
      expect(router.match(path), `route must NOT match ${path}`).toBeUndefined()
    }
  })

  it('serves the matched sub-interfaces end-to-end through the router', async () => {
    const router = realRouter()
    const current = store()
    registerSettingsRoutes(router as unknown as WebServerFace, current, views(current))
    // 部署后补: the bare paths carry NO HTML page (panel-only configuration)
    const page = fakeExchange('GET', '/second-look/')
    await router.match('/second-look/')!.handler(page.req, page.res)
    expect(page.written.status).toBe(404)
    const legacy = fakeExchange('GET', '/second-look/session-tier?sessionId=session-1')
    await router.match('/second-look/session-tier')!.handler(legacy.req, legacy.res)
    expect(legacy.written.status).toBe(404)
    const status = fakeExchange('GET', '/second-look/status')
    await router.match('/second-look/status')!.handler(status.req, status.res)
    expect(String(status.written.body)).toContain('"ok":true')
    const save = fakeExchange('POST', '/second-look/config', { reviewerModel: 'rv3' })
    await router.match('/second-look/config')!.handler(save.req, save.res)
    expect(save.written.status).toBe(200)
    expect(String(save.written.body)).toContain('rv3')
    const tier = fakeExchange('POST', '/second-look/tier', { tier: 'strict', sessionId: 'session-1' })
    await router.match('/second-look/tier')!.handler(tier.req, tier.res)
    expect(tier.written.status).toBe(200)
    expect(String(tier.written.body)).toContain('strict')
  })
})
