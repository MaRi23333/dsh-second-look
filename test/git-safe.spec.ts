import { afterEach, describe, expect, it, vi } from 'vitest'
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { resolveGitExecutable } from '../src/change/git-executable.ts'
import { runIsolatedGit } from '../src/change/git-safe.ts'

const execute = promisify(execFile)
const roots: string[] = []
const trustedGit = await resolveGitExecutable(process.cwd(), process.env)
if (!trustedGit) throw new Error('Git safety integration tests require a host Git outside the workspace')

async function temp(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'second-look-git-safe-'))
  roots.push(root)
  return root
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await execute(trustedGit!, args, { cwd, timeout: 10_000 })).stdout
}

async function repo(): Promise<string> {
  const root = await temp()
  await git(root, 'init', '--quiet')
  await git(root, 'config', 'user.email', 'test@example.invalid')
  await git(root, 'config', 'user.name', 'Git Safety Test')
  await fs.writeFile(path.join(root, 'normal.txt'), 'before\n')
  await git(root, 'add', 'normal.txt')
  await git(root, 'commit', '--quiet', '-m', 'fixture')
  await fs.writeFile(path.join(root, 'normal.txt'), 'after\n')
  return root
}

const exists = (file: string): Promise<boolean> => fs.access(file).then(() => true, () => false)

async function nodeCopy(file: string): Promise<void> {
  // Copy/link the installed trusted Node, never an untrusted binary fixture.
  await fs.link(process.execPath, file).catch(() => fs.copyFile(process.execPath, file))
}

afterEach(async () => {
  vi.unstubAllEnvs()
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true })
})

describe('SL-002 fixed Git executable and configuration boundaries', () => {
  it.skipIf(process.platform !== 'win32')('ignores cwd git.exe and git.com while preserving real Git evidence', async () => {
    const root = await repo()
    const marker = path.join(root, 'fake-git.marker')
    const markerCode = `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`
    for (const name of ['git.exe', 'git.com']) {
      await nodeCopy(path.join(root, name))
      // Positive control: this harmless executable can run from cwd and write.
      await execute(name === 'git.exe' ? 'git' : 'git.com', ['-e', markerCode], { cwd: root })
      expect(await exists(marker)).toBe(true)
      await fs.rm(marker)
      const result = await runIsolatedGit(['diff', '--no-ext-diff', '--no-textconv', '--', 'normal.txt'], root)
      expect(result.code).toBe(0)
      expect(result.stdout).toContain('+after')
      expect(await exists(marker)).toBe(false)
      await fs.rm(path.join(root, name))
    }
  })

  it('rejects empty/relative PATH, repository ancestors, and symlinks back into the workspace', async () => {
    const root = await repo()
    const child = path.join(root, 'nested')
    const bin = path.join(root, 'bin')
    const outside = await temp()
    await fs.mkdir(child)
    await fs.mkdir(bin)
    const filename = process.platform === 'win32' ? 'git.exe' : 'git'
    await nodeCopy(path.join(root, filename))
    await nodeCopy(path.join(bin, filename))
    const linkedBin = path.join(outside, 'linked-bin')
    await fs.symlink(bin, linkedBin, process.platform === 'win32' ? 'junction' : 'dir')
    const untrustedPath = ['', '.', 'bin', root, bin, linkedBin, path.toNamespacedPath(bin)].join(path.delimiter)
    const rejected = { PATH: untrustedPath }
    expect(await resolveGitExecutable(child, rejected)).toBeUndefined()
    vi.stubEnv('PATH', untrustedPath)
    const unavailable = await runIsolatedGit(['status', '--porcelain'], child)
    expect(unavailable.code).not.toBe(0)
    expect(unavailable.stdout).toBe('')
    expect(unavailable.stderr).toContain('no trusted absolute Git executable outside the workspace')
    const usablePath = `${untrustedPath}${path.delimiter}${path.dirname(trustedGit!)}`
    vi.stubEnv('PATH', usablePath)
    expect(await resolveGitExecutable(child, { PATH: usablePath })).toBe(trustedGit)
    const result = await runIsolatedGit(['diff', '--no-ext-diff', '--no-textconv', '--', '../normal.txt'], child)
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('+after')
  })

  it.each(['platform', 'evil=foo', 'dots.and-hyphens_42'])('disables a proven clean filter named %j without losing ordinary diff', async driver => {
    const root = await repo()
    const marker = path.join(root, 'clean.marker')
    const script = path.join(root, 'clean.cjs')
    await fs.writeFile(script, "require('node:fs').writeFileSync(process.argv[2], 'ran'); process.stdin.pipe(process.stdout)\n")
    const quote = (value: string): string => `'${value.replaceAll('\\', '/').replaceAll("'", "'\\''")}'`
    await git(root, 'config', `filter.${driver}.clean`, `${quote(process.execPath)} ${quote(script)} ${quote(marker)}`)
    await fs.writeFile(path.join(root, '.gitattributes'), `*.txt filter=${driver}\n`)
    expect(await git(root, 'diff', '--no-ext-diff', '--no-textconv', '--', 'normal.txt')).toContain('+after')
    expect(await exists(marker)).toBe(true)
    await fs.rm(marker)
    const result = await runIsolatedGit(['diff', '--no-ext-diff', '--no-textconv', '--', 'normal.txt'], root)
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('+after')
    expect(await exists(marker)).toBe(false)
  })

  it.each(['\r', '\n'])('reports a collection gap for a filter subsection containing %j', async newline => {
    const root = await repo()
    await fs.appendFile(path.join(root, '.git', 'config'), `[filter "line${newline}break"]\nclean = echo harmless\n`)
    // Current Git rejects LF in the file parser; CR can survive discovery.
    // Either format must stop before a repository diff can run.
    const keys = await git(root, 'config', '--null', '--name-only', '--list', '--includes').catch(() => undefined)
    if (keys !== undefined) expect(keys).toContain(`filter.line${newline}break.clean\0`)
    const result = await runIsolatedGit(['diff', '--no-ext-diff', '--no-textconv', '--', 'normal.txt'], root)
    expect(result.code).not.toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe(keys === undefined ? 'Git configuration safety preflight failed' : 'Git evidence unavailable: filter configuration key contains an unsupported newline')
  })

  it('stops on undecodable filter-name bytes instead of overriding a different decoded driver', async () => {
    const root = await repo()
    const marker = path.join(root, 'raw-filter.marker')
    const script = path.join(root, 'raw-filter.cjs')
    await fs.writeFile(script, "require('node:fs').writeFileSync(process.argv[2], 'ran'); process.stdin.pipe(process.stdout)\n")
    const quote = (value: string): string => `'${value.replaceAll('\\', '/').replaceAll("'", "'\\''")}'`
    const command = `${quote(process.execPath)} ${quote(script)} ${quote(marker)}`
    const name = Buffer.from([0x62, 0x61, 0x64, 0xff])
    await fs.appendFile(path.join(root, '.git', 'config'), Buffer.concat([
      Buffer.from('[filter "'), name, Buffer.from(`"]\nclean = ${command}\n`),
    ]))
    await fs.writeFile(path.join(root, '.gitattributes'), Buffer.concat([Buffer.from('*.txt filter='), name, Buffer.from('\n')]))
    expect(await git(root, 'diff', '--no-ext-diff', '--no-textconv', '--', 'normal.txt')).toContain('+after')
    expect(await exists(marker)).toBe(true)
    await fs.rm(marker)
    const result = await runIsolatedGit(['diff', '--no-ext-diff', '--no-textconv', '--', 'normal.txt'], root)
    expect(result.code).not.toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('filter configuration key cannot be represented safely as UTF-8')
    expect(await exists(marker)).toBe(false)
  })
})
