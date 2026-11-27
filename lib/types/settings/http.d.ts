/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T07; 部署后补).
 *
 * Owner-authenticated loopback HTTP API for the in-client settings panel.
 * Settings and audit responses are redacted views of the corresponding stores.
 * Derived from the local fork's settings-http.ts (see THIRD-PARTY-SOURCES.md).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { type SettingsStore } from './store.js';
interface SettingsPeer {
    readonly principal: {
        readonly kind: string;
    };
}
/** Host Connection admission for routers that do not pass an admitted peer. */
export interface SettingsConnection {
    admit(request: IncomingMessage): {
        readonly peer: SettingsPeer;
    } | {
        readonly rejection: 401 | 403;
    };
}
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
        auth: 'required';
        handler: (req: IncomingMessage, res: ServerResponse, peer?: SettingsPeer) => void | Promise<void>;
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
 * @param getConnection - resolve the current Host Connection for older routers.
 * @returns the disposer.
 */
export declare function registerSettingsRoutes(web: WebServerFace, store: SettingsStore, views: SettingsViewSources, getConnection: () => SettingsConnection | undefined): () => void;
export {};
//# sourceMappingURL=http.d.ts.map