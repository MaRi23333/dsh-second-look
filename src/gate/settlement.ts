import { text } from '../locale.ts'
import type { UiLanguage } from '../messages.ts'
/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T04).
 *
 * The settlement map: the gate's allow-state ledger. One entry binds ONE
 * execution instance — the host's deep-frozen execution token, call id,
 * session, tool name, argument digest and the config version — so an allow
 * can only ever settle THAT call (T00 review F02 model, verified live in
 * runs 15–17b: `guard-pass consumed:true`). Settlements are SINGLE-USE: the
 * guard burns the entry on first pass. Real approval outcomes arrive from the
 * host settlement chain (`approval/asked` → `approval/decided`); the map never
 * invents host facts, it only binds them to execution identity.
 *
 * Invalidation: cancellation, session end, tier/route/policy change (config
 * version bump) and plugin disposal all invalidate entries. A late verdict
 * settling an invalidated entry is ignored — a cancelled call can never
 * execute afterwards.
 */
import { createHash } from 'node:crypto'

/** The execution-instance identity an allow is bound to. */
export interface ExecutionIdentity {
  /** The host execution token (deep-frozen, per-call). */
  readonly token: unknown
  readonly callId: string
  readonly rootCallId: string | undefined
  readonly sessionId: string
  readonly toolName: string
  /** Digest of the frozen arguments (local-only; never logged raw). */
  readonly argHash: string
  /** The gate configuration revision the decision was made under. */
  readonly configVersion: string
}

/** Who produced the allow — for audit and status. */
export type DecidedBy = 'exempt' | 'reviewer' | 'human' | 'fallback'

/** The real approval outcome vocabulary (host `ApprovalOutcome`). */
export type SettlementOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'

/** One ledger entry. */
export interface SettlementEntry {
  readonly identity: ExecutionIdentity
  /** Bound on settle; mutable because settle fills it in after `record`. */
  decidedBy: DecidedBy
  outcome: SettlementOutcome
  readonly at: number
  /** Burned by the guard on first pass. */
  consumed: boolean
  /** Invalidated entries can never pass the guard. */
  invalidated: boolean
  invalidationReason?: string
}

/** Guard verification result. */
export type GuardVerdict =
  | { readonly ok: true; readonly decidedBy: DecidedBy }
  | { readonly ok: false; readonly reason: string }

/**
 * Digest the frozen call arguments. The digest proves immutability across
 * witnesses (pre-execute vs guard) without keeping raw arguments around;
 * sensitive values never leave the local process through it.
 * @param args - the frozen arguments.
 * @returns sha256 hex digest (32 chars) or a marker for unserializable input.
 */
export function argsDigest(args: unknown): string {
  try {
    return createHash('sha256').update(JSON.stringify(args) ?? 'undefined').digest('hex').slice(0, 32)
  } catch {
    return 'unserializable'
  }
}

/** FIFO cap on retained ledger entries (live + tombstones). */
const TOMBSTONE_CAP = 512

/**
 * The settlement ledger. One instance per mounted gate.
 *
 * Consumed and invalidated entries are kept as bounded TOMBSTONES so a second
 * pass reports WHY it fails ("already consumed" / "invalidated (reason)")
 * instead of a flat "no record"; the map is FIFO-capped at
 * {@link TOMBSTONE_CAP} entries to bound memory in long sessions.
 */
export class SettlementMap {
  /** callId → entry. A call id settles at most once, ever. */
  private readonly entries = new Map<string, SettlementEntry>()

  /**
   * Record a pending execution at pre-execute time (identity binding).
   * @param identity - the execution identity.
   */
  record(identity: ExecutionIdentity): void {
    if (this.entries.size >= TOMBSTONE_CAP) {
      // Evict a TOMBSTONE first (红队 §4b): a LIVE pending record must not be
      // washed out under concurrency — that would let a real human allow
      // settle into nothing and desync approval/execution/audit.
      let evicted = false
      for (const [key, entry] of this.entries) {
        if (entry.consumed || entry.invalidated) {
          this.entries.delete(key)
          evicted = true
          break
        }
      }
      if (!evicted) {
        const oldest = this.entries.keys().next()
        if (!oldest.done) this.entries.delete(oldest.value)
      }
    }
    this.entries.set(identity.callId, {
      identity,
      decidedBy: 'exempt',
      outcome: 'unavailable',
      at: Date.now(),
      consumed: false,
      invalidated: false,
    })
  }

  /**
   * Bind a real approval outcome to the recorded execution. A settle for an
   * unknown, consumed or invalidated call id is IGNORED (late results can
   * never resurrect a cancelled call).
   * @param callId - the settled call.
   * @param toolName - the tool the approval chain settled (checked against the record).
   * @param outcome - the real host outcome.
   * @param decidedBy - who decided.
   * @returns true when the settle was applied.
   */
  settle(callId: string, toolName: string, outcome: SettlementOutcome, decidedBy: DecidedBy): boolean {
    const entry = this.entries.get(callId)
    if (entry === undefined) return false
    if (entry.consumed || entry.invalidated) return false
    if (entry.identity.toolName !== toolName) return false
    entry.decidedBy = decidedBy
    entry.outcome = outcome
    return true
  }

  /**
   * Guard-side verification: exactly one pass for one bound, settled
   * execution. Every mismatch is named in the reason (evidence for the deny).
   * @param identity - the identity of the execution about to dispatch.
   * @returns pass (and burns the entry) or a deny reason.
   */
  verifyAndConsume(identity: ExecutionIdentity, language: UiLanguage = 'en'): GuardVerdict {
    const t = (zh: string, en: string): string => text(language, zh, en)
    const entry = this.entries.get(identity.callId)
    if (entry === undefined) {
      return { ok: false, reason: t(`调用 ${identity.callId}（${identity.toolName}）没有审批记录，未执行`, `no gate record for execution ${identity.callId} (${identity.toolName})`) }
    }
    const tokenMatch = entry.identity.token === identity.token
    const toolMatch = entry.identity.toolName === identity.toolName
    const argsMatch = entry.identity.argHash === identity.argHash
    const sessionMatch = entry.identity.sessionId === identity.sessionId
    const configMatch = entry.identity.configVersion === identity.configVersion
    if (!(tokenMatch && toolMatch && argsMatch && sessionMatch && configMatch)) {
      return {
        ok: false,
        reason: t(`调用 ${identity.callId}（${identity.toolName}）的执行信息与审批记录不一致：`, `gate record mismatch for ${identity.callId} (${identity.toolName}): `)
          + `token:${tokenMatch} tool:${toolMatch} args:${argsMatch} session:${sessionMatch} config:${configMatch}`,
      }
    }
    if (entry.invalidated) {
      return { ok: false, reason: t(`调用 ${identity.callId} 的审批记录已失效，需重新审核`, `gate record invalidated (${entry.invalidationReason ?? 'unknown'}) for ${identity.callId}`) }
    }
    if (entry.consumed) {
      return { ok: false, reason: t(`调用 ${identity.callId} 的一次性授权已使用，不能重复执行`, `gate record already consumed for ${identity.callId} — single-use allow`) }
    }
    if (entry.outcome !== 'allowed-once') {
      return { ok: false, reason: t(`调用 ${identity.callId} 未获批准，操作未执行`, `approval outcome "${entry.outcome}" is not an allow for ${identity.callId}`) }
    }
    // Single-use consumption: the entry stays as a tombstone for the precise
    // "already consumed" diagnostic; it can never pass again.
    entry.consumed = true
    return { ok: true, decidedBy: entry.decidedBy }
  }

  /**
   * Invalidate one call's entry (cancellation, late teardown). The tombstone
   * keeps the invalidation reason for the guard's diagnostic.
   * @param callId - the call.
   * @param reason - audit-visible reason.
   */
  invalidate(callId: string, reason: string): void {
    const entry = this.entries.get(callId)
    if (entry === undefined) return
    entry.invalidated = true
    entry.invalidationReason = reason
  }

  /**
   * Invalidate every entry of one session (session end).
   * @param sessionId - the session.
   * @param reason - audit-visible reason.
   */
  invalidateSession(sessionId: string, reason: string): void {
    for (const [callId, entry] of this.entries) {
      if (entry.identity.sessionId === sessionId) {
        entry.invalidated = true
        entry.invalidationReason = reason
        this.entries.delete(callId)
      }
    }
  }

  /**
   * Invalidate everything (config version bump, tier/route/policy change,
   * plugin disposal).
   * @param reason - audit-visible reason.
   */
  invalidateAll(reason: string): void {
    for (const entry of this.entries.values()) {
      entry.invalidated = true
      entry.invalidationReason = reason
    }
    this.entries.clear()
  }

  /** How many entries are pending (status surface). */
  get size(): number {
    let count = 0
    for (const entry of this.entries.values()) {
      if (!entry.consumed && !entry.invalidated) count += 1
    }
    return count
  }

  /** Whether a call id currently has a live entry (test/status helper). */
  has(callId: string): boolean {
    const entry = this.entries.get(callId)
    return entry !== undefined && !entry.consumed && !entry.invalidated
  }
}
