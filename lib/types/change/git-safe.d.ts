interface GitResult {
    code: number;
    stdout: string;
    stderr: string;
}
/**
 * Read configuration without executing a repository command, then override
 * every configured filter driver. The config output remains local and is
 * never returned as evidence. A preflight failure makes evidence unavailable.
 * Concurrent changes after this snapshot retain the declared execution-time
 * race boundary; a new filter name must not be assumed covered by an old run.
 */
export declare function runIsolatedGit(args: readonly string[], cwd: string): Promise<GitResult>;
export {};
//# sourceMappingURL=git-safe.d.ts.map