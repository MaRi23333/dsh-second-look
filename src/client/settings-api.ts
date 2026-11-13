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
  ok: boolean
  reviewerModel?: string
  reviewerModelProvider?: string
  reviewerReasoningEffort?: string
  reviewerProvider?: string
  strictReviewerModel?: string
  strictReviewerModelProvider?: string
  strictReviewerReasoningEffort?: string
  defaultTier?: 'daily' | 'strict'
  daily?: { evidenceRounds?: number; totalTimeoutMs?: number; maxEvidenceItems?: number }
  strict?: { evidenceRounds?: number; totalTimeoutMs?: number; maxEvidenceItems?: number }
  /** Patch keys holding a SAVED override (drives the "overridden" badges). */
  savedKeys?: readonly string[]
  settingsPersistence?: string
  error?: string
  message?: string
}

/**
 * The settings patch accepted by POST `/second-look/config`. An empty string
 * (or `null` for numeric fields) CLEARS the override so the field falls back
 * to the loader-config base.
 */
export interface GatePatch {
  reviewerModel?: string | null
  reviewerModelProvider?: string | null
  reviewerReasoningEffort?: string | null
  strictReviewerModel?: string | null
  strictReviewerModelProvider?: string | null
  strictReviewerReasoningEffort?: string | null
  evidenceRoundsDaily?: number | null
  evidenceRoundsStrict?: number | null
  totalTimeoutMsDaily?: number | null
  totalTimeoutMsStrict?: number | null
  maxEvidenceItemsDaily?: number | null
  maxEvidenceItemsStrict?: number | null
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return await response.json() as T
  } catch {
    return { ok: false, error: `HTTP ${response.status}` } as unknown as T
  }
}

/** The status snapshot served by GET `/second-look/status`. */
export interface GateStatusView {
  ok: boolean
  healthy?: boolean
  unhealthyReason?: string
  reviewer?: string
  defaultTier?: 'daily' | 'strict'
  presetNames?: readonly string[]
  presetService?: string
  error?: string
}

export async function fetchStatus(): Promise<GateStatusView> {
  try {
    const response = await fetch('/second-look/status', { cache: 'no-store' })
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` }
    return await readJson<GateStatusView>(response)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'status fetch failed' }
  }
}

export async function fetchConfig(): Promise<GateConfigView> {
  try {
    const response = await fetch('/second-look/config', { cache: 'no-store' })
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` }
    return await readJson<GateConfigView>(response)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'config fetch failed' }
  }
}

export async function saveConfig(patch: GatePatch): Promise<GateConfigView> {
  try {
    const response = await fetch('/second-look/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!response.ok) {
      const body = await readJson<GateConfigView>(response)
      return {
        ok: false,
        error: body.error ?? `HTTP ${response.status}`,
        ...body.message === undefined ? {} : { message: body.message },
      }
    }
    return await readJson<GateConfigView>(response)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'config save failed' }
  }
}


/** Redacted audit snapshot; bounded in-memory history, newest first. */
export type { AuditRecord } from '../settings/audit.ts'
export interface AuditResponse { ok: boolean; blockedRecords?: readonly import('../settings/audit.ts').AuditRecord[]; persistenceDegraded?: boolean; records?: readonly import('../settings/audit.ts').AuditRecord[]; error?: string }
export async function fetchAudit(): Promise<AuditResponse> {
  try {
    const response = await fetch('/second-look/audit?limit=500', { cache: 'no-store' })
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` }
    return await readJson<AuditResponse>(response)
  } catch { return { ok: false, error: 'network-error' } }
}
export async function clearAudit(scope: 'recent' | 'blocked' = 'recent'): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch('/second-look/audit/clear', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: true, scope }),
    })
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` }
    return await readJson<{ ok: boolean; error?: string }>(response)
  } catch { return { ok: false, error: 'network-error' } }
}
