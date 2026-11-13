/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T03).
 *
 * The reviewer's `need_evidence` request vocabulary and its validation. The
 * model may ask ONLY for restricted local probes — `stat` / `read` / `search`
 * / `diff` with bounded parameters — executed by this plugin's own probe
 * (never a shell, never the network, never parent-session tools). A request
 * that leaves that vocabulary fails structure validation as a whole: the
 * review then resolves to an explainable human-handoff failure instead of
 * guessing at what the model meant.
 */
import type { ProbeKind, ProbeRequest, ProbeResult } from './probe.js';
/** The closed probe vocabulary the reviewer may request. */
export declare const EVIDENCE_KINDS: readonly ProbeKind[];
/** Path parameter cap (characters). */
export declare const MAX_EVIDENCE_PATH_CHARS = 1024;
/** Search-pattern parameter cap (characters). */
export declare const MAX_EVIDENCE_PATTERN_CHARS = 512;
/** One completed evidence round: what the reviewer asked and what the probe returned. */
export interface EvidenceRoundItem {
    readonly request: ProbeRequest;
    readonly result: ProbeResult;
}
/** One completed `need_evidence` round, replayed into the next review prompt. */
export interface EvidenceRoundRecord {
    /** The reviewer's stated question for the round. */
    readonly question: string;
    readonly items: readonly EvidenceRoundItem[];
}
/**
 * Validate one evidence-request item against the closed vocabulary.
 * @param value - the raw item from the reviewer's structured output.
 * @returns the validated probe request, or undefined when the item is invalid.
 */
export declare function parseEvidenceItem(value: unknown): ProbeRequest | undefined;
/**
 * Validate the whole `need_evidence` payload: a non-empty array of valid
 * items, within the per-round item budget. ANY invalid item fails the whole
 * request — partial acceptance would let a malicious or sloppy verdict smuggle
 * a refused item past the reviewer's own accounting.
 * @param value - the raw `evidenceRequests` value.
 * @param maxItems - the tier's per-round item budget.
 * @returns the validated items, or undefined when the payload is invalid.
 */
export declare function parseEvidenceRequests(value: unknown, maxItems: number): readonly ProbeRequest[] | undefined;
/**
 * Render one probe request as a compact, unambiguous line (used in prompts and
 * audit records).
 * @param request - the validated probe request.
 * @returns the one-line rendering.
 */
export declare function renderEvidenceRequest(request: ProbeRequest): string;
//# sourceMappingURL=requests.d.ts.map