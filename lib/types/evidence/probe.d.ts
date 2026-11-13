/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T02).
 *
 * The restricted evidence probe backing `need_evidence` rounds: only
 * stat/read/search/diff, only through the filesystem surface (never a shell,
 * never the network), bounded output, and REDACTION BEFORE EGRESS — probe
 * results are what a model may see, so secrets are masked first and the
 * masking is disclosed (the reviewer is never misled about reduced evidence).
 */
import type { EvidenceDisclosure } from '../action/types.js';
import { type TargetFileSystem } from './path-inspect.js';
export type ProbeKind = 'stat' | 'read' | 'search' | 'diff';
export interface ProbeRequest {
    readonly kind: ProbeKind;
    readonly path: string;
    /** For `search`: the literal pattern to look for. */
    readonly pattern?: string | undefined;
    /** For `read`: inclusive 1-based line range. */
    readonly range?: {
        readonly startLine?: number;
        readonly endLine?: number;
    } | undefined;
    /** For `diff`: the comparison file. */
    readonly oldPath?: string | undefined;
}
export interface ProbeResult {
    readonly ok: boolean;
    /** Redacted, bounded text — the only form allowed to leave the process. */
    readonly text: string;
    readonly disclosures: readonly EvidenceDisclosure[];
}
export interface ProbeFileSystem extends TargetFileSystem<string> {
    readText(path: string, opts?: {
        cwd?: string | undefined;
        signal?: AbortSignal | undefined;
    }): Promise<string>;
    listDir(path: string, opts?: {
        cwd?: string | undefined;
        signal?: AbortSignal | undefined;
    }): Promise<string[]>;
    search(pattern: string, path: string, opts?: {
        cwd?: string | undefined;
        signal?: AbortSignal | undefined;
    }): Promise<readonly {
        file: string;
        line: number;
        text: string;
    }[]>;
}
export interface ProbeOptions {
    readonly workspaceRoot: string | undefined;
    readonly maxOutputChars?: number;
    readonly maxSearchMatches?: number;
    readonly signal?: AbortSignal | undefined;
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
export declare function runProbe(fs: ProbeFileSystem, request: ProbeRequest, options: ProbeOptions): Promise<ProbeResult>;
//# sourceMappingURL=probe.d.ts.map