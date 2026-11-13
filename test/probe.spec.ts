/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T02).
 *
 * Restricted probe behaviour: stat/read/search/diff only, scope-refused,
 * bounded, and REDACTED BEFORE EGRESS (the T02 acceptance: sensitive fields
 * never reach the model or the logs through a probe).
 */
import { describe, expect, it } from 'vitest'
import { runProbe, lexicalResolve, comparablePath, type ProbeFileSystem } from '../src/index.ts'

function probeFs(files: Record<string, string>): ProbeFileSystem {
  const tree: Record<string, { type?: string; size?: number }> = { '/work': { type: 'directory' } }
  for (const [path, content] of Object.entries(files)) tree[comparablePath(path)] = { type: 'file', size: content.length }
  return {
    async resolve(path: string, opts?: { cwd?: string }): Promise<string> {
      return lexicalResolve(opts?.cwd ?? '/', path)
    },
    processPath: (target: string) => target,
    contains: (parent: string, child: string) => comparablePath(child).startsWith(comparablePath(parent)),
    async stat(target: string) {
      return tree[comparablePath(target)]
    },
    async lstat(path: string, opts?: { cwd?: string }) {
      return tree[comparablePath(lexicalResolve(opts?.cwd ?? '/', path))]
    },
    async readText(path: string, opts?: { cwd?: string }): Promise<string> {
      return files[lexicalResolve(opts?.cwd ?? '/', path)] ?? ''
    },
    async listDir(): Promise<string[]> {
      return Object.keys(files)
    },
    async search(pattern: string): Promise<readonly { file: string; line: number; text: string }[]> {
      const out: { file: string; line: number; text: string }[] = []
      for (const [file, content] of Object.entries(files)) {
        content.split('\n').forEach((line, index) => {
          if (line.includes(pattern)) out.push({ file, line: index + 1, text: line })
        })
      }
      return out
    },
  }
}

const OPTIONS = { workspaceRoot: '/work' }

describe('restricted evidence probe', () => {
  it('masks inline secrets before the text leaves the probe (redacted disclosure)', async () => {
    // A plain (non credential-store) file that embeds a secret value: the
    // probe masks it before egress. Credential-store NAMES are refused above.
    const fs = probeFs({ '/work/config.txt': 'API_KEY=sk-abcdef123456\nMODE=dev' })
    const result = await runProbe(fs, { kind: 'read', path: 'config.txt' }, OPTIONS)
    expect(result.ok).toBe(true)
    expect(result.text).not.toContain('sk-abcdef123456')
    expect(result.disclosures.some(d => d.kind === 'redacted')).toBe(true)
  })

  it('refuses credential-store paths without probing them', async () => {
    const fs = probeFs({ '/work/.env': 'SECRET=1' })
    const result = await runProbe(fs, { kind: 'read', path: '.env' }, OPTIONS)
    expect(result.ok).toBe(false)
    expect(result.text).toBe('')
    expect(result.disclosures[0]?.kind).toBe('omitted')
  })

  it('refuses targets outside the established workspace', async () => {
    const fs = probeFs({ '/elsewhere/x.txt': 'data' })
    const result = await runProbe(fs, { kind: 'read', path: '/elsewhere/x.txt' }, OPTIONS)
    expect(result.ok).toBe(false)
    expect(result.disclosures[0]?.kind).toBe('unknown-scope')
  })

  it('bounds output with an explicit truncation disclosure', async () => {
    const fs = probeFs({ '/work/big.txt': 'x'.repeat(500) })
    const result = await runProbe(fs, { kind: 'read', path: 'big.txt' }, { workspaceRoot: '/work', maxOutputChars: 100 })
    expect(result.text.length).toBe(100)
    expect(result.disclosures.some(d => d.kind === 'truncated')).toBe(true)
  })

  it('supports stat, bounded search and a redacted line diff', async () => {
    const fs = probeFs({ '/work/a.txt': 'alpha\nAPI_TOKEN=zzz999999\nomega', '/work/b.txt': 'alpha\nomega' })
    const stat = await runProbe(fs, { kind: 'stat', path: 'a.txt' }, OPTIONS)
    expect(stat.ok).toBe(true)
    expect(stat.text).toContain('a.txt')

    const search = await runProbe(fs, { kind: 'search', path: '.', pattern: 'API_TOKEN' }, OPTIONS)
    expect(search.ok).toBe(true)
    expect(search.text).not.toContain('zzz999999')

    const diff = await runProbe(fs, { kind: 'diff', path: 'a.txt', oldPath: 'b.txt' }, OPTIONS)
    expect(diff.ok).toBe(true)
    expect(diff.text).toContain('+ ')
    expect(diff.text).not.toContain('zzz999999')
    expect(diff.disclosures.some(d => d.kind === 'redacted')).toBe(true)
  })

  it('turns a filesystem throw into a refused result, never an unhandled rejection (F03)', async () => {
    const base = probeFs({ '/work/a.txt': 'x' })
    const throwing = {
      ...base,
      async readText(): Promise<string> {
        throw new Error('EISDIR: illegal operation on a directory')
      },
    }
    const result = await runProbe(throwing, { kind: 'read', path: 'a.txt' }, OPTIONS)
    expect(result.ok).toBe(false)
    expect(result.text).toBe('')
    expect(result.disclosures[0]?.detail).toContain('probe failed')
  })
})
