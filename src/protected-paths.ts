import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Both src/*.ts and the bundled lib/index.js live one level below the package root.
const pluginRoot = fileURLToPath(new URL('../', import.meta.url))

/** Git metadata can change hooks, external filters, remotes and index/worktree routing. */
export function isGitControlPath(target: string, cwd?: string): boolean {
  const resolved = path.resolve(cwd ?? process.cwd(), target).replaceAll('\\', '/')
  // Include the .git FILE used by linked worktrees/submodules, and every
  // metadata entry below a .git directory (config, hooks, index, commondir…).
  // Attributes and submodule config outside .git also affect Git execution
  // and external destinations. Ordinary reads still use their normal policy.
  return /(?:^|\/)\.git(?:\/|$)/iu.test(resolved)
    || /(?:^|\/)(?:\.gitattributes|\.gitmodules|\.gitconfig)$/iu.test(resolved)
    || /(?:^|\/)\.config\/git\/(?:config|attributes)$/iu.test(resolved)
}

/** Gate source/runtime/config changes must never qualify as ordinary file edits. */
export function isGateControlPath(target: string, cwd?: string): boolean {
  const resolved = path.resolve(cwd ?? process.cwd(), target)
  const relative = path.relative(pluginRoot, resolved).replaceAll('\\', '/').toLowerCase()
  if (relative === 'package.json' || relative === 'cordis.patch.yml'
    || relative.startsWith('src/') || relative.startsWith('lib/')) return true
  // Host policy/config and this plugin's saved review routes affect subsequent protection.
  return /(?:^|[/\\])\.dsh[/\\].*(?:cordis(?:\.patch)?\.ya?ml|settings\.json|\.credentials\.ya?ml)$/iu.test(resolved)
}
