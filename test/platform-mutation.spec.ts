import { describe, expect, it } from 'vitest'
import { recognizeCall } from '../src/action/adapters.ts'
import { classifyAction } from '../src/action/classify.ts'
import type { TargetState, UnifiedAction } from '../src/action/types.ts'
import { isGitControlPath } from '../src/protected-paths.ts'

function action(toolName: string, args: Record<string, unknown>, state: TargetState): UnifiedAction {
  const recognized = recognizeCall(toolName, args)
  return {
    callId: 'platform-mutation', isPtcInner: false, sessionId: 'platform-test',
    origin: 'native', toolName, arguments: args, tier: 'daily', configVersion: 'test',
    effect: recognized.effect, subOperation: recognized.subOperation,
    targets: recognized.rawPaths.map(rawPath => ({ rawPath, scope: 'inside', state })),
    signals: recognized.signals,
  }
}

describe('SL-001 whole-file overwrite routing', () => {
  it('reviews equivalent destructive write and edit over an existing 4096-byte file', () => {
    const state = { exists: true, kind: 'file', sizeBytes: 4096 } as const
    for (const pending of [
      action('write', { file_path: 'notes.txt', content: 'x' }, state),
      action('edit', { file_path: 'notes.txt', old_string: 'a'.repeat(4096), new_string: 'x' }, state),
    ]) {
      const result = classifyAction(pending)
      expect(result.disposition).toBe('review')
      expect(result.reasons.join(' ')).toMatch(/existing/)
    }
  })

  it('reviews equal-size and larger replacements because size cannot establish preserved content', () => {
    for (const content of ['x'.repeat(4096), 'x'.repeat(8192)]) {
      const result = classifyAction(action('write', { file_path: 'notes.txt', content },
        { exists: true, kind: 'file', sizeBytes: 4096 }))
      expect(result.disposition).toBe('review')
      expect(result.signals).toContain('unverified-overwrite')
      expect(result.reasons.join(' ')).toContain('without a verified content comparison')
    }
  })

  it('keeps new and verified empty ordinary writes, and small edits, exempt', () => {
    for (const state of [{ exists: false }, { exists: true, kind: 'file', sizeBytes: 0 }] as const) {
      expect(classifyAction(action('write', { file_path: 'notes.txt', content: 'hello' }, state)).disposition).toBe('exempt')
    }
    expect(classifyAction(action('write', { file_path: 'new.txt', content: '' }, { exists: false })).disposition).toBe('exempt')
    expect(classifyAction(action('edit', { file_path: 'notes.txt', old_string: 'a', new_string: 'b' },
      { exists: true, kind: 'file', sizeBytes: 4096 })).disposition).toBe('exempt')
  })

  it('routes missing overwrite evidence to review, never a deterministic denial', () => {
    const result = classifyAction(action('write', { file_path: 'notes.txt', content: 'hello' },
      { exists: true, kind: 'file' }))
    expect(result.disposition).toBe('review')
    expect(result.signals).toContain('unverified-overwrite')
  })
})

describe('SL-002 Git control-file mutation routing', () => {
  const controlPaths = [
    '.git', '.git/config', '.git/hooks/pre-commit', '.git/index', '.git/commondir',
    '.git/worktrees/linked/gitdir', '.gitattributes', 'nested/.gitattributes', '.gitmodules',
    '.gitconfig', '.config/git/config', '.config/git/attributes',
    'nested/../.git/config', 'C:\\repo\\.git\\config',
  ]

  it.each(controlPaths)('reviews small edits and new writes to %s', filePath => {
    expect(isGitControlPath(filePath)).toBe(true)
    const edit = classifyAction(action('edit', { file_path: filePath, old_string: 'a', new_string: 'b' },
      { exists: true, kind: 'file', sizeBytes: 4096 }))
    expect(edit.disposition).toBe('review')
    expect(edit.signals).toContain('git-control-change')
    const write = classifyAction(action('write', { file_path: filePath, content: 'ordinary-looking setting' },
      { exists: false }))
    expect(write.disposition).toBe('review')
    expect(write.signals).toContain('git-control-change')
  })

  it('preserves the ordinary read policy for non-sensitive Git control paths', () => {
    for (const filePath of ['.git/config', '.git/hooks/pre-commit', '.gitattributes', '.gitmodules']) {
      expect(classifyAction(action('read', { file_path: filePath },
        { exists: true, kind: 'file', sizeBytes: 4096 })).disposition).toBe('exempt')
    }
  })

  it('does not mistake ordinary Git-related filenames or normalized-out metadata for controls', () => {
    for (const filePath of ['.github/workflows/test.yml', 'docs/git-config.md', '.gitignore', '.git/../notes.txt']) {
      expect(isGitControlPath(filePath)).toBe(false)
      expect(classifyAction(action('edit', { file_path: filePath, old_string: 'a', new_string: 'b' },
        { exists: true, kind: 'file', sizeBytes: 4096 })).disposition).toBe('exempt')
    }
  })
})
