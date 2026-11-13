import { afterEach, describe, expect, it, vi } from 'vitest'
import { execFile } from 'node:child_process'
import { promises as fsp } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { collectFullBatch, collectGitDiff, collectObservedBatch, createGitRunner, renderBatchSection } from '../src/change/collect.ts'
import { createNodeProbeFs } from '../src/evidence/node-fs.ts'
import { comparablePath, pathContains } from '../src/evidence/path-inspect.ts'
import { runProbe } from '../src/evidence/probe.ts'

const execute = promisify(execFile)
const roots: string[] = []
const token = 'npm_FAKE_PLATFORM_EVIDENCE_SENTINEL_0123456789'

async function temp(): Promise<string> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'second-look-platform-'))
  roots.push(root)
  return root
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execute('git', args, { cwd, timeout: 10_000, env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1' } })
  return stdout
}

async function repo(): Promise<string> {
  const root = await temp()
  await git(root, 'init', '--quiet')
  await git(root, 'config', 'user.email', 'test@example.invalid')
  await git(root, 'config', 'user.name', 'Evidence Test')
  return root
}

async function exists(file: string): Promise<boolean> {
  return fsp.stat(file).then(() => true, () => false)
}

async function markerCommand(root: string, name: string): Promise<{ command: string; marker: string }> {
  const marker = path.join(root, `${name}.marker`)
  const script = path.join(root, `${name}.cjs`)
  await fsp.writeFile(script, `require('node:fs').writeFileSync(process.argv[2], 'ran'); ${name === 'filter' ? 'process.stdin.pipe(process.stdout)' : ''}\n`)
  const quote = (text: string): string => `'${text.replaceAll('\\', '/').replaceAll("'", "'\\''")}'`
  return { command: `${quote(process.execPath)} ${quote(script)} ${quote(marker)}`, marker }
}

afterEach(async () => {
  vi.unstubAllEnvs()
  for (const root of roots.splice(0)) await fsp.rm(root, { recursive: true, force: true })
})

describe('SL-002 internal Git execution isolation', () => {
  it('suppresses a proven fsmonitor hook and clean filter while preserving status and ordinary diff', async () => {
    const root = await repo()
    await fsp.writeFile(path.join(root, 'normal.txt'), 'before\n')
    await git(root, 'add', 'normal.txt')
    await git(root, 'commit', '--quiet', '-m', 'fixture')
    const controlRoot = await temp()
    const monitor = await markerCommand(controlRoot, 'fsmonitor')
    const filter = await markerCommand(controlRoot, 'filter')
    const external = await markerCommand(controlRoot, 'external')
    const textconv = await markerCommand(controlRoot, 'textconv')
    await git(root, 'config', 'core.fsmonitor', monitor.command)
    await git(root, 'status', '--porcelain')
    expect(await exists(monitor.marker)).toBe(true) // positive control: hook is executable here
    await fsp.rm(monitor.marker)
    await git(root, 'config', 'core.fsmonitor', 'false')
    await git(root, 'config', 'filter.platform.clean', filter.command)
    await fsp.writeFile(path.join(root, '.gitattributes'), '*.txt filter=platform diff=platform\n')
    await fsp.writeFile(path.join(root, 'normal.txt'), 'after and longer\n')
    await git(root, 'diff', '--no-ext-diff', '--no-textconv', 'HEAD', '--', 'normal.txt')
    expect(await exists(filter.marker)).toBe(true) // ordinary diff runs configured clean filters
    await fsp.rm(filter.marker)
    await git(root, 'config', 'core.fsmonitor', monitor.command)
    await git(root, 'config', 'diff.external', external.command)
    await git(root, 'config', 'diff.platform.textconv', textconv.command)
    await git(root, 'config', 'core.hooksPath', controlRoot)
    await fsp.writeFile(path.join(controlRoot, 'post-index-change'), `#!/bin/sh\n${external.command}\n`, { mode: 0o755 })
    vi.stubEnv('GIT_EXTERNAL_DIFF', external.command)
    vi.stubEnv('GIT_PAGER', external.command)
    const runner = createGitRunner()
    const snapshot = await collectFullBatch(createNodeProbeFs(root), runner, root, [])
    const diff = await collectGitDiff(runner, root)
    expect(snapshot.files.some(file => file.path === 'normal.txt' && file.reviewText?.includes('after and longer'))).toBe(true)
    expect(diff.text).toContain('-before')
    expect(diff.text).toContain('+after and longer')
    for (const item of [monitor, filter, external, textconv]) expect(await exists(item.marker)).toBe(false)
  }, 30_000)

  it('does not continue with an unisolated command when configuration discovery fails', async () => {
    const root = await repo()
    await fsp.writeFile(path.join(root, '.git', 'config'), '[broken\n')
    const result = await createGitRunner().run(['status', '--porcelain'], root)
    expect(result.code).not.toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe('Git configuration safety preflight failed')
  })
})

describe('SL-003 per-file sensitive evidence boundaries', () => {
  it('omits modified, untracked and deleted credential stores from batch bodies and diff before rendering review evidence', async () => {
    const root = await repo()
    await fsp.mkdir(path.join(root, 'deleted'))
    await fsp.mkdir(path.join(root, 'new'))
    await fsp.writeFile(path.join(root, '.npmrc'), `_authToken=${token}_old\n`)
    await fsp.writeFile(path.join(root, 'deleted', '.npmrc'), `_authToken=${token}_deleted\n`)
    await fsp.writeFile(path.join(root, 'normal.txt'), 'ordinary before\n')
    await git(root, 'add', '.')
    await git(root, 'commit', '--quiet', '-m', 'fixture')
    await fsp.writeFile(path.join(root, '.npmrc'), `_authToken=${token}_modified\n`)
    await fsp.rm(path.join(root, 'deleted', '.npmrc'))
    await fsp.writeFile(path.join(root, 'new', '.npmrc'), `_authToken=${token}_untracked\n`)
    await fsp.writeFile(path.join(root, 'normal.txt'), 'ordinary after\n')
    const fs = createNodeProbeFs(root)
    const readText = vi.fn(fs.readText)
    const runner = createGitRunner()
    const snapshot = await collectFullBatch({ ...fs, readText }, runner, root, [])
    const diff = await collectGitDiff(runner, root)
    const promptSection = renderBatchSection(snapshot, diff)
    expect(promptSection).not.toContain(token)
    expect(promptSection).toContain('ordinary after')
    expect(diff.text).toContain('-ordinary before')
    expect(diff.text).toContain('+ordinary after')
    expect(diff.text).not.toContain('.npmrc')
    expect(diff.gap).toContain('sensitive-path diffs omitted')
    expect(snapshot.files.filter(file => file.path.endsWith('.npmrc'))).toHaveLength(3)
    expect(snapshot.files.filter(file => file.path.endsWith('.npmrc')).every(file => file.omitted === 'sensitive-path' && file.reviewText === undefined && file.contentHash === undefined)).toBe(true)
    expect(readText.mock.calls.every(([file]) => !file.endsWith('.npmrc'))).toBe(true)
    const observed = await collectObservedBatch({ ...fs, readText }, ['.npmrc'], root)
    expect(observed.gaps.some(gap => gap.includes('sensitive-path content omitted'))).toBe(true)
    expect(renderBatchSection(observed)).not.toContain(token)
  })

  it('excludes each sensitive file during recursive search and keeps ordinary matching evidence', async () => {
    const root = await temp()
    await fsp.mkdir(path.join(root, 'nested'))
    await fsp.writeFile(path.join(root, 'nested', '.npmrc'), `_authToken=${token}\n`)
    await fsp.writeFile(path.join(root, 'normal.txt'), 'ordinary matching _authToken documentation\n')
    const fs = createNodeProbeFs(root)
    const direct = await fs.search('_authToken', '.', { cwd: root })
    expect(JSON.stringify(direct)).not.toContain(token)
    const result = await runProbe(fs, { kind: 'search', path: '.', pattern: '_authToken' }, { workspaceRoot: root })
    expect(result.ok).toBe(true)
    expect(result.text).not.toContain(token)
    expect(result.text).toContain('ordinary matching')
    expect(result.disclosures.some(item => item.detail.includes('credential-store'))).toBe(true)
    // The egress boundary also checks each match returned by injected/host FS.
    const hostileFs = { ...fs, search: async () => [...direct, { file: path.join(root, 'nested', '.npmrc'), line: 1, text: token }] }
    const guarded = await runProbe(hostileFs, { kind: 'search', path: '.', pattern: '_authToken' }, { workspaceRoot: root })
    expect(guarded.text).not.toContain(token)
    expect(guarded.text).toContain('ordinary matching')
  })

  it('does not let a filename pathspec broaden the selected diff set', async () => {
    const calls: readonly string[][] = []
    const mutable = calls as string[][]
    const runner = { async run(args: readonly string[]) {
      mutable.push([...args])
      return { code: 0, stderr: '', stdout: args.includes('--name-only') ? ':(glob)**\0.npmrc\0' : 'ordinary diff' }
    } }
    const result = await collectGitDiff(runner, '/work')
    expect(result.text).toBe('ordinary diff')
    expect(calls[1]).toContain(':(literal):(glob)**')
    expect(calls[1]).not.toContain(':(literal).npmrc')
  })
})

describe('SL-005 filesystem path case semantics', () => {
  it('preserves distinct POSIX paths and Windows case-insensitive containment', () => {
    expect(pathContains('/home/demo/Repo', '/home/demo/repo/outside.txt', 'posix')).toBe(false)
    expect(pathContains('/home/demo/Repo', '/home/demo/Repo/a.txt', 'posix')).toBe(true)
    expect(pathContains('/work', '/workspace/a.txt', 'posix')).toBe(false)
    expect(pathContains('/', '/home/demo/Repo', 'posix')).toBe(true)
    expect(comparablePath('/home/demo/Repo')).not.toBe(comparablePath('/home/demo/repo'))
    expect(pathContains('C:\\Work\\Repo', 'c:/work/repo/file.txt', 'windows')).toBe(true)
    expect(pathContains('C:\\Work\\Repo', 'c:/work/repository/file.txt', 'windows')).toBe(false)
  })

  it.skipIf(process.platform === 'win32')('refuses a real differently cased sibling on a POSIX filesystem', async () => {
    const root = await temp()
    const inside = path.join(root, 'Repo')
    const outside = path.join(root, 'repo')
    await fsp.mkdir(inside)
    await fsp.mkdir(outside)
    await fsp.writeFile(path.join(outside, 'outside.txt'), 'outside sentinel')
    const result = await runProbe(createNodeProbeFs(inside), { kind: 'read', path: path.join(outside, 'outside.txt') }, { workspaceRoot: inside })
    expect(result.ok).toBe(false)
    expect(result.text).toBe('')
  })
})
