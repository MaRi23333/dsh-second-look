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
import type { TrustedUserContext, UserContextEntry } from '../action/types.ts'

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
