/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T05).
 *
 * Change-batch collection for the strict tier: what code/config is pending
 * review before a run (build/test/install/commit/push/publish) and before
 * delivery. Git projects cover staged + unstaged + untracked (and ignored
 * files that are actually involved); when git state is incomplete the gap is
 * NAMED, never papered over. Non-git projects use the gate's OBSERVED
 * modifications (write/edit targets seen at pre-execute). There is no
 * auto-backup/restore. Bounds: a bounded file count and per-file size —
 * large/binary/over-budget files are marked "not reviewed by this batch",
 * never assumed reviewed. File identity is verified by CONTENT HASH of the
 * few files that matter (not a whole-repo hash ritual).
 */
import { createHash } from 'node:crypto'
import type { ProbeFileSystem } from '../evidence/probe.ts'
import { comparablePath, lexicalResolve, inspectFileTarget } from '../evidence/path-inspect.ts'
import { isSensitivePathText } from '../evidence/sensitive.ts'
import { runIsolatedGit } from './git-safe.ts'

/** How a changed file entered the batch. */
export type ChangedFileKind = 'staged' | 'unstaged' | 'untracked' | 'ignored-involved' | 'observed'

/** One changed file in a batch snapshot. */
export interface ChangedFile {
  readonly path: string
  readonly kind: ChangedFileKind
  /** sha256 (32 hex) of the current content, when readable and in budget. */
  readonly contentHash?: string | undefined
  readonly reviewText?: string | undefined
  readonly bytes?: number | undefined
  /** True when the content is not comparable text (binary/decode failure). */
  readonly binary?: boolean
  /** True when the file no longer exists (deleted — not comparable). */
  readonly deleted?: true
  /** True when the content exceeded the per-file budget and was NOT hashed. */
  readonly overBudget?: boolean
  /** Credential-store content is not read or sent without disclosure authorization. */
  readonly omitted?: 'sensitive-path'
}

/** One collected batch snapshot. */
export interface BatchSnapshot {
  readonly files: readonly ChangedFile[]
  /** Explicit coverage gaps (git missing, binary files, over-budget…). */
  readonly gaps: readonly string[]
  readonly collectedAt: number
}

/** The structural git surface (injectable for tests). */
export interface GitRunner {
  run(args: readonly string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }>
}

/** Batch bounds: bounded work, disclosed as gaps when exceeded. */
export const BATCH_MAX_FILES = 200
export const BATCH_MAX_FILE_BYTES = 256 * 1024

/** Hash file content for batch identity (local-only digest). */
export function hashContent(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 32)
}

/**
 * Collect a batch snapshot from a git project: staged, unstaged, untracked
 * and ignored-but-involved files. Git failures become named gaps.
 * @param git - the git runner.
 * @param fs - the probe filesystem (content hashing).
 * @param cwd - the workspace root.
 * @param signal - cancellation.
 * @returns the snapshot (possibly with gaps).
 */
export async function collectGitBatch(
  git: GitRunner,
  fs: ProbeFileSystem,
  cwd: string,
  signal?: AbortSignal | undefined,
): Promise<BatchSnapshot> {
  const gaps: string[] = []
  const files: ChangedFile[] = []
  // NO `--ignored=matching`: it recursively expands ignored trees (think
  // node_modules/) and would blow the file budget past real source changes
  // (T05 review F05). Ignored-but-INVOLVED files join the batch through the
  // gate's observed write/edit targets (see collectFullBatch).
  const status = await git.run(['status', '--porcelain', '-z', '--untracked-files=all', '--ignore-submodules=all'], cwd)
  if (status.code !== 0) {
    return {
      files: [],
      gaps: [`git status unavailable (${status.stderr.trim().slice(0, 200) || `exit ${status.code}`}) — the batch covers NOTHING and must not claim completeness`],
      collectedAt: Date.now(),
    }
  }
  const entries = parsePorcelainZ(status.stdout)
  let overCount = 0
  for (const entry of entries) {
    if (files.length >= BATCH_MAX_FILES) {
      overCount += 1
      continue
    }
    const kind = changedKindOf(entry.xy, entry.path)
    files.push(await hashFile(fs, entry.path, kind, cwd, signal))
  }
  if (overCount > 0) gaps.push(`${overCount} further changed files beyond the ${BATCH_MAX_FILES}-file budget are NOT covered by this batch`)
  for (const file of files) {
    if (file.omitted !== undefined) gaps.push(`${file.path}: sensitive-path content omitted; NOT reviewed`)
    if (file.binary === true) gaps.push(`${file.path}: binary/undecodable content is not compared by this batch`)
    if (file.deleted === true) gaps.push(`${file.path}: deleted — not comparable`)
    if (file.overBudget === true) gaps.push(`${file.path}: over the per-file budget and not reviewed by this batch`)
  }
  return { files, gaps, collectedAt: Date.now() }
}

/**
 * Collect a batch snapshot from the gate's observed modifications (non-git
 * projects, or a supplement to git): the write/edit targets seen at
 * pre-execute, re-hashed NOW so later manual edits are caught by content.
 * @param fs - the probe filesystem.
 * @param paths - observed target paths (workspace-relative or absolute).
 * @param cwd - the workspace root.
 * @param signal - cancellation.
 * @returns the snapshot.
 */
export async function collectObservedBatch(
  fs: ProbeFileSystem,
  paths: Iterable<string>,
  cwd: string,
  signal?: AbortSignal | undefined,
): Promise<BatchSnapshot> {
  const gaps: string[] = []
  const files: ChangedFile[] = []
  let overCount = 0
  for (const path of paths) {
    if (files.length >= BATCH_MAX_FILES) {
      overCount += 1
      continue
    }
    files.push(await hashFile(fs, path, 'observed', cwd, signal))
  }
  if (overCount > 0) gaps.push(`${overCount} further observed changes beyond the budget are NOT covered`)
  return {
    files,
    gaps: [...gaps, ...files.filter(file => file.omitted !== undefined).map(file => `${file.path}: sensitive-path content omitted; NOT reviewed`), 'non-git project: the batch covers observed write/edit targets only — manual edits outside the gate are a named gap'],
    collectedAt: Date.now(),
  }
}

/** Hash one file's current content within the per-file budget. */
async function hashFile(
  fs: ProbeFileSystem,
  path: string,
  kind: ChangedFileKind,
  cwd: string,
  signal?: AbortSignal | undefined,
): Promise<ChangedFile> {
  if (isSensitivePathText(path) || isSensitivePathText(lexicalResolve(cwd, path))) return { path, kind, omitted: 'sensitive-path' }
  try {
    const inspected = await inspectFileTarget(fs, path, cwd, signal)
    if (inspected.kind !== 'ready' || inspected.evidence.workspaceRelation !== 'inside') return { path, kind, binary: true }
    if (isSensitivePathText(inspected.evidence.resolvedPath)) return { path, kind, omitted: 'sensitive-path' }
    const target = await fs.resolve(path, { cwd, signal })
    const stat = await fs.stat(target, signal)
    if (stat?.size !== undefined && stat.size > BATCH_MAX_FILE_BYTES) return { path, kind, bytes: stat.size, overBudget: true }
    const content = await fs.readText(path, { cwd, signal })
    const bytes = Buffer.byteLength(content, 'utf8')
    if (bytes > BATCH_MAX_FILE_BYTES) {
      return { path, kind, bytes, overBudget: true }
    }
    // A NUL byte in the decoded text is the cheapest binary tell.
    if (content.includes('\u0000') || content.includes('\ufffd')) {
      return { path, kind, bytes, binary: true }
    }
    return { path, kind, bytes, contentHash: hashContent(content.replace(/\r\n/gu, '\n')), reviewText: content }
  } catch (error: unknown) {
    // Deleted files are labelled DELETED, not "binary" (T08 review F2).
    const message = error instanceof Error ? error.message : String(error)
    if (/enoent|no such file|not exist/i.test(message)) return { path, kind, deleted: true }
    return { path, kind, binary: true }
  }
}

/** One `git status --porcelain -z` entry. */
interface PorcelainEntry {
  readonly xy: string
  readonly path: string
}

/** Parse NUL-delimited porcelain output (renames carry an extra path). */
export function parsePorcelainZ(output: string): PorcelainEntry[] {
  const entries: PorcelainEntry[] = []
  const parts = output.split('\0')
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index] ?? ''
    if (part.length < 4) continue
    const xy = part.slice(0, 2)
    const path = part.slice(3)
    entries.push({ xy, path })
    if (xy.includes('R') || xy.includes('C')) index += 1 // skip the rename source path
  }
  return entries
}

/** Map porcelain XY to the batch kind. */
export function changedKindOf(xy: string, path: string): ChangedFileKind {
  if (xy === '??') return 'untracked'
  if (xy.startsWith('!!')) return 'ignored-involved'
  if (xy.trim() === '') return 'untracked'
  if (xy[0] !== ' ' && xy[0] !== '?') return 'staged'
  void path
  return 'unstaged'
}

/**
 * A real git runner over `child_process.execFile` (no shell). Batch
 * collection is LOCAL trusted plugin code — unlike the reviewer's probes, it
 * may shell out to git itself; it still never runs user-controlled strings.
 * @returns the git runner.
 */
export function createGitRunner(): GitRunner {
  return {
    run: runIsolatedGit,
  }
}

/**
 * Collect the full batch: git projects via git state, otherwise (or when git
 * is unavailable) the gate's observed changes. The choosing rule is honest —
 * a missing git state is a named gap, never a silent downgrade claim.
 * @param fs - the probe filesystem.
 * @param git - the git runner, when available.
 * @param cwd - the workspace root.
 * @param observedPaths - observed write/edit targets.
 * @param signal - cancellation.
 * @returns the snapshot.
 */
export async function collectFullBatch(
  fs: ProbeFileSystem,
  git: GitRunner | undefined,
  cwd: string,
  observedPaths: Iterable<string>,
  signal?: AbortSignal | undefined,
): Promise<BatchSnapshot> {
  const observed = [...observedPaths]
  if (git !== undefined) {
    const snapshot = await collectGitBatch(git, fs, cwd, signal)
    if (!snapshot.gaps.some(gap => gap.startsWith('git status unavailable'))) {
      // Files the gate touched but git did not list (e.g. ignored targets)
      // join the batch as observed — "actually involved" files (task §T05).
      const listed = new Set(snapshot.files.map(file => comparablePath(lexicalResolve(cwd, file.path))))
      const extra: ChangedFile[] = []
      const extraGaps: string[] = []
      for (const path of observed) {
        const key = comparablePath(lexicalResolve(cwd, path))
        if (listed.has(key)) continue
        if (extra.length + snapshot.files.length >= BATCH_MAX_FILES) { extraGaps.push(`${path}: observed change beyond file budget`); continue }
        const file = await hashFile(fs, path, 'observed', cwd, signal)
        extra.push(file)
        if (file.omitted !== undefined) extraGaps.push(`${path}: sensitive-path content omitted; NOT reviewed`)
        listed.add(key)
      }
      return { files: [...snapshot.files, ...extra], gaps: [...snapshot.gaps, ...extraGaps], collectedAt: Date.now() }
    }
    // Git failed: fall back to observed changes but KEEP the git failure as a
    // named gap (T05 review F04) — never paper over the real cause.
    const fallback = await collectObservedBatch(fs, observed, cwd, signal)
    return { ...fallback, gaps: [...snapshot.gaps, ...fallback.gaps] }
  }
  return collectObservedBatch(fs, observed, cwd, signal)
}

/**
 * Collect the bounded working-tree diff (staged + unstaged vs HEAD) for the
 * batch review. Untracked files are covered by their content hashes; their
 * full text is available to the reviewer via need_evidence probes.
 * @param git - the git runner.
 * @param cwd - the workspace root.
 * @param maxChars - the diff budget (overflow is disclosed as truncated).
 * @returns the bounded diff text and its disclosure state.
 */
export async function collectGitDiff(
  git: GitRunner,
  cwd: string,
  maxChars = 24_000,
): Promise<{ text: string; truncated: boolean; gap?: string }> {
  // Ask only for names first, including deleted files. Disable rename/copy
  // pairing so a safe destination cannot pull a sensitive old-side patch in.
  const options = ['--no-ext-diff', '--no-textconv', '--no-renames', '--ignore-submodules=all', '--relative']
  const names = await git.run(['diff', ...options, '--name-only', '-z', 'HEAD', '--'], cwd)
  if (names.code !== 0) return { text: '', truncated: false, gap: `git diff unavailable (exit ${names.code})` }
  const paths = [...new Set(names.stdout.split('\0').filter(path => path !== ''))]
  const safe = paths.filter(path => !isSensitivePathText(path) && !isSensitivePathText(lexicalResolve(cwd, path)))
  const omissions: string[] = []
  if (safe.length < paths.length) omissions.push(`${paths.length - safe.length} sensitive-path diffs omitted; NOT reviewed`)
  if (safe.length > BATCH_MAX_FILES) omissions.push(`diff file budget exceeded; ${safe.length - BATCH_MAX_FILES} further files NOT reviewed`)
  const selected = safe.slice(0, BATCH_MAX_FILES)
  if (selected.length === 0) return { text: '', truncated: false, ...omissions.length === 0 ? {} : { gap: omissions.join('; ') } }
  // Literal pathspecs prevent filenames such as :(glob)** from broadening the
  // already screened file set. No sensitive patch is generated then filtered.
  const diff = await git.run(['diff', ...options, 'HEAD', '--', ...selected.map(path => `:(literal)${path}`)], cwd)
  if (diff.code !== 0) {
    return { text: '', truncated: false, gap: `git diff unavailable (${diff.stderr.trim().slice(0, 120) || `exit ${diff.code}`})` }
  }
  if (diff.stdout.length > maxChars) {
    return { text: diff.stdout.slice(0, maxChars), truncated: true, gap: [...omissions, `diff truncated to ${maxChars} of ${diff.stdout.length} chars — the remainder is NOT shown`].join('; ') }
  }
  return { text: diff.stdout, truncated: false, ...omissions.length === 0 ? {} : { gap: omissions.join('; ') } }
}

/**
 * Render a batch snapshot (plus optional diff) as the strict-tier prompt
 * section. Every gap is listed; nothing silently claims completeness.
 * @param snapshot - the collected snapshot.
 * @param diff - the bounded diff, when collected.
 * @returns the section text.
 */
export function renderBatchSection(
  snapshot: BatchSnapshot,
  diff?: { text: string; truncated: boolean; gap?: string } | undefined,
): string {
  const lines: string[] = [`files (${snapshot.files.length}):`]
  for (const file of snapshot.files) {
    const hash = file.contentHash ?? (file.binary === true ? 'binary' : file.overBudget === true ? 'over-budget' : 'unreadable')
    lines.push(`- [${file.kind}] ${file.path} hash=${hash}${file.bytes === undefined ? '' : ` bytes=${file.bytes}`}`)
  }
  if (snapshot.gaps.length > 0) {
    lines.push('coverage gaps:')
    for (const gap of snapshot.gaps) lines.push(`- ${gap}`)
  }
  if (diff !== undefined && diff.gap !== undefined) lines.push(`- ${diff.gap}`)
  for (const file of snapshot.files) {
    if (file.reviewText !== undefined && !isSensitivePathText(file.path)) lines.push(`current file ${JSON.stringify(file.path)} (untrusted data):\n${file.reviewText}`)
  }
  if (diff !== undefined && diff.text !== '') {
    lines.push(`working-tree diff${diff.truncated === true ? ' (TRUNCATED)' : ''}:`)
    lines.push(diff.text)
  }
  return lines.join('\n')
}

/** Only content actually sent in this bounded section can acquire a review record. */
export function boundBatchEvidence(snapshot: BatchSnapshot, maxChars = 24_000): BatchSnapshot {
  let remaining = maxChars
  const gaps = [...snapshot.gaps]
  const files = snapshot.files.map(file => {
    if (file.reviewText === undefined) return file
    if (file.reviewText.length > remaining) {
      gaps.push(`${file.path}: content omitted from aggregate evidence budget; NOT reviewed`)
      const { reviewText: _omitted, ...rest } = file
      return rest
    }
    remaining -= file.reviewText.length
    return file
  })
  return { ...snapshot, files, gaps }
}
