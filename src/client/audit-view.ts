import type { AuditRecord } from './settings-api.ts'
export type AuditCategory = 'exempt' | 'allow' | 'ask' | 'deny' | 'failure' | 'other'
export interface AuditEntry { key: string; latest: AuditRecord; records: AuditRecord[]; category: AuditCategory }
export function auditCategory(record: AuditRecord): AuditCategory {
  if (record.decision === 'human-settled') return record.humanOutcome === 'allowed-once' ? 'allow'
    : record.humanOutcome === 'rejected' ? 'deny' : 'failure'
  if (record.decision === 'exempt') return 'exempt'
  if (record.decision === 'allow') return 'allow'
  if (record.decision === 'ask_user' || record.decision === 'rule-ask') return 'ask'
  if (record.decision === 'deny' || record.decision === 'rule-deny' || record.decision === 'guard-blocked' || record.decision === 'outbound-blocked') return 'deny'
  if (record.decision.startsWith('failure-') || record.decision === 'cancelled') return 'failure'
  return 'other'
}
/** Group only one call in one session. Retain every transition, including its reason. */
export function groupAudit(records: readonly AuditRecord[]): AuditEntry[] {
  const entries = new Map<string, AuditEntry>()
  for (const [index, record] of [...records].sort((a, b) => b.at - a.at).entries()) {
    const key = record.callId && record.sessionId
      ? JSON.stringify([record.sessionId, record.callId, record.toolName])
      : JSON.stringify(['ungrouped', index, record.at])
    const entry = entries.get(key)
    if (entry) entry.records.push(record)
    else entries.set(key, { key, latest: record, records: [record], category: auditCategory(record) })
  }
  return [...entries.values()]
}
export function exportAudit(records: readonly AuditRecord[], scope: 'recent' | 'blocked' = 'recent'): string {
  // An explicit field list prevents accidental future payload expansion.
  return JSON.stringify({ exportedAt: new Date().toISOString(), scope, retention: scope === 'blocked' ? 'persistent, newest 100 blocked events' : 'in-memory, newest 500 events', records: records.map(r => ({
    at: r.at, sessionId: r.sessionId, callId: r.callId, toolName: r.toolName, tier: r.tier,
    model: r.model, ...(r.decision === 'outbound-blocked' ? { modelRole: 'destination' } : {}), decision: r.decision, reason: r.reason, durationMs: r.durationMs,
    usage: r.usage, humanOutcome: r.humanOutcome, configVersion: r.configVersion,
  })) }, null, 2)
}
