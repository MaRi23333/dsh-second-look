export type AuditScope = 'recent' | 'blocked';
export interface AuditPersistence {
    load(): unknown;
    save(records: readonly AuditRecord[]): void;
}
export declare class FileAuditPersistence implements AuditPersistence {
    readonly dir: string;
    constructor(dir: string);
    load(): unknown;
    save(records: readonly AuditRecord[]): void;
}
export declare function isBlockedAudit(record: AuditRecord): boolean;
/** One audit record (redacted, bounded). */
export interface AuditRecord {
    readonly at: number;
    readonly sessionId?: string | undefined;
    readonly callId: string;
    readonly toolName: string;
    readonly tier: string;
    /** The gate config version the decision was made under. */
    readonly configVersion: string;
    /** The reviewer model actually used ('-' for exempt, 'human' chains). */
    readonly model: string;
    readonly decision: string;
    /** Redacted, bounded reason. */
    readonly reason: string;
    readonly durationMs: number | null;
    /** Token usage when the host exposes it — `unknown` otherwise, never estimated. */
    readonly usage: {
        readonly input?: number;
        readonly output?: number;
    } | 'unknown';
    /** Human chain outcome, when one settled the call. */
    readonly humanOutcome?: string | undefined;
}
/** The audit log for one mounted gate. */
export declare class AuditLog {
    private readonly persistence?;
    private readonly records;
    private readonly blocked;
    private degradedReason;
    constructor(persistence?: AuditPersistence | undefined);
    /**
     * Append one record. NEVER throws: a logging failure flips the visible
     * degradation flag and the decision proceeds unchanged.
     * @param record - the record (reason will be redacted + bounded).
     */
    append(record: Omit<AuditRecord, 'reason'> & {
        reason: string;
    }): void;
    /** Whether logging degraded (visible on the status surface). */
    get degraded(): boolean;
    /** The degradation reason, when degraded. */
    get degradationReason(): string | undefined;
    /** The newest records (bounded copy). */
    recent(limit?: number): readonly AuditRecord[];
    blockedRecent(limit?: number): readonly AuditRecord[];
    /** Record count. */
    get size(): number;
    /** Clear (disposal / tests). */
    clear(scope?: AuditScope): void;
}
//# sourceMappingURL=audit.d.ts.map