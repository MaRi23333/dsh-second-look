/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T03).
 *
 * A real-filesystem {@link ProbeFileSystem} over `node:fs/promises`: the
 * execution side of the reviewer's restricted `need_evidence` probes. It has
 * no shell and no network surface by construction — the only operations are
 * resolve/stat/lstat/readText/listDir/search — and it delegates every scope,
 * symlink and redaction decision to the shared probe/inspect code.
 */
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import type { ProbeFileSystem } from './probe.ts'
import { pathContains } from './path-inspect.ts'
import { isSensitivePathText } from './sensitive.ts'

/** Internal walk bounds so one `search` probe cannot enumerate a huge tree. */
const MAX_SEARCH_FILES = 2000
const MAX_SEARCH_MATCHES_COLLECTED = 500
const SEARCH_SKIP_DIRS = new Set(['node_modules', '.git', '.hg', '.svn', 'dist', 'lib', 'coverage'])

function statTypeOf(stats: { isFile(): boolean; isDirectory(): boolean }): string {
  if (stats.isFile()) return 'file'
  if (stats.isDirectory()) return 'directory'
  return 'other'
}

/**
 * Build the node-backed probe filesystem.
 * @param baseCwd - fallback cwd when a probe call passes none.
 * @returns the structural filesystem surface for `runProbe`.
 */
export function createNodeProbeFs(baseCwd?: string): ProbeFileSystem {
  const fallbackCwd = baseCwd ?? process.cwd()
  const resolveTarget = (target: string, opts?: { cwd?: string | undefined }): string =>
    path.resolve(opts?.cwd ?? fallbackCwd, target)
  return {
    async resolve(target, opts) {
      return resolveTarget(target, opts)
    },
    processPath(target) {
      return target
    },
    contains(parent, child) {
      return pathContains(parent, child, process.platform === 'win32' ? 'windows' : 'posix')
    },
    async stat(target, signal) {
      try {
        const stats = await fsp.stat(target)
        if (signal?.aborted === true) return undefined
        return { type: statTypeOf(stats), size: stats.size }
      } catch {
        return undefined
      }
    },
    async lstat(target, opts, signal) {
      try {
        const stats = await fsp.lstat(resolveTarget(target, opts))
        if (signal?.aborted === true) return undefined
        if (stats.isSymbolicLink()) return { type: 'symlink' }
        return { type: statTypeOf(stats) }
      } catch {
        return undefined
      }
    },
    async readText(target, opts) {
      opts?.signal?.throwIfAborted()
      const handle = await fsp.open(resolveTarget(target, opts), 'r')
      try {
        const limit = 256 * 1024
        const stat = await handle.stat()
        if (!stat.isFile() || stat.size > limit) throw new Error('file is not regular text or exceeds the 256 KiB evidence budget')
        const buffer = Buffer.alloc(limit + 1)
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
        opts?.signal?.throwIfAborted()
        if (bytesRead > limit) throw new Error('file grew beyond evidence budget')
        return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, bytesRead))
      } finally { await handle.close() }
    },
    async listDir(target, opts) {
      return fsp.readdir(resolveTarget(target, opts))
    },
    async search(pattern, target, opts) {
      const root = resolveTarget(target, opts)
      const matches: { file: string; line: number; text: string }[] = []
      let visited = 0
      const walk = async (entry: string): Promise<void> => {
        opts?.signal?.throwIfAborted()
        // A directory probe must apply the same credential-store boundary to
        // every visited file BEFORE reading it, not only to the search root.
        if (isSensitivePathText(entry)) return
        if (visited >= MAX_SEARCH_FILES) return
        if (matches.length >= MAX_SEARCH_MATCHES_COLLECTED) return
        visited += 1
        let stats
        try {
          stats = await fsp.lstat(entry)
        } catch {
          return
        }
        if (stats.isSymbolicLink()) return
        if (stats.isDirectory()) {
          const base = path.basename(entry)
          if (SEARCH_SKIP_DIRS.has(base)) return
          let names: string[]
          try {
            names = await fsp.readdir(entry)
          } catch {
            return
          }
          for (const name of names) {
            if (matches.length >= MAX_SEARCH_MATCHES_COLLECTED) return
            await walk(path.join(entry, name))
          }
          return
        }
        if (!stats.isFile() || stats.size > 256 * 1024) return
        let content: string
        try {
          content = await fsp.readFile(entry, { encoding: 'utf8', signal: opts?.signal })
        } catch {
          return
        }
        const lines = content.replace(/\r\n/gu, '\n').split('\n') // CRLF-normalized (T03 review S01)
        for (let index = 0; index < lines.length; index += 1) {
          const line = lines[index] ?? ''
          if (line.includes(pattern)) {
            matches.push({ file: entry, line: index + 1, text: line })
            if (matches.length >= MAX_SEARCH_MATCHES_COLLECTED) return
          }
        }
      }
      await walk(root)
      return matches
    },
  }
}
