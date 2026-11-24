/**
 * Modified for dsh-second-look, 2026-10-31 (T02).
 *
 * Trusted user-context assembly with provenance, adapted from the local fork
 * `dsh-heavy-approval/src/review-context.ts` (workspace-local source, reused
 * with attribution; see THIRD-PARTY-SOURCES.md).
 *
 * Task-doc rule: model claims, tool outputs and repository instructions are
 * EVIDENCE, never authorization. Only messages whose source is a real user
 * (or a direct parent instruction) enter the trusted context, each labelled
 * with where it came from; budgets are spent newest-first and any cut is
 * disclosed, never silent.
 */
import { isDeepStrictEqual } from 'node:util'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { TrustedUserContext, UserContextEntry } from '../action/types.ts'
import type { ContextBudgetConfig } from '../config.ts'
import { readToolResult, toolResultIsError, toolResultText } from '../session-message.ts'

/** The minimal message shape the partitioner reads. */
export interface ContextMessage {
  readonly role: string
  readonly source: { readonly kind: string; readonly senderSessionId?: string }
  readonly text: string
}

export interface BuildUserContextOptions {
  /** Max entries kept (newest first). Default 8. */
  readonly maxEntries?: number
  /** Total character budget across entries. Default 48000. */
  readonly maxChars?: number
  /** The direct parent session, for `direct-parent-instruction` attribution. */
  readonly parentSessionId?: string | undefined
}

/**
 * Whether a message is a real direct user instruction (the only kind that can
 * authorize anything) or a direct parent-agent instruction to a child.
 */
export function isTrustedInstruction(message: ContextMessage, parentSessionId?: string): 'user' | 'parent-instruction' | undefined {
  if (message.role !== 'user') return undefined
  if (message.source.kind === 'user') return 'user'
  if (parentSessionId !== undefined && message.source.kind === 'agent-message' && message.source.senderSessionId === parentSessionId) {
    return 'parent-instruction'
  }
  return undefined
}

/**
 * Assemble the trusted user context from a message list (newest last).
 * @param messages - the candidate messages (already scoped to the task).
 * @param options - budgets and the parent session identity.
 * @returns labelled entries with honest omission flags.
 */
export function buildUserContext(messages: readonly ContextMessage[], options: BuildUserContextOptions = {}): TrustedUserContext {
  const maxEntries = options.maxEntries ?? 8
  const maxChars = options.maxChars ?? 48_000
  const trusted: { entry: UserContextEntry; chars: number }[] = []
  for (const message of messages) {
    const source = isTrustedInstruction(message, options.parentSessionId)
    if (source === undefined) continue
    trusted.push({ entry: { source, text: message.text }, chars: message.text.length })
  }

  const entries: UserContextEntry[] = []
  let usedChars = 0
  let currentTruncated = false
  let historyOmitted = false

  // Newest first: the current request matters most.
  for (let index = trusted.length - 1; index >= 0; index -= 1) {
    const item = trusted[index]
    if (item === undefined) continue
    const { entry, chars } = item
    if (entries.length >= maxEntries) {
      historyOmitted = true
      break
    }
    const remaining = maxChars - usedChars
    if (remaining <= 0) {
      historyOmitted = true
      break
    }
    if (chars > remaining) {
      const isCurrent = index === trusted.length - 1
      entries.push({ source: entry.source, text: entry.text.slice(0, remaining) })
      usedChars = maxChars
      if (isCurrent) currentTruncated = true
      else historyOmitted = true
      break
    }
    entries.push(entry)
    usedChars += chars
  }

  // Restore chronological order for the reviewer.
  entries.reverse()
  return { entries, historyOmitted, currentTruncated }
}

export interface ToolReviewContext {
  readonly disabled: boolean
  readonly instructions: TrustedUserContext
  readonly previousReply?: string | undefined
  readonly relatedResults: readonly string[]
  readonly evidenceOmitted: boolean
}

interface ContextCall {
  readonly name: string
  readonly callId: string
  readonly arguments: unknown
  readonly targetPaths: readonly string[]
  readonly parentSessionId?: string | undefined
}

function messageText(content: SessionEvent<'user/message'>['data']['content']): string {
  return content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
}

function parsedRecord(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text)
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

function relatedToolResults(events: readonly SessionEvent[], call: ContextCall): {
  failure: string | undefined
  reads: readonly string[]
} {
  const openTurn = events.slice(events.findLastIndex(event => event.type === 'turn/start') + 1)
  const prior = new Map<string, { name: string; path?: string }>()
  const reads = new Map<string, string>()
  let failure: string | undefined
  for (const event of openTurn) {
    if (event.type === 'tool/call') {
      const id = String(event.data.callId)
      if (id === call.callId) break
      const { name, arguments: raw } = event.data
      if (name !== call.name && name !== 'read') continue
      const args = parsedRecord(raw)
      if (args === undefined) continue
      if (name === call.name && isDeepStrictEqual(args, call.arguments)) {
        prior.set(id, { name })
      } else if (name === 'read' && typeof args['file_path'] === 'string' && call.targetPaths.includes(args['file_path'])) {
        prior.set(id, { name, path: args['file_path'] })
      }
    } else if (event.type === 'tool/result') {
      const view = readToolResult(event.data.message)
      if (view === undefined) continue
      const previous = prior.get(view.callId)
      if (previous === undefined) continue
      const output = toolResultText(view)
      const failed = toolResultIsError(event.data.error, view)
        || (previous.name === 'plugin_manager' && parsedRecord(output)?.['application'] === 'failed')
      if (previous.path !== undefined) {
        reads.delete(previous.path)
        if (!failed && output !== '') reads.set(previous.path, `Earlier read with file_path ${previous.path}:\n${output}`)
      } else {
        const detail = event.data.error?.reason ?? (output || event.data.error?.code)
        failure = failed && detail ? `Earlier failure for the same ${previous.name} arguments:\n${detail}` : undefined
      }
    }
  }
  return { failure, reads: [...reads.values()].reverse() }
}

/** Select decision evidence from the same session snapshot as the pending call. */
export function buildToolReviewContext(
  events: readonly SessionEvent[],
  budget: ContextBudgetConfig,
  call: ContextCall,
): ToolReviewContext {
  if (budget.turns === 0) {
    return { disabled: true, instructions: buildUserContext([]), relatedResults: [], evidenceOmitted: false }
  }
  let start = events.length
  let turns = 0
  while (start > 0) {
    const event = events[start - 1]
    if (event?.type === 'turn/end' && ++turns >= budget.turns) break
    start -= 1
  }
  const recent = events.slice(start)
  const messages: ContextMessage[] = []
  let latestInstruction = -1
  for (const [index, event] of recent.entries()) {
    if (event.type !== 'user/message' || event.data.source === undefined) continue
    const message = { role: 'user', source: event.data.source, text: messageText(event.data.content) }
    if (message.text === '' || isTrustedInstruction(message, call.parentSessionId) === undefined) continue
    messages.push(message)
    latestInstruction = index
  }
  const instructions = buildUserContext(messages, {
    maxChars: budget.maxChars, maxEntries: messages.length, parentSessionId: call.parentSessionId,
  })
  let remaining = budget.maxChars - instructions.entries.reduce((sum, entry) => sum + entry.text.length, 0)
  let evidenceOmitted = false
  const take = (text: string | undefined): string | undefined => {
    if (!text) return undefined
    if (text.length > remaining) evidenceOmitted = true
    const selected = text.slice(0, remaining).replace(/[\uD800-\uDBFF]$/u, '')
    remaining -= selected.length
    return selected || undefined
  }
  const { failure, reads } = relatedToolResults(recent, call)
  const selectedFailure = take(failure)
  // The adjacent user-visible answer can resolve instructions such as "do
  // those three". Preserve its order and exclusions instead of extracting
  // lines by package name. Other assistant and tool chatter stays out.
  let reply: string | undefined
  for (let index = latestInstruction - 1; index >= 0; index -= 1) {
    const event = recent[index]
    if (event?.type === 'assistant/message') {
      reply = messageText(event.data.message.content)
      if (reply) break
    }
    if (event?.type === 'user/message' && event.data.source?.kind === 'user') break
  }
  return {
    disabled: false, instructions, previousReply: take(reply),
    relatedResults: [selectedFailure, ...reads.map(take)].filter((item): item is string => item !== undefined),
    evidenceOmitted,
  }
}
