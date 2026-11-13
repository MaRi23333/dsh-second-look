import type { ProbeFileSystem } from '../evidence/probe.js';
/** How a changed file entered the batch. */
export type ChangedFileKind = 'staged' | 'unstaged' | 'untracked' | 'ignored-involved' | 'observed';
/** One changed file in a batch snapshot. */
export interface ChangedFile {
    readonly path: string;
    readonly kind: ChangedFileKind;
    /** sha256 (32 hex) of the current content, when readable and in budget. */
    readonly contentHash?: string | undefined;
    readonly reviewText?: string | undefined;
    readonly bytes?: number | undefined;
    /** True when the content is not comparable text (binary/decode failure). */
    readonly binary?: boolean;
    /** True when the file no longer exists (deleted — not comparable). */
    readonly deleted?: true;
    /** True when the content exceeded the per-file budget and was NOT hashed. */
    readonly overBudget?: boolean;
    /** Credential-store content is not read or sent without disclosure authorization. */
    readonly omitted?: 'sensitive-path';
}
/** One collected batch snapshot. */
export interface BatchSnapshot {
    readonly files: readonly ChangedFile[];
    /** Explicit coverage gaps (git missing, binary files, over-budget…). */
    readonly gaps: readonly string[];
    readonly collectedAt: number;
}
/** The structural git surface (injectable for tests). */
export interface GitRunner {
    run(args: readonly string[], cwd: string): Promise<{
        code: number;
        stdout: string;
        stderr: string;
    }>;
}
/** Batch bounds: bounded work, disclosed as gaps when exceeded. */
export declare const BATCH_MAX_FILES = 200;
export declare const BATCH_MAX_FILE_BYTES: number;
/** Hash file content for batch identity (local-only digest). */
export declare function hashContent(text: string): string;
/**
 * Collect a batch snapshot from a git project: staged, unstaged, untracked
 * and ignored-but-involved files. Git failures become named gaps.
 * @param git - the git runner.
 * @param fs - the probe filesystem (content hashing).
 * @param cwd - the workspace root.
 * @param signal - cancellation.
 * @returns the snapshot (possibly with gaps).
 */
export declare function collectGitBatch(git: GitRunner, fs: ProbeFileSystem, cwd: string, signal?: AbortSignal | undefined): Promise<BatchSnapshot>;
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
export declare function collectObservedBatch(fs: ProbeFileSystem, paths: Iterable<string>, cwd: string, signal?: AbortSignal | undefined): Promise<BatchSnapshot>;
/** One `git status --porcelain -z` entry. */
interface PorcelainEntry {
    readonly xy: string;
    readonly path: string;
}
/** Parse NUL-delimited porcelain output (renames carry an extra path). */
export declare function parsePorcelainZ(output: string): PorcelainEntry[];
/** Map porcelain XY to the batch kind. */
export declare function changedKindOf(xy: string, path: string): ChangedFileKind;
/**
 * A real git runner over `child_process.execFile` (no shell). Batch
 * collection is LOCAL trusted plugin code — unlike the reviewer's probes, it
 * may shell out to git itself; it still never runs user-controlled strings.
 * @returns the git runner.
 */
export declare function createGitRunner(): GitRunner;
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
export declare function collectFullBatch(fs: ProbeFileSystem, git: GitRunner | undefined, cwd: string, observedPaths: Iterable<string>, signal?: AbortSignal | undefined): Promise<BatchSnapshot>;
/**
 * Collect the bounded working-tree diff (staged + unstaged vs HEAD) for the
 * batch review. Untracked files are covered by their content hashes; their
 * full text is available to the reviewer via need_evidence probes.
 * @param git - the git runner.
 * @param cwd - the workspace root.
 * @param maxChars - the diff budget (overflow is disclosed as truncated).
 * @returns the bounded diff text and its disclosure state.
 */
export declare function collectGitDiff(git: GitRunner, cwd: string, maxChars?: number): Promise<{
    text: string;
    truncated: boolean;
    gap?: string;
}>;
/**
 * Render a batch snapshot (plus optional diff) as the strict-tier prompt
 * section. Every gap is listed; nothing silently claims completeness.
 * @param snapshot - the collected snapshot.
 * @param diff - the bounded diff, when collected.
 * @returns the section text.
 */
export declare function renderBatchSection(snapshot: BatchSnapshot, diff?: {
    text: string;
    truncated: boolean;
    gap?: string;
} | undefined): string;
/** Only content actually sent in this bounded section can acquire a review record. */
export declare function boundBatchEvidence(snapshot: BatchSnapshot, maxChars?: number): BatchSnapshot;
export {};
//# sourceMappingURL=collect.d.ts.map