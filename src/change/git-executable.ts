import { constants, promises as fs } from 'node:fs'
import path from 'node:path'

function contains(root: string, file: string): boolean {
  const relative = path.relative(root, file)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

async function repositoryRoot(directory: string): Promise<string> {
  let current = directory
  while (true) {
    // A .git file also marks linked worktrees/submodules. Do not read config
    // or execute Git to discover this boundary before selecting an executable.
    if (await fs.lstat(path.join(current, '.git')).then(() => true, () => false)) return current
    const parent = path.dirname(current)
    if (parent === current) return directory
    current = parent
  }
}

/**
 * Trust the host's inherited absolute PATH directories outside the reviewed
 * workspace, not the workspace's programs. This is not a signature/ownership
 * check: changing the host installation or PATH remains a host trust boundary.
 * Resolve symlinks before choosing, and return the actual absolute executable
 * so Windows never performs its implicit current-directory command search.
 */
export async function resolveGitExecutable(cwd: string, env: NodeJS.ProcessEnv): Promise<string | undefined> {
  const workspace = path.resolve(cwd)
  let realWorkspace: string
  try { realWorkspace = await fs.realpath(workspace) } catch { return undefined }
  const roots = [workspace, realWorkspace, await repositoryRoot(workspace), await repositoryRoot(realWorkspace)]
  const pathValue = Object.entries(env).find(([key]) => key.toUpperCase() === 'PATH')?.[1] ?? ''
  for (const entry of pathValue.split(path.delimiter)) {
    const directory = entry.startsWith('"') && entry.endsWith('"') ? entry.slice(1, -1) : entry
    // Also reject Windows root-relative paths (\\tools) and drive-relative paths.
    if (!directory || !path.isAbsolute(directory) || path.resolve(directory) !== path.normalize(directory)) continue
    const candidate = path.join(directory, process.platform === 'win32' ? 'git.exe' : 'git')
    if (roots.some(root => contains(root, candidate))) continue
    try {
      const executable = await fs.realpath(candidate)
      if (roots.some(root => contains(root, executable))) continue
      if (!(await fs.stat(executable)).isFile()) continue
      await fs.access(executable, process.platform === 'win32' ? constants.F_OK : constants.X_OK)
      return executable
    } catch { /* Missing/unusable PATH entries do not authorize a cwd fallback. */ }
  }
  return undefined
}
