/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T03).
 *
 * The real-filesystem probe surface (`createNodeProbeFs`) against a temp
 * directory: resolve/containment, stat/lstat, readText/listDir, bounded
 * search, and one end-to-end `runProbe` showing redaction-before-egress on a
 * REAL filesystem.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { promises as fsp } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createNodeProbeFs, runProbe, type ProbeFileSystem } from '../src/index.ts'

let root = ''
let fs: ProbeFileSystem

beforeAll(async () => {
  root = await fsp.mkdtemp(path.join(os.tmpdir(), 'second-look-nodefs-'))
  await fsp.mkdir(path.join(root, 'src'), { recursive: true })
  await fsp.writeFile(path.join(root, 'src', 'app.ts'), 'const x = 1\nAPI_TOKEN=zzz999999999\nexport {}\n', 'utf8')
  await fsp.writeFile(path.join(root, 'notes.md'), 'hello\n', 'utf8')
  fs = createNodeProbeFs(root)
})

afterAll(async () => {
  await fsp.rm(root, { recursive: true, force: true })
})

describe('node probe filesystem', () => {
  it('resolves paths against the workspace and reports containment', async () => {
    const resolved = await fs.resolve('src/app.ts', { cwd: root })
    expect(path.basename(resolved)).toBe('app.ts')
    const parent = await fs.resolve(root, {})
    expect(fs.contains(parent, resolved)).toBe(true)
    expect(fs.contains(resolved, parent)).toBe(false)
  })

  it('stats and lstats real files', async () => {
    const target = await fs.resolve('notes.md', { cwd: root })
    expect(await fs.stat(target)).toMatchObject({ type: 'file' })
    expect(await fs.lstat('src', { cwd: root })).toMatchObject({ type: 'directory' })
    expect(await fs.lstat('missing.txt', { cwd: root })).toBeUndefined()
  })

  it('reads and searches with bounded literal matching', async () => {
    expect(await fs.readText('notes.md', { cwd: root })).toBe('hello\n')
    const matches = await fs.search('API_TOKEN', '.', { cwd: root })
    expect(matches.length).toBe(1)
    expect(matches[0]).toMatchObject({ line: 2 })
  })

  it('runs an end-to-end probe: redaction before egress on a real file', async () => {
    const result = await runProbe(fs, { kind: 'read', path: 'src/app.ts' }, { workspaceRoot: root })
    expect(result.ok).toBe(true)
    expect(result.text).toContain('const x = 1')
    expect(result.text).not.toContain('zzz999999999')
    expect(result.disclosures.some(d => d.kind === 'redacted')).toBe(true)
  })

  it('refuses out-of-workspace probes on the real filesystem', async () => {
    const outside = path.join(os.tmpdir(), 'second-look-outside.txt')
    await fsp.writeFile(outside, 'outside', 'utf8')
    try {
      const result = await runProbe(fs, { kind: 'read', path: outside }, { workspaceRoot: root })
      expect(result.ok).toBe(false)
      expect(result.text).toBe('')
    } finally {
      await fsp.rm(outside, { force: true })
    }
  })
})
