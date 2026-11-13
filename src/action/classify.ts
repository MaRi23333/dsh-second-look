/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T02).
 *
 * The exemption classifier: decides which calls skip the reviewer ("普通文件
 * 读写通常免审") and which are sent to review, from deterministic recognition
 * plus observed target state. It never grants anything it cannot establish:
 * an unknown scope, an unverified adapter or an unrecognized tool is review.
 *
 * Tier difference: `daily` exempts ordinary network reads (search/fetch);
 * `strict` reviews them. Execution, delegation and unknown tools are always
 * reviewed (task-doc: 执行类操作是审核重点).
 */
import type { RiskSignal, ReviewTier, UnifiedAction } from './types.ts'
import { isGitControlPath } from '../protected-paths.ts'

export interface Classification {
  readonly disposition: 'exempt' | 'review'
  /** Refined signals (candidate signals may be dropped when state disproves them). */
  readonly signals: readonly RiskSignal[]
  /** Short human-readable reasons for the audit log and status UI. */
  readonly reasons: readonly string[]
}

/** Below this many bytes an "emptied" file counts as trivial, not a mass-clear. */
const TRIVIAL_FILE_BYTES = 64

/** A replaced fragment covering at least this share of the file is "important". */
const IMPORTANT_REPLACEMENT_SHARE = 0.5

function targetFacts(action: UnifiedAction): {
  anyUnknownScope: boolean
  anyExisting: boolean
  anyLarge: boolean
  replacementShareKnown: boolean
  importantReplacement: boolean
} {
  let anyUnknownScope = false
  let anyExisting = false
  let anyLarge = false
  let replacementShareKnown = false
  let importantReplacement = false
  for (const target of action.targets) {
    if (target.scope === 'unknown') anyUnknownScope = true
    const state = target.state
    if (state === undefined) continue
    if (state.exists) {
      anyExisting = true
      if (state.sizeBytes !== undefined && state.sizeBytes > TRIVIAL_FILE_BYTES) anyLarge = true
    }
    if (action.effect === 'edit' && state.exists && state.sizeBytes !== undefined && state.sizeBytes > 0) {
      replacementShareKnown = true
      const oldString = readStringField(action.arguments, 'old_string')
      // BYTES to BYTES (T08 红队 §1c): the string length is UTF-16 code units
      // while sizeBytes is disk bytes — CJK-heavy files must not slip under
      // the threshold at full-file replacement.
      const oldBytes = oldString === undefined ? 0 : new TextEncoder().encode(oldString).length
      if (oldString !== undefined && oldBytes >= state.sizeBytes * IMPORTANT_REPLACEMENT_SHARE) {
        importantReplacement = true
      }
    }
  }
  return { anyUnknownScope, anyExisting, anyLarge, replacementShareKnown, importantReplacement }
}

function readStringField(args: unknown, name: string): string | undefined {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return undefined
  const value = (args as Record<string, unknown>)[name]
  return typeof value === 'string' ? value : undefined
}

/**
 * Classify one action.
 * @param action - the unified action with local arguments and target states.
 * @returns the disposition and the refined signals/reasons.
 */
export function classifyAction(action: UnifiedAction, tier: ReviewTier = action.tier): Classification {
  const signals = [...action.signals]
  const reasons: string[] = []
  const facts = targetFacts(action)

  // 1. Establish-or-review: an unestablished scope is never exempt. A
  //    write/edit with NO target at all is unestablished too — an empty
  //    `targets` array must not slip through `some`/`every` vacuous truth
  //    (T02 review F01).
  const targetlessMutation = (action.effect === 'write' || action.effect === 'edit') && action.targets.length === 0
  if (
    facts.anyUnknownScope
    || targetlessMutation
    || action.targets.some(target => target.state === undefined && action.effect !== 'meta' && action.effect !== 'read' && action.effect !== 'network')
  ) {
    if (!signals.includes('scope-unknown')) signals.push('scope-unknown')
    reasons.push('target scope or state could not be established')
  }

  // 2. Refine the mass-clear candidate against observed state: emptying an
  //    EXISTING file is always the risk (T08 红队 §1b — a small state file
  //    like `.git/HEAD` or `.nvmrc` is not harmless because it is short);
  //    the trivial-file exemption only ever applies to NEW files.
  if (signals.includes('mass-clear')) {
    if (facts.anyExisting) {
      reasons.push('empties existing file content')
    } else {
      const index = signals.indexOf('mass-clear')
      signals.splice(index, 1)
    }
  }

  // 3. Important-content replacement (edit over most of an existing file).
  if (facts.importantReplacement && !signals.includes('important-replacement')) {
    signals.push('important-replacement')
    reasons.push('replaces most of an existing file\'s content')
  }

  // A write replaces the entire file. Existence/size alone cannot prove that
  // a non-empty replacement preserves important content, even at equal size.
  // New files and verified empty files have no old content to overwrite;
  // ordinary small edits retain their exemption below. Missing size evidence
  // routes to review rather than treating an existing file as empty.
  if (action.effect === 'write' && action.targets.some(target => target.state?.exists
    && (target.state.kind !== 'file' || target.state.sizeBytes !== 0))) {
    signals.push('unverified-overwrite')
    reasons.push('whole-file write overwrites existing content without a verified content comparison')
  }

  // Git control changes must be reviewed before later evidence collection can
  // consume the resulting configuration. Check the action too, not only an
  // adapter's risk flags, so every file-mutation adapter shares the boundary.
  if ((action.effect === 'write' || action.effect === 'edit' || action.effect === 'delete')
    && action.targets.some(target => isGitControlPath(target.rawPath, action.cwd))) {
    signals.push('git-control-change')
    reasons.push('changes Git metadata or configuration that can affect execution or external destinations')
  }

  // 4. Anything the tool adapters could not recognize is review.
  if (action.effect === 'unknown') {
    reasons.push('unrecognized tool or adapter')
  }

  // 5. Any remaining signal sends the call to review (sensitive naming is a
  //    ROUTING signal, never an auto-denial).
  if (signals.length > 0) {
    return { disposition: 'review', signals, reasons: [...reasons, `risk signals: ${signals.join(', ')}`] }
  }

  // 6. Effect-based exemptions.
  switch (action.effect) {
    case 'read':
    case 'meta':
      return { disposition: 'exempt', signals, reasons: ['ordinary read/bookkeeping'] }
    case 'write':
    case 'edit':
      // Non-empty targets are required: `every` on an empty array is vacuously
      // true and would exempt a targetless mutation (T02 review F01).
      if (action.targets.length > 0 && action.targets.every(target => target.scope === 'inside')) {
        return { disposition: 'exempt', signals, reasons: ['ordinary in-workspace file edit'] }
      }
      return { disposition: 'review', signals, reasons: ['file target outside the workspace or not established'] }
    case 'network':
      // 终审 Major 3: web_fetch/web_search SEND data to a remote endpoint —
      // an exfiltration channel the llm/stream guard cannot see. Reviewed in
      // BOTH tiers; the query/URL itself is outbound data.
      return {
        disposition: 'review',
        signals,
        reasons: [`network access sends data to an external endpoint — reviewed in every tier (current tier: ${tier})`],
      }
    case 'execute':
      return { disposition: 'review', signals, reasons: ['execution effects are the review focus'] }
    case 'delegate':
      return { disposition: 'review', signals, reasons: ['delegated actions get their own verdict'] }
    default:
      return { disposition: 'review', signals, reasons: ['unclassified effect'] }
  }
}
