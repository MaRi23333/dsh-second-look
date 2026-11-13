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
import type { ProbeKind, ProbeRequest, ProbeResult } from './probe.ts'

/** The closed probe vocabulary the reviewer may request. */
export const EVIDENCE_KINDS: readonly ProbeKind[] = ['stat', 'read', 'search', 'diff']

/** Path parameter cap (characters). */
export const MAX_EVIDENCE_PATH_CHARS = 1024

/** Search-pattern parameter cap (characters). */
export const MAX_EVIDENCE_PATTERN_CHARS = 512

/** One completed evidence round: what the reviewer asked and what the probe returned. */
export interface EvidenceRoundItem {
  readonly request: ProbeRequest
  readonly result: ProbeResult
}

/** One completed `need_evidence` round, replayed into the next review prompt. */
export interface EvidenceRoundRecord {
  /** The reviewer's stated question for the round. */
  readonly question: string
  readonly items: readonly EvidenceRoundItem[]
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

const ITEM_KEYS = new Set(['kind', 'path', 'pattern', 'range', 'oldPath'])

/**
 * Validate one evidence-request item against the closed vocabulary.
 * @param value - the raw item from the reviewer's structured output.
 * @returns the validated probe request, or undefined when the item is invalid.
 */
export function parseEvidenceItem(value: unknown): ProbeRequest | undefined {
  if (!isPlainObject(value)) return undefined
  for (const key of Object.keys(value)) {
    if (!ITEM_KEYS.has(key)) return undefined
  }
  const kind = value.kind
  if (kind !== 'stat' && kind !== 'read' && kind !== 'search' && kind !== 'diff') return undefined
  const path = value.path
  if (!isBoundedString(path, MAX_EVIDENCE_PATH_CHARS)) return undefined
  const pattern = value.pattern
  const range = value.range
  const oldPath = value.oldPath
  if (pattern !== undefined && (kind !== 'search' || !isBoundedString(pattern, MAX_EVIDENCE_PATTERN_CHARS))) return undefined
  if (oldPath !== undefined && (kind !== 'diff' || !isBoundedString(oldPath, MAX_EVIDENCE_PATH_CHARS))) return undefined
  if (range !== undefined) {
    if (kind !== 'read' || !isPlainObject(range)) return undefined
    for (const key of Object.keys(range)) {
      if (key !== 'startLine' && key !== 'endLine') return undefined
    }
    const startLine = range.startLine
    const endLine = range.endLine
    if (startLine !== undefined && !isPositiveInt(startLine)) return undefined
    if (endLine !== undefined && !isPositiveInt(endLine)) return undefined
    if (startLine !== undefined && endLine !== undefined && startLine > endLine) return undefined
  }
  if (kind === 'search' && pattern === undefined) return undefined
  if (kind === 'diff' && oldPath === undefined) return undefined
  return {
    kind,
    path,
    ...pattern === undefined ? {} : { pattern },
    ...range === undefined ? {} : { range },
    ...oldPath === undefined ? {} : { oldPath },
  }
}

/**
 * Validate the whole `need_evidence` payload: a non-empty array of valid
 * items, within the per-round item budget. ANY invalid item fails the whole
 * request — partial acceptance would let a malicious or sloppy verdict smuggle
 * a refused item past the reviewer's own accounting.
 * @param value - the raw `evidenceRequests` value.
 * @param maxItems - the tier's per-round item budget.
 * @returns the validated items, or undefined when the payload is invalid.
 */
export function parseEvidenceRequests(value: unknown, maxItems: number): readonly ProbeRequest[] | undefined {
  if (!Array.isArray(value)) return undefined
  if (value.length === 0 || value.length > maxItems) return undefined
  const items: ProbeRequest[] = []
  for (const item of value) {
    const parsed = parseEvidenceItem(item)
    if (parsed === undefined) return undefined
    items.push(parsed)
  }
  return items
}

/**
 * Render one probe request as a compact, unambiguous line (used in prompts and
 * audit records).
 * @param request - the validated probe request.
 * @returns the one-line rendering.
 */
export function renderEvidenceRequest(request: ProbeRequest): string {
  const params: string[] = [`path=${request.path}`]
  if (request.pattern !== undefined) params.push(`pattern=${JSON.stringify(request.pattern)}`)
  if (request.range !== undefined) {
    params.push(`lines=${request.range.startLine ?? 1}..${request.range.endLine ?? 'end'}`)
  }
  if (request.oldPath !== undefined) params.push(`oldPath=${request.oldPath}`)
  return `${request.kind} ${params.join(' ')}`
}
