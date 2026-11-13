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
import type { IncomingMessage, ServerResponse } from 'node:http';
import { type SettingsStore } from './store.js';
/**
 * The structural `webServer` service (feature-detected). The real host router
 * (rc.5 `WebServer.register/match`) matches `kind: 'exact'` routes by FULL
 * path and `kind: 'prefix'` routes by `path` or `path + '/'` prefix — the
 * settings surface needs the prefix kind so `/second-look/`, `/second-look/status`
 * and the other sub-interfaces match at all (INSTALL-REVIEW R1).
 */
export interface WebServerFace {
    register(route: {
        kind: 'exact' | 'prefix';
        path: string;
        handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
    }): () => void;
    /** The listener's root URL (the real host exposes `getOrigin`); used for the LIVE settings URL. */
    getOrigin?(): string;
}
/** Everything the routes can show (redacted snapshots; names and counts). */
export interface SettingsViewSources {
    /** Effective config view: names only. */
    config(): Record<string, unknown>;
    setLanguage?(language: unknown): boolean;
    /** Gate status view: health/tier/counts/gaps/events. */
    status(): Record<string, unknown>;
    /** Recent audit records (already redacted). */
    audit(limit: number): readonly Record<string, unknown>[];
    /** Clear records only; never changes authorization or settings. */
    clearAudit(scope?: 'recent' | 'blocked'): void;
    blockedAudit?(): readonly Record<string, unknown>[];
    auditDegraded?(): boolean;
    /** Switch one session's tier. */
    setTier(sessionId: string, tier: string): void;
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
export declare function registerSettingsRoutes(web: WebServerFace, store: SettingsStore, views: SettingsViewSources): () => void;
//# sourceMappingURL=http.d.ts.map