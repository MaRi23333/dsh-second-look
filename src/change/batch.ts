/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T05).
 *
 * The batch ledger: which code-change batch was reviewed, under which tier,
 * reviewer route and config version. Reuse is CONTENT-VERIFIED — an approved
 * batch may back later runs only while every reviewed file's content hash is
 * unchanged (checked again before the run; never by command text or watcher
 * events). Anything that changes the target script, dependencies/config,
 * permissions, reviewer route or tier invalidates the conclusion. A user
 * "allow this run" settles ONE action — it never marks the batch safe
 * forever. There is no auto-backup and no permanent allow ledger.
 */
import type { ReviewTier } from '../tier.ts'
import type { BatchSnapshot } from './collect.ts'

/** One reviewed batch record. */
export interface BatchReviewRecord {
  readonly id: string
  /** path → content hash at review time (the reuse proof). */
  readonly hashes: ReadonlyMap<string, string>
  /** Actions decided together with this batch (separate records per action). */
  readonly actionCallIds: readonly string[]
  readonly tier: ReviewTier
  readonly configVersion: string
  readonly decidedBy: 'reviewer' | 'human'
  readonly at: number
  /** Files named in the snapshot but not content-verified (binary/over-budget). */
  readonly uncovered: readonly string[]
}

/** Why a batch record no longer applies. */
export type BatchInvalidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string }

/** The batch ledger for one mounted gate. */
export class BatchLedger {
  private readonly records = new Map<string, BatchReviewRecord>()

  /**
   * Store one reviewed batch.
   * @param record - the record (hashes captured at review time).
   */
  add(record: BatchReviewRecord): void {
    this.records.set(record.id, record)
  }

  /**
   * Whether a stored batch still covers a CURRENT snapshot: every reviewed
   * file's content hash must match, the config version and tier must be
   * unchanged, and the snapshot must carry no NEW file. Content re-verified,
   * every time.
   * @param id - the batch record id.
   * @param current - the freshly collected snapshot.
   * @param tier - the tier of the pending action.
   * @param configVersion - the gate config version of the pending action.
   * @returns ok, or the named reason it no longer applies.
   */
  checkReuse(id: string, current: BatchSnapshot, tier: ReviewTier, configVersion: string): BatchInvalidation {
    if (current.gaps.length > 0) return { ok: false, reason: 'current collection has coverage gaps; batch reuse is unavailable' }
    const record = this.records.get(id)
    if (record === undefined) return { ok: false, reason: `batch ${id} is not a reviewed batch` }
    if (record.tier !== tier) return { ok: false, reason: `batch ${id} was reviewed under tier ${record.tier}, not ${tier}` }
    if (record.configVersion !== configVersion) {
      return { ok: false, reason: `batch ${id} was reviewed under a different config version (route/policy/permission change)` }
    }
    for (const file of current.files) {
      const reviewed = record.hashes.get(file.path)
      if (reviewed === undefined) {
        return { ok: false, reason: `file ${file.path} changed the batch since review (new file)` }
      }
      // Strict: a file whose content is NOT verifiable now (binary/over-budget
      // replacement) is a change — never an implicit "unchanged" (T05 review F01).
      if (file.contentHash === undefined || file.contentHash !== reviewed) {
        return { ok: false, reason: `file ${file.path} changed since review (content not verifiable or mismatch)` }
      }
    }
    for (const [path, hash] of record.hashes) {
      const currentFile = current.files.find(file => file.path === path)
      if (currentFile === undefined) return { ok: false, reason: `reviewed file ${path} is missing from the current batch` }
      if (currentFile.contentHash === undefined || currentFile.contentHash !== hash) {
        return { ok: false, reason: `file ${path} changed since review (content not verifiable or mismatch)` }
      }
    }
    return { ok: true }
  }

  /**
   * The most recent record whose reuse check passes for this snapshot.
   * @param current - the freshly collected snapshot.
   * @param tier - the pending tier.
   * @param configVersion - the pending config version.
   * @returns the reusable record, or undefined.
   */
  findReusable(current: BatchSnapshot, tier: ReviewTier, configVersion: string): BatchReviewRecord | undefined {
    const candidates = [...this.records.values()].sort((a, b) => b.at - a.at)
    for (const candidate of candidates) {
      if (this.checkReuse(candidate.id, current, tier, configVersion).ok) return candidate
    }
    return undefined
  }

  /**
   * The newest reviewed content hash for one path under the CURRENT tier and
   * config version (per-file reuse: an unchanged file keeps its review
   * evidence even when OTHER files changed; a route/permission/tier change
   * still invalidates everything).
   * @param path - the file path.
   * @param tier - the pending tier.
   * @param configVersion - the pending config version.
   * @returns the hash, or undefined when no record reviewed this path.
   */
  latestHash(path: string, tier: ReviewTier, configVersion: string): string | undefined {
    const candidates = [...this.records.values()]
      .filter(record => record.tier === tier && record.configVersion === configVersion)
      .sort((a, b) => b.at - a.at)
    for (const candidate of candidates) {
      const hash = candidate.hashes.get(path)
      if (hash !== undefined) return hash
    }
    return undefined
  }

  /**
   * Invalidate one record (target script / dependency / permission / route /
   * tier change, user rejection, or a later modification at delivery).
   * @param id - the record id.
   * @param reason - audit-visible reason.
   */
  invalidate(id: string, reason: string): void {
    void reason
    this.records.delete(id)
  }

  /** Invalidate everything (config change, disposal). */
  invalidateAll(): void {
    this.records.clear()
  }

  /** Record count (status surface). */
  get size(): number {
    return this.records.size
  }
}
