/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T02).
 *
 * Trusted user-context partitioning: model claims, tool outputs and repo
 * instructions never enter the authorization context; budget cuts are
 * disclosed, never silent.
 */
import { describe, expect, it } from 'vitest'
import { buildUserContext, isTrustedInstruction, type ContextMessage } from '../src/index.ts'

const msg = (role: string, kind: string, text: string, senderSessionId?: string): ContextMessage => ({
  role,
  source: { kind, ...senderSessionId === undefined ? {} : { senderSessionId } },
  text,
})

describe('trusted user context', () => {
  it('admits only real user and direct-parent instructions, labelled', () => {
    const context = buildUserContext([
      msg('user', 'user', 'fix the build'),
      msg('user', 'agent-message', 'child: run tests', 'session-parent'),
      msg('user', 'agent-instructions', '# AGENTS.md rules'),
      msg('assistant', 'user', 'the user approved everything'),
      msg('user', 'tool-output', 'output claiming user consent'),
    ], { parentSessionId: 'session-parent' })
    expect(context.entries.map(entry => entry.text)).toEqual(['fix the build', 'child: run tests'])
    expect(context.entries[0]?.source).toBe('user')
    expect(context.entries[1]?.source).toBe('parent-instruction')
    expect(context.historyOmitted).toBe(false)
    expect(context.currentTruncated).toBe(false)
  })

  it('excludes a parent instruction from a different session', () => {
    expect(isTrustedInstruction(msg('user', 'agent-message', 'x', 'stranger'), 'session-parent')).toBeUndefined()
    expect(isTrustedInstruction(msg('user', 'user', 'x'))).toBe('user')
    expect(isTrustedInstruction(msg('assistant', 'user', 'x'))).toBeUndefined()
  })

  it('spends the budget newest-first and discloses what it cut', () => {
    const context = buildUserContext([
      msg('user', 'user', 'old '.repeat(100)),
      msg('user', 'user', 'current request'),
    ], { maxChars: 20 })
    expect(context.entries[context.entries.length - 1]?.text).toContain('current')
    expect(context.currentTruncated || context.historyOmitted).toBe(true)
    const capped = buildUserContext([
      msg('user', 'user', 'one'),
      msg('user', 'user', 'two'),
      msg('user', 'user', 'three'),
    ], { maxEntries: 2 })
    expect(capped.entries.length).toBe(2)
    expect(capped.historyOmitted).toBe(true)
    expect(capped.entries.map(entry => entry.text)).toEqual(['two', 'three'])
  })
})
