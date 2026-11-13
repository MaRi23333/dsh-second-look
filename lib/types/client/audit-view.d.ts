import type { AuditRecord } from './settings-api.js';
export type AuditCategory = 'exempt' | 'allow' | 'ask' | 'deny' | 'failure' | 'other';
export interface AuditEntry {
    key: string;
    latest: AuditRecord;
    records: AuditRecord[];
    category: AuditCategory;
}
export declare function auditCategory(record: AuditRecord): AuditCategory;
/** Group only one call in one session. Retain every transition, including its reason. */
export declare function groupAudit(records: readonly AuditRecord[]): AuditEntry[];
export declare function exportAudit(records: readonly AuditRecord[], scope?: 'recent' | 'blocked'): string;
//# sourceMappingURL=audit-view.d.ts.map