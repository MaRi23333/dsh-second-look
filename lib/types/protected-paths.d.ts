/** Git metadata can change hooks, external filters, remotes and index/worktree routing. */
export declare function isGitControlPath(target: string, cwd?: string): boolean;
/** Gate source/runtime/config changes must never qualify as ordinary file edits. */
export declare function isGateControlPath(target: string, cwd?: string): boolean;
//# sourceMappingURL=protected-paths.d.ts.map