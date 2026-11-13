/**
 * Reviewer context-firewall tests: the reviewer child's steps carry its own
 * prompt and its own read-only tool results and NOTHING else — no workspace
 * instruction files, no runtime-context snapshot, no third-party plugin
 * injection — including on the very first step, which the real in-process
 * driver reaches before `subagents.start` has resolved the child's id.
 * @module dsh-auto-review/test/isolation.spec
 */

import { describe, expect, it } from 'vitest'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { isReviewerOwnedMessage, REVIEWER_MESSAGE_SOURCES, stripInjectedContext } from '../src/index.ts'
import { CallId } from './call-id.ts'

/** The reviewer's own prompt, as the subagent driver delivers it. */
function promptMessage(text: string): UserMessage {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
}

/** One of the reviewer's own read-only tool results. */
function toolResultMessage(text: string): UserMessage {
  return createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'tool', callId: CallId('call-read') },
  }) as UserMessage
}

/**
 * The loop's runtime-context snapshot / any context-injecting plugin.
 *
 * Host `dsh-v0.1.7-alpha.1` has no catch-all `plugin` source kind: each
 * producer merge-extends `MessageSourceMap` with its OWN kind. The loop's
 * runtime-context snapshot declares `'runtime-context'`
 * (`@deepseek-ai/dsh-agent-loop/src/runtime-context.ts`); this suite does not
 * import that package, so the literal carries one cast. That is the point of
 * the fixture: an injected context kind the reviewer allow-list does not name
 * must be dropped — and a producer being NEW is not a way in.
 */
function pluginMessage(plugin: string, text: string): UserMessage {
  return createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: plugin, form: 'snapshot', sections: [] } as never,
  })
}

/** The workspace instruction loader's own merge-extended source kind. */
function instructionsMessage(text: string): UserMessage {
  return createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'agent-instructions', form: 'instructions', changes: [] } as never,
  })
}



describe('reviewer message allow-list', () => {
  it('admits only the reviewer prompt and its own tool results', () => {
    expect([...REVIEWER_MESSAGE_SOURCES].sort()).toEqual(['tool', 'user'])
    expect(isReviewerOwnedMessage(promptMessage('judge this'))).toBe(true)
    expect(isReviewerOwnedMessage(toolResultMessage('file body'))).toBe(true)
    expect(isReviewerOwnedMessage(pluginMessage('runtime-context', 'sandbox reminder'))).toBe(false)
    expect(isReviewerOwnedMessage(instructionsMessage('# AGENTS.md'))).toBe(false)
  })

  it('drops an unknown source kind rather than admitting it (deny by default)', () => {
    const exotic = createUserMessage({
      content: [{ type: 'text', text: 'from a plugin that merged its own source kind' }],
      source: { kind: 'some-future-producer' } as never,
    })
    expect(stripInjectedContext([exotic])).toEqual([])
  })

  it('keeps the surviving messages in order', () => {
    const prompt = promptMessage('judge this')
    const result = toolResultMessage('file body')
    const kept = stripInjectedContext([
      instructionsMessage('# AGENTS.md'),
      prompt,
      pluginMessage('runtime-context', 'sandbox reminder'),
      result,
    ])
    expect(kept).toEqual([prompt, result])
  })
})
