/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T07).
 *
 * The decision audit log: one record per gate decision, kept WITHOUT full
 * thinking, sensitive parameters or complete config (task §T07). Reasons are
 * redacted and bounded before storage; usage is recorded as `unknown` when
 * the host does not expose it — never estimated as measured. Logging failures
 * NEVER alter a decision or let a dangerous call through: they flip a visible
 * degradation flag on the status surface instead.
 */
import { redactReviewEvidence, truncate } from '../review.ts'
import { mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

export type AuditScope = 'recent' | 'blocked'
export interface AuditPersistence { load(): unknown; save(records: readonly AuditRecord[]): void }
export class FileAuditPersistence implements AuditPersistence {
  constructor(readonly dir: string) {}
  load(): unknown {
    try {
      const document = JSON.parse(readFileSync(join(this.dir, 'blocked-audit.json'), 'utf8')) as { version?: unknown; records?: unknown }
      if (document?.version !== 1 || !Array.isArray(document.records)) throw new Error('invalid audit document')
      return document.records
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error }
  }
  save(records: readonly AuditRecord[]): void {
    mkdirSync(this.dir, { recursive: true })
    const temp = join(this.dir, `blocked-audit.${randomUUID()}.tmp`)
    try {
      writeFileSync(temp, JSON.stringify({ version: 1, records }) + '\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 })
      renameSync(temp, join(this.dir, 'blocked-audit.json'))
    } finally { try { unlinkSync(temp) } catch { /* absent or already renamed */ } }
  }
}

export function isBlockedAudit(record: AuditRecord): boolean {
  return ['deny', 'rule-deny', 'guard-blocked', 'outbound-blocked'].includes(record.decision)
    || (record.decision === 'human-settled' && record.humanOutcome === 'rejected')
}
const recordSchema = z.object({
  at: z.number().finite(), sessionId: z.string().optional(), callId: z.string(), toolName: z.string(),
  tier: z.string(), configVersion: z.string(), model: z.string(), decision: z.string(), reason: z.string(),
  durationMs: z.number().finite().nullable(), humanOutcome: z.string().optional(),
  usage: z.union([z.literal('unknown'), z.object({ input: z.number().finite().optional(), output: z.number().finite().optional() })]),
})
function cleanRecord(value: unknown): AuditRecord {
  const record = recordSchema.parse(value)
  for (const key of ['sessionId', 'callId', 'toolName', 'tier', 'configVersion', 'model', 'decision', 'reason', 'humanOutcome'] as const) {
    if (record[key] !== undefined) record[key] = truncate(redactReviewEvidence(record[key]), key === 'reason' ? AUDIT_REASON_CHARS : 512)
  }
  return record as AuditRecord
}

/** One audit record (redacted, bounded). */
export interface AuditRecord {
  readonly at: number
  readonly sessionId?: string | undefined
  readonly callId: string
  readonly toolName: string
  readonly tier: string
  /** The gate config version the decision was made under. */
  readonly configVersion: string
  /** The reviewer model actually used ('-' for exempt, 'human' chains). */
  readonly model: string
  readonly decision: string
  /** Redacted, bounded reason. */
  readonly reason: string
  readonly durationMs: number | null
  /** Token usage when the host exposes it — `unknown` otherwise, never estimated. */
  readonly usage: { readonly input?: number; readonly output?: number } | 'unknown'
  /** Human chain outcome, when one settled the call. */
  readonly humanOutcome?: string | undefined
}

/** Reason cap for the log (thinking text is NOT logged at all). */
const AUDIT_REASON_CHARS = 400

/** Ring-buffer cap. */
const AUDIT_MAX_RECORDS = 500

/** The audit log for one mounted gate. */
export class AuditLog {
  private readonly records: AuditRecord[] = []
  private readonly blocked: AuditRecord[] = []
  private degradedReason: string | undefined

  constructor(private readonly persistence?: AuditPersistence) {
    try {
      const loaded = persistence?.load() ?? []
      if (!Array.isArray(loaded)) throw new Error('invalid audit records')
      this.blocked.push(...loaded.map(cleanRecord).filter(isBlockedAudit).sort((a, b) => b.at - a.at).slice(0, 100))
    } catch { this.degradedReason = 'blocked history could not be loaded' }
  }

  /**
   * Append one record. NEVER throws: a logging failure flips the visible
   * degradation flag and the decision proceeds unchanged.
   * @param record - the record (reason will be redacted + bounded).
   */
  append(record: Omit<AuditRecord, 'reason'> & { reason: string }): void {
    try {
      const cleaned = cleanRecord(record)
      this.records.unshift(cleaned)
      if (this.records.length > AUDIT_MAX_RECORDS) this.records.length = AUDIT_MAX_RECORDS
      if (isBlockedAudit(cleaned)) {
        this.blocked.unshift(cleaned)
        this.blocked.length = Math.min(this.blocked.length, 100)
        this.persistence?.save(this.blocked)
        this.degradedReason = undefined
      }
    } catch {
      this.degradedReason = 'audit record could not be saved; blocked history may not survive restart'
    }
  }

  /** Whether logging degraded (visible on the status surface). */
  get degraded(): boolean {
    return this.degradedReason !== undefined
  }

  /** The degradation reason, when degraded. */
  get degradationReason(): string | undefined {
    return this.degradedReason
  }

  /** The newest records (bounded copy). */
  recent(limit = 50): readonly AuditRecord[] {
    return this.records.slice(0, Math.max(0, Math.min(limit, AUDIT_MAX_RECORDS)))
  }
  blockedRecent(limit = 100): readonly AuditRecord[] {
    return this.blocked.slice(0, Math.max(0, Math.min(limit, 100)))
  }

  /** Record count. */
  get size(): number {
    return this.records.length
  }

  /** Clear (disposal / tests). */
  clear(scope: AuditScope = 'recent'): void {
    if (scope === 'blocked') {
      // Report success only after the durable copy has been cleared.
      this.persistence?.save([])
      this.blocked.length = 0
      this.degradedReason = undefined
    } else this.records.length = 0
  }
}
