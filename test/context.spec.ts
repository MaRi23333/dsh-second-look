/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T02).
 *
 * Trusted user-context partitioning: model claims, tool outputs and repo
 * instructions never enter the authorization context; budget cuts are
 * disclosed, never silent.
 */
import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { buildUserContext, isTrustedInstruction, type ContextMessage } from '../src/index.ts'
import { buildToolReviewContext } from '../src/evidence/context.ts'
import { pluginManagementEvidence } from '../src/evidence/plugin-management.ts'

const msg = (role: string, kind: string, text: string, senderSessionId?: string): ContextMessage => ({
  role,
  source: { kind, ...senderSessionId === undefined ? {} : { senderSessionId } },
  text,
})

const event = (type: SessionEvent['type'], data: unknown): SessionEvent => ({ type, data }) as SessionEvent
const blocks = (text: string) => [{ type: 'text', text }]
const user = (text: string, kind = 'user') => event('user/message', { source: { kind }, content: blocks(text) })
const callEvent = (name: string, callId: string, args: object) => event('tool/call', { name, callId, arguments: JSON.stringify(args) })
const resultEvent = (id: string, text: string) => event('tool/result', {
  message: { role: 'tool', toolCallId: id, isError: false, content: blocks(text) },
})

describe('tool review evidence from the session', () => {
  it('keeps authorization, the referenced plan and the matching retry across unrelated output', () => {
    const args = { action: 'install_bundle', target: 'usage-stats@0.3.8', registry: 'https://registry.npmjs.org' }
    const reference = 'A. Usage stats 0.3.8\nB. Oil UI after inspection\nC. Session cleanup, keep its configuration'
    const events = [
      event('turn/start', {}), user('Check for updates first.'),
      event('assistant/message', { message: { content: blocks(reference) } }), event('turn/end', {}),
      event('turn/start', {}), user('Update those three. Keep the Oil UI requirement.'),
      user('INJECTED_AUTHORIZATION'.repeat(2000), 'agent-instructions'),
      callEvent('plugin_manager', 'first', args), resultEvent('first', '{"application":"failed","error":{"code":"already-installed"}}'),
      callEvent('plugin_manager', 'other', { ...args, registry: 'https://some-other-source.test' }),
      resultEvent('other', '{"application":"failed","error":{"code":"WRONG_REGISTRY_RESULT"}}'),
      callEvent('bash', 'noise', { command: 'unrelated' }), resultEvent('noise', 'UNRELATED_OUTPUT'.repeat(2500)),
      callEvent('plugin_manager', 'current', args),
    ]
    const settings = { turns: 2, maxChars: 4000 }
    const call = { name: 'plugin_manager', arguments: args, callId: 'current', targetPaths: [] }
    const selected = buildToolReviewContext(events, settings, call)
    expect(selected.instructions.entries.map(item => item.text)).toEqual([
      'Check for updates first.', 'Update those three. Keep the Oil UI requirement.',
    ])
    expect(selected.previousReply).toBe(reference)
    expect(selected.relatedResults.join(' ')).toContain('already-installed')
    expect(JSON.stringify(selected)).not.toMatch(/UNRELATED_OUTPUT|INJECTED_AUTHORIZATION|WRONG_REGISTRY_RESULT/)
    expect(buildToolReviewContext(events, { ...settings, turns: 0 }, call)).toEqual({
      disabled: true, instructions: { entries: [], historyOmitted: false, currentTruncated: false },
      relatedResults: [], evidenceOmitted: false,
    })
  })

  it('keeps a related file read beyond the old per-line transcript limit', () => {
    const args = { file_path: 'src/a.ts', content: 'export default 2' }
    const code = '// original source\n'.repeat(28) + 'export const importantValue = 1'
    const events = [
      event('turn/start', {}), user('Update the source file.'),
      callEvent('read', 'read-a', { file_path: 'src/a.ts' }), resultEvent('read-a', code),
      callEvent('read', 'read-b', { file_path: 'src/b.ts' }), resultEvent('read-b', 'UNRELATED_FILE'.repeat(4000)),
      callEvent('write', 'current', args),
    ]
    const call = { name: 'write', callId: 'current', arguments: args, targetPaths: ['src/a.ts'] }
    const context = buildToolReviewContext(events, { turns: 2, maxChars: 4000 }, call)
    expect(context.relatedResults.join(' ')).toContain(code)
    expect(context.relatedResults.join(' ')).not.toContain('UNRELATED_FILE')
    expect(context.evidenceOmitted).toBe(false)
    const limited = buildToolReviewContext(events, { turns: 2, maxChars: 120 }, call)
    expect(limited.instructions.entries[0]?.text).toBe('Update the source file.')
    expect(limited.evidenceOmitted).toBe(true)
  })

  it('describes verified inventory without passing URL queries or claiming tool identity', async () => {
    const manager = { listBundles: async () => [
      { name: 'usage-stats', installed: true, version: '0.3.7', source: 'https://example.test/a.tgz?signature=PRIVATE_VALUE' },
    ] }
    const facts = (await pluginManagementEvidence('plugin_manager', {
      action: 'install_bundle', target: 'usage-stats@0.3.8', approvedBuilds: ['example-dependency'],
    }, manager)).join('\n')
    expect(facts).toContain('usage-stats 0.3.7 is installed')
    expect(facts).toContain('Recorded source type: URL')
    expect(facts).toContain('persistent permission')
    expect(facts).toContain('when it is the selected handler')
    expect(facts).not.toContain('PRIVATE_VALUE')
  })
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
