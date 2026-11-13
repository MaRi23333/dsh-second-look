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
import type { ActionTarget, TargetState } from '../action/types.js';
/** The filesystem surface the inspector needs (a subset of the host `fs`). */
export interface TargetFileSystem<TTarget = unknown> {
    resolve(path: string, opts?: {
        cwd?: string | undefined;
        signal?: AbortSignal | undefined;
    }): Promise<TTarget>;
    processPath(target: TTarget): string;
    contains(parent: TTarget, child: TTarget): boolean;
    stat(target: TTarget, signal?: AbortSignal | undefined): Promise<{
        type?: string;
        size?: number;
    } | undefined>;
    lstat(path: string, opts?: {
        cwd?: string | undefined;
    } | undefined, signal?: AbortSignal | undefined): Promise<{
        type?: string;
    } | undefined>;
}
export interface FileTargetEvidence extends TargetState {
    readonly resolvedPath: string;
    readonly workspaceRelation: 'inside' | 'outside';
    readonly pathEntryType: 'missing' | 'file' | 'directory' | 'symlink' | 'other';
    readonly targetType: 'missing' | 'file' | 'directory' | 'other';
    readonly systemLocation: boolean;
    /** Middle-component link/junction walk result (the fork-review fix). */
    readonly linkedAncestor: boolean;
}
export type FileTargetProbe = {
    readonly kind: 'ready';
    readonly evidence: FileTargetEvidence;
} | {
    readonly kind: 'review';
    readonly reasonCode: FileTargetReviewReason;
};
export type FileTargetReviewReason = 'file-target-unavailable' | 'file-target-symlink' | 'file-target-aliased' | 'file-target-linked-ancestor' | 'file-target-invalid' | 'file-target-system';
/** Lexically resolve `path` against `cwd` without touching the filesystem. */
export declare function lexicalResolve(cwd: string, path: string): string;
/** Windows paths ignore case; POSIX paths preserve it, even in Windows-hosted tests. */
export type PathStyle = 'windows' | 'posix';
export declare function pathStyleOf(path: string): PathStyle;
/** Normalize using the path's explicit syntax, rather than the test host's OS. */
export declare function comparablePath(path: string, style?: PathStyle): string;
/** Component-boundary containment, including filesystem roots. */
export declare function pathContains(parent: string, child: string, style?: PathStyle): boolean;
/**
 * Whether a resolved process path sits in a system-protected location.
 * @param processPath - the host-resolved path.
 * @returns true for protected system locations.
 */
export declare function isProtectedSystemPath(processPath: string): boolean;
/**
 * Inspect one file target.
 * @param fs - the structural filesystem surface.
 * @param rawPath - the path argument as written.
 * @param workspaceRoot - the session workspace root (undefined = unknown scope).
 * @param signal - cancellation.
 * @returns ready evidence or a review-worthy reason code.
 */
export declare function inspectFileTarget<TTarget>(fs: TargetFileSystem<TTarget>, rawPath: string, workspaceRoot: string | undefined, signal?: AbortSignal): Promise<FileTargetProbe>;
/** Convert ready evidence into the action-layer target shape. */
export declare function targetFromEvidence(rawPath: string, probe: FileTargetProbe): ActionTarget;
//# sourceMappingURL=path-inspect.d.ts.map