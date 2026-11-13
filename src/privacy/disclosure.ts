/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T06).
 *
 * Precise disclosure authorization. One grant binds EXACTLY one data
 * fingerprint (which sensitive spans) to EXACTLY one destination (LLM
 * provider + model) for ONE scenario (disclosure-to-model). It never
 * authorizes other scenarios (program credential use, public publication)
 * and never covers other data or other destinations:
 *
 * - identical retry / repeated history sends of the SAME data to the SAME
 *   destination reuse the grant — no re-prompt loops;
 * - a destination change or ADDED sensitive content needs a new decision;
 * - a refused disclosure stays refused for that scope — no implicit resend;
 * - records carry redacted evidence and local digests only, never raw keys.
 */

/** Where a disclosure goes: the exact LLM route. */
export interface DisclosureDestination {
  readonly provider: string
  readonly model: string
}

/** One disclosure scope: this data, this destination, this scenario. */
export interface DisclosureScope {
  readonly sessionId?: string | undefined
  readonly destination: DisclosureDestination
  /** The scan's local digest of the raw sensitive spans. */
  readonly dataFingerprint: string
}

/** Who authorized/refused the disclosure. */
export type DisclosureDecider = 'user' | 'reviewer'

/** One recorded disclosure decision (audit; redacted only). */
export interface DisclosureRecord {
  readonly scope: DisclosureScope
  readonly reason?: string | undefined
  readonly granted: boolean
  readonly decidedBy: DisclosureDecider
  readonly at: number
  /** Redacted evidence summary of what was at stake. */
  readonly evidence: readonly string[]
  /** Matching request association (call/session), for audit. */
  readonly requestRef: string
}

function scopeKey(scope: DisclosureScope): string {
  return `${scope.sessionId ?? ''}\u0000${scope.destination.provider}\u0000${scope.destination.model}\u0000${scope.dataFingerprint}`
}

/** The disclosure ledger for one mounted gate. */
export class DisclosureLedger {
  private readonly records = new Map<string, DisclosureRecord>()

  /**
   * Record a disclosure decision for one exact scope.
   * @param record - the decision (granted or refused).
   */
  record(record: DisclosureRecord): void {
    this.records.set(scopeKey(record.scope), record)
  }

  /**
   * Look up an exact scope: `granted` may send as-is, `denied` must NOT
   * resend (no implicit retry), `unknown` needs a decision.
   * @param scope - the exact data + destination scope.
   * @returns the authorization state.
   */
  check(scope: DisclosureScope): 'granted' | 'denied' | 'unknown' {
    const record = this.records.get(scopeKey(scope))
    if (record === undefined) return 'unknown'
    return record.granted ? 'granted' : 'denied'
  }

  /** The recorded decision (audit/status). */
  get(scope: DisclosureScope): DisclosureRecord | undefined {
    return this.records.get(scopeKey(scope))
  }

  invalidateSession(sessionId: string): void {
    for (const [key, record] of this.records) if (record.scope.sessionId === sessionId) this.records.delete(key)
  }

  /** Invalidate everything (config/route change, disposal). */
  invalidateAll(): void {
    this.records.clear()
  }

  /** Record count (status surface). */
  get size(): number {
    return this.records.size
  }
}
