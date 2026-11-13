/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T02).
 *
 * File-target inspection behaviour, including the fork-review fix: middle
 * path components that are symlinks/junctions must route to review.
 */
import { describe, expect, it } from 'vitest'
import {
  comparablePath,
  inspectFileTarget,
  isProtectedSystemPath,
  lexicalResolve,
  targetFromEvidence,
  type TargetFileSystem,
} from '../src/index.ts'

interface FakeEntry {
  type?: 'file' | 'directory' | 'symlink' | 'other'
  size?: number
  /** real path when the entry is a link or the tree is aliased */
  real?: string
}

/** In-memory fs: `tree` maps normalized logical paths to entries. */
function fakeFs(tree: Record<string, FakeEntry>, alias?: Record<string, string>): TargetFileSystem<string> {
  return {
    async resolve(path: string, opts?: { cwd?: string }): Promise<string> {
      const logical = lexicalResolve(opts?.cwd ?? '/', path)
      return alias?.[logical] ?? logical
    },
    processPath(target: string): string {
      return target
    },
    contains(parent: string, child: string): boolean {
      return comparablePath(child).startsWith(comparablePath(parent))
    },
    async stat(target: string): Promise<{ type?: string; size?: number } | undefined> {
      return tree[comparablePath(target)]
    },
    async lstat(path: string, opts?: { cwd?: string }): Promise<{ type?: string } | undefined> {
      const logical = lexicalResolve(opts?.cwd ?? '/', path)
      return tree[comparablePath(logical)]
    },
  }
}

const WORKSPACE = '/work'

describe('path inspection', () => {
  it('resolves an ordinary in-workspace file to ready evidence', async () => {
    const fs = fakeFs({
      '/work': { type: 'directory' },
      '/work/src/a.ts': { type: 'file', size: 100 },
    })
    const probe = await inspectFileTarget(fs, 'src/a.ts', WORKSPACE)
    expect(probe.kind).toBe('ready')
    if (probe.kind !== 'ready') return
    expect(probe.evidence.workspaceRelation).toBe('inside')
    expect(probe.evidence.exists).toBe(true)
    expect(probe.evidence.sizeBytes).toBe(100)
    expect(targetFromEvidence('src/a.ts', probe).scope).toBe('inside')
  })

  it('routes a final-component symlink to review', async () => {
    const fs = fakeFs({
      '/work': { type: 'directory' },
      '/work/link': { type: 'symlink' },
    })
    const probe = await inspectFileTarget(fs, 'link', WORKSPACE)
    expect(probe).toEqual({ kind: 'review', reasonCode: 'file-target-symlink' })
  })

  it('routes a final-component junction-style "other" entry to review (F02)', async () => {
    // On some fs surfaces a Windows junction's own lstat reports `other`, not
    // `symlink`; the final component must get the same treatment as ancestors.
    const fs = fakeFs({
      '/work': { type: 'directory' },
      '/work/junction_dir': { type: 'other' },
    })
    const probe = await inspectFileTarget(fs, 'junction_dir', WORKSPACE)
    expect(probe).toEqual({ kind: 'review', reasonCode: 'file-target-symlink' })
  })

  it('routes a symlink/junction in a MIDDLE component to review (fork-review fix)', async () => {
    // /work/sub is a junction-style link ("other") the fork's final-component
    // lstat would never look at; only the ancestor walk catches it.
    const fs = fakeFs({
      '/work': { type: 'directory' },
      '/work/sub': { type: 'other' },
      '/work/sub/a.ts': { type: 'file', size: 10 },
    })
    const probe = await inspectFileTarget(fs, 'sub/a.ts', WORKSPACE)
    expect(probe).toEqual({ kind: 'review', reasonCode: 'file-target-linked-ancestor' })
  })

  it('routes aliasing (lexical vs process path) to review', async () => {
    const fs = fakeFs(
      { '/work': { type: 'directory' }, '/elsewhere/a.ts': { type: 'file', size: 10 } },
      { '/work/a.ts': '/elsewhere/a.ts' },
    )
    const probe = await inspectFileTarget(fs, 'a.ts', WORKSPACE)
    expect(probe).toEqual({ kind: 'review', reasonCode: 'file-target-aliased' })
  })

  it('routes protected system locations to review and reports missing targets as evidence', async () => {
    const fs = fakeFs({ '/work': { type: 'directory' } })
    expect(isProtectedSystemPath('C:\\Windows\\System32\\x')).toBe(true)
    expect(isProtectedSystemPath('/etc/passwd')).toBe(true)
    expect(isProtectedSystemPath('/work/src/a.ts')).toBe(false)
    const missing = await inspectFileTarget(fs, 'src/new.ts', WORKSPACE)
    expect(missing.kind).toBe('ready')
    if (missing.kind !== 'ready') return
    expect(missing.evidence.exists).toBe(false)
  })

  it('falls back to a review reason when the filesystem throws', async () => {
    const fs: TargetFileSystem<string> = {
      async resolve(): Promise<string> {
        throw new Error('EACCES')
      },
      processPath: (target: string) => target,
      contains: () => false,
      async stat() {
        return undefined
      },
      async lstat() {
        return undefined
      },
    }
    const probe = await inspectFileTarget(fs, 'x', WORKSPACE)
    expect(probe).toEqual({ kind: 'review', reasonCode: 'file-target-unavailable' })
    expect(targetFromEvidence('x', probe).scope).toBe('unknown')
  })
})

describe('lexical path normalization', () => {
  it('resolves relative segments and keeps absolute anchors', () => {
    expect(comparablePath(lexicalResolve('/work', 'src/../a.ts'))).toBe('/work/a.ts')
    expect(comparablePath(lexicalResolve('/work', '/etc/x'))).toBe('/etc/x')
    expect(comparablePath(lexicalResolve('/work', './a.ts'))).toBe('/work/a.ts')
  })
})
