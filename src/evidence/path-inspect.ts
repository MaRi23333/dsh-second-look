/**
 * Modified for dsh-second-look, 2026-10-31 (T02).
 *
 * File-target inspection, ported from the local fork
 * `dsh-heavy-approval/src/file-target-inspector.ts` (workspace-local source,
 * reused with attribution; see THIRD-PARTY-SOURCES.md), with the fork-review
 * blind spot fixed: the fork's `lstat` checked only the FINAL path component,
 * so a symlink/junction in a MIDDLE component could escape the symlink probe.
 * This port walks every component (bounded) and treats an aliased or
 * symlinked parent as review-worthy evidence.
 *
 * Everything here works against a structural filesystem interface so it is
 * unit-testable without the host, and never runs a shell.
 */
import type { ActionTarget, TargetState } from '../action/types.ts'

/** The filesystem surface the inspector needs (a subset of the host `fs`). */
export interface TargetFileSystem<TTarget = unknown> {
  resolve(path: string, opts?: { cwd?: string | undefined; signal?: AbortSignal | undefined }): Promise<TTarget>
  processPath(target: TTarget): string
  contains(parent: TTarget, child: TTarget): boolean
  stat(target: TTarget, signal?: AbortSignal | undefined): Promise<{ type?: string; size?: number } | undefined>
  lstat(path: string, opts?: { cwd?: string | undefined } | undefined, signal?: AbortSignal | undefined): Promise<{ type?: string } | undefined>
}

export interface FileTargetEvidence extends TargetState {
  readonly resolvedPath: string
  readonly workspaceRelation: 'inside' | 'outside'
  readonly pathEntryType: 'missing' | 'file' | 'directory' | 'symlink' | 'other'
  readonly targetType: 'missing' | 'file' | 'directory' | 'other'
  readonly systemLocation: boolean
  /** Middle-component link/junction walk result (the fork-review fix). */
  readonly linkedAncestor: boolean
}

export type FileTargetProbe =
  | { readonly kind: 'ready'; readonly evidence: FileTargetEvidence }
  | { readonly kind: 'review'; readonly reasonCode: FileTargetReviewReason }

export type FileTargetReviewReason =
  | 'file-target-unavailable'
  | 'file-target-symlink'
  | 'file-target-aliased'
  | 'file-target-linked-ancestor'
  | 'file-target-invalid'
  | 'file-target-system'

/** Max path components walked for the ancestor-link probe (bounded work). */
const MAX_ANCESTOR_COMPONENTS = 64

/** System locations whose modification is a `system-change` (fork's list, hardened per T08 红队 §1d: home dotfiles match RESOLVED paths, and the PowerShell 7 profile dir is covered too). */
const PROTECTED_SYSTEM_PATH = /^(?:\/(?:bin|boot|dev|etc|lib|lib64|sbin|srv|usr|var)(?:\/|$)|\/(?:System|Library|Applications)(?:\/|$)|[A-Za-z]:\\(?:Windows|Program Files|Program Files \(x86\)|ProgramData)(?:\\|$)|.*[/\\]\.(?:bashrc|bash_profile|zshrc|zprofile|profile|bash_login)$|[A-Za-z]:\\Users\\[^\\]+\\Documents\\(?:WindowsPowerShell|PowerShell)\\|.*[/\\]\.config[/\\]powershell[/\\])/i

/** Lexically resolve `path` against `cwd` without touching the filesystem. */
export function lexicalResolve(cwd: string, path: string): string {
  const combined = /^[A-Za-z]:[\\/]|^\//.test(path) ? path : `${cwd.replace(/[\\/]+$/, '')}/${path}`
  const isAbsolute = combined.startsWith('/') || /^[A-Za-z]:[\\/]/.test(combined)
  const drive = /^[A-Za-z]:/.exec(combined)?.[0] ?? ''
  const body = combined.slice(drive.length)
  const parts: string[] = []
  for (const part of body.split(/[\\/]+/)) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (parts.length > 0 && parts[parts.length - 1] !== '..') parts.pop()
      else if (!isAbsolute) parts.push('..')
      continue
    }
    parts.push(part)
  }
  return `${drive}${isAbsolute ? '/' : ''}${parts.join('/')}`.replace(/\//g, drive ? '\\' : '/')
}

/** Windows paths ignore case; POSIX paths preserve it, even in Windows-hosted tests. */
export type PathStyle = 'windows' | 'posix'

export function pathStyleOf(path: string): PathStyle {
  return /^[A-Za-z]:[\\/]|^\\\\/.test(path) ? 'windows' : 'posix'
}

/** Normalize using the path's explicit syntax, rather than the test host's OS. */
export function comparablePath(path: string, style: PathStyle = pathStyleOf(path)): string {
  const normalized = (style === 'windows' ? path.replace(/[\\/]+/g, '/') : path.replace(/\/+/g, '/')).replace(/\/+$/, '')
  return style === 'windows' ? normalized.toLowerCase() : normalized
}

/** Component-boundary containment, including filesystem roots. */
export function pathContains(parent: string, child: string, style: PathStyle = pathStyleOf(parent)): boolean {
  const root = comparablePath(parent, style)
  const target = comparablePath(child, style)
  return target === root || target.startsWith(`${root}/`)
}

/**
 * Whether a resolved process path sits in a system-protected location.
 * @param processPath - the host-resolved path.
 * @returns true for protected system locations.
 */
export function isProtectedSystemPath(processPath: string): boolean {
  return PROTECTED_SYSTEM_PATH.test(processPath)
}

function kindOfType(type: string | undefined): 'missing' | 'file' | 'directory' | 'symlink' | 'other' {
  if (type === undefined) return 'missing'
  if (type === 'file') return 'file'
  if (type === 'directory') return 'directory'
  if (type === 'symlink') return 'symlink'
  return 'other'
}

/**
 * Walk every ancestor component's `lstat`, catching middle-path symlinks and
 * junctions the fork's final-component probe missed. Bounded by
 * {@link MAX_ANCESTOR_COMPONENTS}; an error on a component counts as
 * "could not establish" → linkedAncestor (review), never as clean.
 */
async function hasLinkedAncestor<TTarget>(
  fs: TargetFileSystem<TTarget>,
  cwd: string,
  rawPath: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const normalized = rawPath.replace(/[\\/]+$/, '')
  const parts: string[] = []
  const drive = /^[A-Za-z]:/.exec(normalized)?.[0] ?? ''
  for (const part of normalized.slice(drive.length).split(/[\\/]+/)) {
    if (part === '' || part === '.') continue
    parts.push(part)
  }
  const isAbsolute = normalized.startsWith('/') || drive !== ''
  const candidates: string[] = []
  for (let depth = 1; depth < Math.min(parts.length, MAX_ANCESTOR_COMPONENTS); depth += 1) {
    const prefix = parts.slice(0, depth).join('/')
    candidates.push(isAbsolute ? `${drive}/${prefix}` : prefix)
  }
  for (const candidate of candidates) {
    try {
      const info = await fs.lstat(candidate, { cwd }, signal)
      const kind = kindOfType(info?.type)
      if (kind === 'symlink' || kind === 'other') return true
    } catch {
      // A component we cannot inspect is not established clean.
      return true
    }
  }
  return false
}

/**
 * Inspect one file target.
 * @param fs - the structural filesystem surface.
 * @param rawPath - the path argument as written.
 * @param workspaceRoot - the session workspace root (undefined = unknown scope).
 * @param signal - cancellation.
 * @returns ready evidence or a review-worthy reason code.
 */
export async function inspectFileTarget<TTarget>(
  fs: TargetFileSystem<TTarget>,
  rawPath: string,
  workspaceRoot: string | undefined,
  signal?: AbortSignal,
): Promise<FileTargetProbe> {
  try {
    const target = await fs.resolve(rawPath, workspaceRoot === undefined ? { signal } : { cwd: workspaceRoot, signal })
    const processPath = fs.processPath(target)
    const lexical = workspaceRoot === undefined ? undefined : lexicalResolve(workspaceRoot, rawPath)
    if (lexical !== undefined && comparablePath(lexical) !== comparablePath(processPath)) {
      return { kind: 'review', reasonCode: 'file-target-aliased' }
    }
    const entry = await fs.lstat(rawPath, workspaceRoot === undefined ? undefined : { cwd: workspaceRoot }, signal)
    const pathEntryType = kindOfType(entry?.type)
    // The final component gets the same treatment as the ancestors (T02 review
    // F02): a Windows junction surfaces as `other` on some fs surfaces, so
    // `other` is a link-risk too, not a clean entry.
    if (pathEntryType === 'symlink' || pathEntryType === 'other') {
      return { kind: 'review', reasonCode: 'file-target-symlink' }
    }
    const linkedAncestor = await hasLinkedAncestor(fs, workspaceRoot ?? '', rawPath, signal)
    if (linkedAncestor) return { kind: 'review', reasonCode: 'file-target-linked-ancestor' }
    const stat = await fs.stat(target, signal)
    const targetType = stat === undefined ? 'missing' : stat.type === 'directory' ? 'directory' : stat.type === 'file' ? 'file' : 'other'
    const workspaceRelation = workspaceRoot === undefined
      ? 'outside'
      : fs.contains(await fs.resolve(workspaceRoot, { signal }), target) ? 'inside' : 'outside'
    const systemLocation = isProtectedSystemPath(processPath)
    if (systemLocation) return { kind: 'review', reasonCode: 'file-target-system' }
    return {
      kind: 'ready',
      evidence: {
        exists: targetType !== 'missing',
        kind: targetType === 'missing' ? undefined : targetType === 'other' ? 'other' : targetType,
        ...stat?.size === undefined ? {} : { sizeBytes: stat.size },
        resolvedPath: processPath,
        workspaceRelation,
        pathEntryType,
        targetType,
        systemLocation,
        linkedAncestor,
      } as FileTargetEvidence,
    }
  } catch {
    return { kind: 'review', reasonCode: 'file-target-unavailable' }
  }
}

/** Convert ready evidence into the action-layer target shape. */
export function targetFromEvidence(rawPath: string, probe: FileTargetProbe): ActionTarget {
  if (probe.kind !== 'ready') return { rawPath, scope: 'unknown' }
  return {
    rawPath,
    scope: probe.evidence.workspaceRelation === 'inside' ? 'inside' : 'outside',
    state: {
      exists: probe.evidence.exists,
      ...probe.evidence.kind === undefined ? {} : { kind: probe.evidence.kind },
      ...probe.evidence.sizeBytes === undefined ? {} : { sizeBytes: probe.evidence.sizeBytes },
    },
  }
}
