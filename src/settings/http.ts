/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T07; 部署后补).
 *
 * Loopback-only HTTP API for the IN-CLIENT settings panel (ported from the
 * local fork's `settings-http.ts` pattern; see THIRD-PARTY-SOURCES.md).
 * Every route is bound to loopback AND checked against a loopback Host/Origin
 * — the settings surface must never be reachable from the network. The
 * status/audit payloads carry names and counts only: no secrets, no full
 * config, no thinking text. There is NO standalone HTML page and NO chat
 * command for configuration (user decision 2026-10-31): config adjustment
 * lives in the client's built-in Settings panel, which calls these routes.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { SettingsError, type SettingsStore } from './store.ts'

/**
 * The structural `webServer` service (feature-detected). The real host router
 * (rc.5 `WebServer.register/match`) matches `kind: 'exact'` routes by FULL
 * path and `kind: 'prefix'` routes by `path` or `path + '/'` prefix — the
 * settings surface needs the prefix kind so `/second-look/`, `/second-look/status`
 * and the other sub-interfaces match at all (INSTALL-REVIEW R1).
 */
export interface WebServerFace {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
  /** The listener's root URL (the real host exposes `getOrigin`); used for the LIVE settings URL. */
  getOrigin?(): string
}

/** Everything the routes can show (redacted snapshots; names and counts). */
export interface SettingsViewSources {
  /** Effective config view: names only. */
  config(): Record<string, unknown>
  setLanguage?(language: unknown): boolean
  /** Gate status view: health/tier/counts/gaps/events. */
  status(): Record<string, unknown>
  /** Recent audit records (already redacted). */
  audit(limit: number): readonly Record<string, unknown>[]
  /** Clear records only; never changes authorization or settings. */
  clearAudit(scope?: 'recent' | 'blocked'): void
  blockedAudit?(): readonly Record<string, unknown>[]
  auditDegraded?(): boolean
  /** Switch one session's tier. */
  setTier(sessionId: string, tier: string): void
}

/**
 * Register the second-look settings API on a web-server service.
 *
 * ONE `prefix` route claims `/second-look` and everything beneath it (the
 * host's prefix matcher takes `path` and `path + '/'…`) so every JSON
 * sub-interface matches the REAL host router instead of falling through to
 * its fallback (INSTALL-REVIEW R1). The handler dispatches on the pathname
 * and answers unknown sub-paths 404 — there is no HTML page here; the
 * in-client settings panel is the only configuration surface.
 * @param web - the host web server face.
 * @param store - the settings store (GET/POST config).
 * @param views - status/audit/tier sources.
 * @returns the disposer.
 */
export function registerSettingsRoutes(web: WebServerFace, store: SettingsStore, views: SettingsViewSources): () => void {
  return web.register({
    kind: 'prefix',
    path: '/second-look',
    handler: async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const sub = url.pathname.replace(/^\/second-look\/?/, '')
      if (req.method === 'GET') {
        if (!guardLoopback(req, res)) return
        if (sub === 'status') {
          sendJson(res, 200, { ok: true, ...views.status() })
          return
        }
        if (sub === 'config') {
          sendJson(res, 200, { ok: true, ...views.config() })
          return
        }
        if (sub === 'audit') {
          const limit = Number(url.searchParams.get('limit') ?? '50')
          sendJson(res, 200, { ok: true, records: views.audit(Number.isFinite(limit) ? limit : 50), blockedRecords: views.blockedAudit?.() ?? [], persistenceDegraded: views.auditDegraded?.() ?? false })
          return
        }
        sendJson(res, 404, { ok: false, error: 'not-found' })
        return
      }
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'method-not-allowed' })
        return
      }
      if (!guardWrite(req, res)) return
      let body: unknown
      try {
        body = await readJsonBody(req)
      } catch {
        sendJson(res, 400, { ok: false, error: 'body-too-large' })
        return
      }
      try {
        if (sub === 'locale') {
          const language = (body as { language?: unknown } | null)?.language
          const ok = (language === 'zh' || language === 'en') && views.setLanguage?.(language) === true
          sendJson(res, ok ? 200 : 400, { ok, ...ok ? {} : { error: 'invalid-language' } })
          return
        }
        if (sub === 'audit/clear') {
          if ((body as { confirm?: unknown } | null)?.confirm !== true) {
            sendJson(res, 400, { ok: false, error: 'confirmation-required' })
            return
          }
          const scope = (body as { scope?: unknown }).scope ?? 'recent'
          if (scope !== 'recent' && scope !== 'blocked') { sendJson(res, 400, { ok: false, error: 'invalid-scope' }); return }
          views.clearAudit(scope)
          sendJson(res, 200, { ok: true })
          return
        }
        if (sub === 'config') {
          if (body && typeof body === 'object' && Object.hasOwn(body, 'defaultTier')) {
            sendJson(res, 400, { ok: false, error: 'session-only', message: 'Choose the review tier in each conversation permission menu.' })
            return
          }
          store.update(body)
          sendJson(res, 200, { ok: true, ...views.config() })
          return
        }
        if (sub === 'tier') {
          const tier = (body as { tier?: unknown } | null)?.tier
          if (tier !== 'daily' && tier !== 'strict') {
            sendJson(res, 400, { ok: false, error: 'invalid-value', message: 'tier must be daily or strict' })
            return
          }
          const sessionId = (body as { sessionId?: unknown }).sessionId
          if (typeof sessionId !== 'string' || sessionId.trim() === '') {
            sendJson(res, 400, { ok: false, error: 'session-required', message: 'sessionId is required for a session-specific tier change' })
            return
          }
          views.setTier(sessionId, tier)
          sendJson(res, 200, { ok: true, ...views.status() })
          return
        }
        sendJson(res, 404, { ok: false, error: 'not-found' })
      } catch (error: unknown) {
        if (error instanceof SettingsError) {
          // A failed PERSISTENCE write is a server-side failure (500) and must
          // never masquerade as a rejected patch (INSTALL-REVIEW R2).
          sendJson(res, error.code === 'save-failed' ? 500 : 400, { ok: false, error: error.code, message: error.message })
          return
        }
        sendJson(res, 500, { ok: false, error: 'update-failed' })
      }
    },
  })
}

function isLoopback(address: string | undefined): boolean {
  if (address === undefined) return false
  const normalized = address.toLowerCase().replace(/^::ffff:/, '')
  return normalized === '127.0.0.1' || normalized === '::1'
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(payload))
}

function loopbackHost(raw: string | undefined): string | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null
  try {
    const parsed = new URL(`http://${raw}`)
    const hostname = parsed.hostname.toLowerCase()
    if (hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '[::1]') return null
    return parsed.host.toLowerCase()
  } catch {
    return null
  }
}

function guardLoopback(req: IncomingMessage, res: ServerResponse): boolean {
  if (!isLoopback(req.socket.remoteAddress) || loopbackHost(req.headers.host) === null) {
    sendJson(res, 403, { ok: false, error: 'forbidden' })
    return false
  }
  return true
}

function guardWrite(req: IncomingMessage, res: ServerResponse): boolean {
  if (!guardLoopback(req, res)) return false
  const host = loopbackHost(req.headers.host)
  const contentType = (req.headers['content-type'] ?? '').split(';')[0]?.trim() ?? ''
  if (contentType !== 'application/json') {
    sendJson(res, 415, { ok: false, error: 'content-type must be application/json' })
    return false
  }
  const origin = req.headers.origin ?? ''
  if (origin !== '') {
    let originHost: string
    try {
      const parsed = new URL(origin)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('bad protocol')
      originHost = parsed.host.toLowerCase()
    } catch {
      sendJson(res, 403, { ok: false, error: 'forbidden-origin' })
      return false
    }
    if (originHost !== host) {
      sendJson(res, 403, { ok: false, error: 'forbidden-origin' })
      return false
    }
  }
  return true
}

async function readJsonBody(req: IncomingMessage, maxBytes = 64 * 1024): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
    size += buffer.length
    if (size > maxBytes) throw new Error('body too large')
    chunks.push(buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    return null
  }
}
