/**
 * Modified for dsh-second-look, 2026-10-31 (T01 migration; see THIRD-PARTY-SOURCES.md).
 * Same-fingerprint verdict cache for `dsh-auto-review`: reuses a recent
 * reviewer verdict (`{decision, reason, riskLevel}`) for an identical,
 * normalized `tool + arguments` fingerprint within a TTL, so a repeated
 * action does not pay a second-model round-trip. Independent pure module —
 * it never reads the circuit breaker, the risk rules, the reviewer prompt,
 * or the session log; the runtime decides when a verdict is cacheable and
 * what a hit settles as.
 *
 * The fingerprint is a SHA-256 digest of `toolName` and the CANONICALIZED
 * call arguments. Only the digest is stored — plaintext arguments (which may
 * be sensitive) never enter the cache. Normalization strips volatile fields
 * (timestamps, request/correlation ids, nonces, …) and sorts object keys, so
 * argument ORDER and FORMATTING differences do not split what is semantically
 * the same action. Keys that name a semantic target (`id`, `callId`,
 * `sessionId`, …) are deliberately NOT volatile: stripping them would
 * collapse distinct actions into one verdict.
 * @module dsh-auto-review/cache
 */
import type { RiskLevel } from './config.js';
import type { ReviewerDecision } from './review-types.js';
/** The verdict a cache entry replays — exactly the reviewer's closed decision vocabulary. */
export interface CachedVerdict {
    readonly decision: ReviewerDecision;
    readonly reason: string;
    readonly riskLevel?: RiskLevel;
}
/**
 * Canonical JSON text of an argument value: volatile keys removed, object
 * keys sorted. Formatting- and order-stable.
 * @param value - any parsed (JSON-safe) argument value.
 * @returns the canonical JSON string.
 */
export declare function canonicalArguments(value: unknown): string;
/**
 * The same-fingerprint verdict cache key: SHA-256 of `toolName` and the
 * canonicalized arguments. Only the digest is produced — no plaintext
 * argument survives this function.
 * @param toolName - the pending tool call's name.
 * @param rawArguments - the presented call arguments as raw JSON text, or
 *   undefined when the log lacks them.
 * @returns the hex digest, or undefined when the arguments are absent or
 *   unparseable (the caller must then skip the cache, preserving fail-closed).
 */
export declare function fingerprint(toolName: string, rawArguments: string | undefined): string | undefined;
/** Construction parameters for a {@link VerdictCache}. */
export interface VerdictCacheOptions {
    /** Reuse window in milliseconds; `0` disables the cache entirely. */
    readonly ttlMs: number;
    /** Hard cap on cached fingerprints; the oldest entry is evicted beyond it. */
    readonly maxEntries: number;
}
/**
 * A process-local, TTL-bounded map from verdict fingerprint to verdict. It
 * owns only expiration and eviction — no verdict semantics, no circuit or
 * risk logic. Reads count hits, writes count stores, both exposed for the
 * panel and tests.
 */
export declare class VerdictCache {
    private readonly options;
    private readonly entries;
    private hitCount;
    private storeCount;
    constructor(options: VerdictCacheOptions);
    /**
     * Look up an unexpired verdict for a fingerprint.
     * @param fingerprint - the cached key.
     * @param now - current epoch milliseconds.
     * @returns the replayable verdict, or undefined on miss, expiry, or a disabled cache.
     */
    get(fingerprint: string, now: number): CachedVerdict | undefined;
    /**
     * Store a verdict under a fingerprint, then expire stale entries and evict
     * the oldest beyond the cap.
     * @param fingerprint - the cached key.
     * @param verdict - the verdict to replay on a later hit.
     * @param now - current epoch milliseconds.
     */
    set(fingerprint: string, verdict: CachedVerdict, now: number): void;
    /** Drop expired entries, then the oldest entries beyond {@link VerdictCacheOptions.maxEntries}. */
    private evict;
    /** Cumulative cache hits since construction (or the last {@link clear}). */
    get hits(): number;
    /** Cumulative cache stores since construction (or the last {@link clear}). */
    get stores(): number;
    /** Live entry count. */
    get size(): number;
    /** Empty the cache and reset the counters. */
    clear(): void;
}
//# sourceMappingURL=cache.d.ts.map