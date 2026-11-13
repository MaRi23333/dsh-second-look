/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T02).
 *
 * The restricted evidence probe backing `need_evidence` rounds: only
 * stat/read/search/diff, only through the filesystem surface (never a shell,
 * never the network), bounded output, and REDACTION BEFORE EGRESS — probe
 * results are what a model may see, so secrets are masked first and the
 * masking is disclosed (the reviewer is never misled about reduced evidence).
 */
import type { EvidenceDisclosure } from '../action/types.ts'
import { isSensitivePathText, redactSensitiveValues } from './sensitive.ts'
import { redactInlineSecrets } from '../review.ts'
import { inspectFileTarget, type TargetFileSystem } from './path-inspect.ts'

export type ProbeKind = 'stat' | 'read' | 'search' | 'diff'

export interface ProbeRequest {
  readonly kind: ProbeKind
  readonly path: string
  /** For `search`: the literal pattern to look for. */
  readonly pattern?: string | undefined
  /** For `read`: inclusive 1-based line range. */
  readonly range?: { readonly startLine?: number; readonly endLine?: number } | undefined
  /** For `diff`: the comparison file. */
  readonly oldPath?: string | undefined
}

export interface ProbeResult {
  readonly ok: boolean
  /** Redacted, bounded text — the only form allowed to leave the process. */
  readonly text: string
  readonly disclosures: readonly EvidenceDisclosure[]
}

export interface ProbeFileSystem extends TargetFileSystem<string> {
  readText(path: string, opts?: { cwd?: string | undefined; signal?: AbortSignal | undefined }): Promise<string>
  listDir(path: string, opts?: { cwd?: string | undefined; signal?: AbortSignal | undefined }): Promise<string[]>
  search(
    pattern: string,
    path: string,
    opts?: { cwd?: string | undefined; signal?: AbortSignal | undefined },
  ): Promise<readonly { file: string; line: number; text: string }[]>
}

export interface ProbeOptions {
  readonly workspaceRoot: string | undefined
  readonly maxOutputChars?: number
  readonly maxSearchMatches?: number
  readonly signal?: AbortSignal | undefined
}

const DEFAULT_MAX_OUTPUT_CHARS = 8000
const DEFAULT_MAX_SEARCH_MATCHES = 50

function redactAndBound(raw: string, options: ProbeOptions): { text: string; disclosures: EvidenceDisclosure[] } {
  const disclosures: EvidenceDisclosure[] = []
  // BOTH redaction passes run before egress (终审 Major 2): inline `key=value`
  // forms AND bare secret-VALUE shapes (tokens/PEM/JWTs) — a probe must never
  // hand raw secrets to the reviewer "for later judgment".
  const redacted = redactSensitiveValues(redactInlineSecrets(raw))
  if (redacted !== raw) {
    disclosures.push({ kind: 'redacted', detail: 'inline secret patterns masked before egress' })
  }
  const max = options.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS
  if (redacted.length > max) {
    disclosures.push({ kind: 'truncated', detail: `output truncated to ${max} of ${redacted.length} chars` })
    return { text: redacted.slice(0, max), disclosures }
  }
  return { text: redacted, disclosures }
}

/** Simple bounded line diff: common prefix/suffix trimmed, middle marked. */
function lineDiff(oldText: string, newText: string): string {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  let start = 0
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) start += 1
  let oldEnd = oldLines.length
  let newEnd = newLines.length
  while (oldEnd > start && newEnd > start && oldLines[oldEnd - 1] === newLines[newEnd - 1]) {
    oldEnd -= 1
    newEnd -= 1
  }
  const out: string[] = []
  for (let i = 0; i < start; i += 1) out.push(`  ${oldLines[i]}`)
  for (let i = start; i < oldEnd; i += 1) out.push(`- ${oldLines[i]}`)
  for (let i = start; i < newEnd; i += 1) out.push(`+ ${newLines[i]}`)
  for (let i = oldEnd; i < oldLines.length; i += 1) out.push(`  ${oldLines[i]}`)
  return out.join('\n')
}

/**
 * Run one restricted probe. Refuses (without leaking) anything outside the
 * established scope or naming a credential store; masks secrets in whatever it
 * does return; bounds all output.
 * @param fs - the structural filesystem surface (no shell, no network).
 * @param request - the bounded probe request.
 * @param options - workspace scope and budgets.
 * @returns redacted, bounded result with disclosure accounting.
 */
export async function runProbe(fs: ProbeFileSystem, request: ProbeRequest, options: ProbeOptions): Promise<ProbeResult> {
  const disclosures: EvidenceDisclosure[] = []
  // Credential-store naming is review-routing, never silently probed.
  if (isSensitivePathText(request.path) || (request.oldPath !== undefined && isSensitivePathText(request.oldPath))) {
    return {
      ok: false,
      text: '',
      disclosures: [{ kind: 'omitted', detail: 'probe refused: credential-store path requires a review decision first' }],
    }
  }

  const targetProbe = await inspectFileTarget(fs, request.path, options.workspaceRoot, options.signal)
  if (targetProbe.kind === 'review') {
    return {
      ok: false,
      text: '',
      disclosures: [{ kind: 'unknown-scope', detail: `probe refused: ${targetProbe.reasonCode}` }],
    }
  }
  if (targetProbe.evidence.workspaceRelation !== 'inside') {
    return {
      ok: false,
      text: '',
      disclosures: [{ kind: 'unknown-scope', detail: 'probe refused: target outside the established workspace' }],
    }
  }
  if (isSensitivePathText(targetProbe.evidence.resolvedPath)) {
    return { ok: false, text: '', disclosures: [{ kind: 'omitted', detail: 'probe refused: resolved credential-store path' }] }
  }

  // The probe body runs against a real filesystem surface: an I/O throw
  // (EISDIR, EACCES, decoding) becomes a REFUSED result with disclosure, never
  // an unhandled rejection up the call chain (T02 review F03).
  try {
    switch (request.kind) {
      case 'stat': {
        const evidence = targetProbe.evidence
        const raw = JSON.stringify({
          path: evidence.resolvedPath,
          exists: evidence.exists,
          kind: evidence.kind,
          sizeBytes: evidence.sizeBytes,
        })
        return { ok: true, ...redactAndBound(raw, options) }
      }
      case 'read': {
        const content = await fs.readText(request.path, { cwd: options.workspaceRoot, signal: options.signal })
        // Normalize CRLF so replayed lines carry no stray carriage returns
        // (T03 review S01).
        const lines = content.replace(/\r\n/gu, '\n').split('\n')
        const startLine = Math.max(1, request.range?.startLine ?? 1)
        const endLine = Math.min(lines.length, request.range?.endLine ?? lines.length)
        const slice = lines.slice(startLine - 1, endLine).join('\n')
        const { text, disclosures: d } = redactAndBound(slice, options)
        return { ok: true, text, disclosures: d }
      }
      case 'search': {
        const pattern = request.pattern ?? ''
        const matches = await fs.search(pattern, request.path, { cwd: options.workspaceRoot, signal: options.signal })
        const maxMatches = options.maxSearchMatches ?? DEFAULT_MAX_SEARCH_MATCHES
        const safeMatches = []
        for (const match of matches) {
          const probe = await inspectFileTarget(fs, match.file, options.workspaceRoot, options.signal)
          if (isSensitivePathText(match.file) || probe.kind !== 'ready'
            || probe.evidence.workspaceRelation !== 'inside' || isSensitivePathText(probe.evidence.resolvedPath)) {
            disclosures.push({ kind: 'omitted', detail: 'search match omitted: sensitive or unestablished file scope' })
            continue
          }
          safeMatches.push(match)
        }
        const kept = safeMatches.slice(0, maxMatches)
        // Node search excludes credential stores before reading them; disclose
        // the boundary even when the filesystem surface returned no matches.
        disclosures.push({ kind: 'omitted', detail: 'search excludes credential-store paths; those files are not reviewed' })
        if (safeMatches.length > kept.length) {
          disclosures.push({ kind: 'truncated', detail: `${kept.length} of ${safeMatches.length} matches kept` })
        }
        const raw = kept.map(match => `${match.file}:${match.line}: ${match.text}`).join('\n')
        const { text, disclosures: d } = redactAndBound(raw, options)
        return { ok: true, text, disclosures: [...disclosures, ...d] }
      }
      case 'diff': {
        if (request.oldPath === undefined) {
          return { ok: false, text: '', disclosures: [{ kind: 'omitted', detail: 'diff requires oldPath' }] }
        }
        const oldTarget = await inspectFileTarget(fs, request.oldPath, options.workspaceRoot, options.signal)
        if (oldTarget.kind === 'review' || oldTarget.evidence.workspaceRelation !== 'inside') {
          return { ok: false, text: '', disclosures: [{ kind: 'unknown-scope', detail: 'probe refused: oldPath outside the established workspace' }] }
        }
        if (isSensitivePathText(oldTarget.evidence.resolvedPath)) {
          return { ok: false, text: '', disclosures: [{ kind: 'omitted', detail: 'diff refused: resolved credential-store path' }] }
        }
        const oldText = await fs.readText(request.oldPath, { cwd: options.workspaceRoot, signal: options.signal })
        const newText = await fs.readText(request.path, { cwd: options.workspaceRoot, signal: options.signal })
        return { ok: true, ...redactAndBound(lineDiff(oldText.replace(/\r\n/gu, '\n'), newText.replace(/\r\n/gu, '\n')), options) }
      }
    }
  } catch (error: unknown) {
    return {
      ok: false,
      text: '',
      disclosures: [{ kind: 'omitted', detail: `probe failed: ${error instanceof Error ? error.message : String(error)}` }],
    }
  }
}
