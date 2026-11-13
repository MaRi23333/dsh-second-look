/**
 * Trust the host's inherited absolute PATH directories outside the reviewed
 * workspace, not the workspace's programs. This is not a signature/ownership
 * check: changing the host installation or PATH remains a host trust boundary.
 * Resolve symlinks before choosing, and return the actual absolute executable
 * so Windows never performs its implicit current-directory command search.
 */
export declare function resolveGitExecutable(cwd: string, env: NodeJS.ProcessEnv): Promise<string | undefined>;
//# sourceMappingURL=git-executable.d.ts.map