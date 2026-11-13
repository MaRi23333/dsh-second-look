/**
 * Modified for dsh-second-look, 2026-10-31 (original work; 部署后补).
 *
 * Browser client for the plugin's loopback `/second-look/config` interface
 * (same-origin fetch — the client is served by the very webServer the route
 * is mounted on; the Host-side triple loopback guard still applies). Adapted
 * from the local fork `dsh-heavy-approval/src/client/settings-api.ts`
 * (workspace-local source, reused with attribution; see
 * THIRD-PARTY-SOURCES.md). Names, budgets and reasoning-effort ids only —
 * never credentials.
 */
/** The effective settings view served by GET `/second-look/config`. */
export interface GateConfigView {
    ok: boolean;
    reviewerModel?: string;
    reviewerModelProvider?: string;
    reviewerReasoningEffort?: string;
    reviewerProvider?: string;
    strictReviewerModel?: string;
    strictReviewerModelProvider?: string;
    strictReviewerReasoningEffort?: string;
    defaultTier?: 'daily' | 'strict';
    daily?: {
        evidenceRounds?: number;
        totalTimeoutMs?: number;
        maxEvidenceItems?: number;
    };
    strict?: {
        evidenceRounds?: number;
        totalTimeoutMs?: number;
        maxEvidenceItems?: number;
    };
    /** Patch keys holding a SAVED override (drives the "overridden" badges). */
    savedKeys?: readonly string[];
    settingsPersistence?: string;
    error?: string;
    message?: string;
}
/**
 * The settings patch accepted by POST `/second-look/config`. An empty string
 * (or `null` for numeric fields) CLEARS the override so the field falls back
 * to the loader-config base.
 */
export interface GatePatch {
    reviewerModel?: string | null;
    reviewerModelProvider?: string | null;
    reviewerReasoningEffort?: string | null;
    strictReviewerModel?: string | null;
    strictReviewerModelProvider?: string | null;
    strictReviewerReasoningEffort?: string | null;
    evidenceRoundsDaily?: number | null;
    evidenceRoundsStrict?: number | null;
    totalTimeoutMsDaily?: number | null;
    totalTimeoutMsStrict?: number | null;
    maxEvidenceItemsDaily?: number | null;
    maxEvidenceItemsStrict?: number | null;
}
/** The status snapshot served by GET `/second-look/status`. */
export interface GateStatusView {
    ok: boolean;
    healthy?: boolean;
    unhealthyReason?: string;
    reviewer?: string;
    defaultTier?: 'daily' | 'strict';
    presetNames?: readonly string[];
    presetService?: string;
    error?: string;
}
export declare function fetchStatus(): Promise<GateStatusView>;
export declare function fetchConfig(): Promise<GateConfigView>;
export declare function saveConfig(patch: GatePatch): Promise<GateConfigView>;
/** Redacted audit snapshot; bounded in-memory history, newest first. */
export type { AuditRecord } from '../settings/audit.js';
export interface AuditResponse {
    ok: boolean;
    blockedRecords?: readonly import('../settings/audit.js').AuditRecord[];
    persistenceDegraded?: boolean;
    records?: readonly import('../settings/audit.js').AuditRecord[];
    error?: string;
}
export declare function fetchAudit(): Promise<AuditResponse>;
export declare function clearAudit(scope?: 'recent' | 'blocked'): Promise<{
    ok: boolean;
    error?: string;
}>;
//# sourceMappingURL=settings-api.d.ts.map