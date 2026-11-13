/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T02).
 *
 * Tool adapter table: maps one tool call's name and arguments onto the
 * unified-action vocabulary — effect, sub-operation, raw targets — WITHOUT
 * deciding anything. Sub-operations of one tool are recognized separately
 * (e.g. edit's replace vs create); an unrecognized tool maps to `unknown`,
 * which the classifier always sends to review.
 */
import type { ActionEffect, ActionOrigin, RiskSignal } from './types.ts'
import { shellRiskSignals } from '../evidence/shell-signals.ts'
import { isSensitivePathText } from '../evidence/sensitive.ts'

/** What the adapter extracts from one call's arguments. */
export interface RecognizedCall {
  readonly effect: ActionEffect
  readonly subOperation?: string
  /** Path arguments as written (raw evidence; resolution is the evidence layer's job). */
  readonly rawPaths: readonly string[]
  /** Argument-level signals (shell patterns, empty-content markers, egress verbs). */
  readonly signals: readonly RiskSignal[]
  /** For shell calls: the command text (evidence, redacted before review). */
  readonly commandText?: string
}

export interface RecognizeOptions {
  /**
   * MCP adapters the user has explicitly verified (task-doc rule: an MCP
   * read-only CLAIM is not enough; only verified adapters may be exempted).
   * Maps `mcp__<server>__<tool>` to the effect the verification established.
   */
  readonly verifiedMcpTools?: Readonly<Record<string, ActionEffect>>
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function stringArg(record: Record<string, unknown>, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = record[name]
    if (typeof value === 'string') return value
  }
  return undefined
}

function pathsFrom(record: Record<string, unknown>, ...names: string[]): string[] {
  const paths: string[] = []
  for (const name of names) {
    const value = record[name]
    if (typeof value === 'string' && value.trim() !== '') paths.push(value)
    if (Array.isArray(value)) {
      for (const entry of value) if (typeof entry === 'string' && entry.trim() !== '') paths.push(entry)
    }
  }
  return paths
}

/** Path-carrying signal check shared by the file tools. */
function pathSignals(paths: readonly string[]): RiskSignal[] {
  return paths.some(path => isSensitivePathText(path)) ? ['sensitive-candidate'] : []
}

/**
 * Recognize one tool call.
 * @param toolName - the registered tool name.
 * @param args - the host-frozen argument snapshot (read-only here).
 * @param options - adapter options (verified MCP adapters).
 * @returns the normalized extraction; `effect: 'unknown'` for unrecognized tools.
 */
export function recognizeCall(toolName: string, args: unknown, options: RecognizeOptions = {}): RecognizedCall {
  const record = asRecord(args)

  switch (toolName) {
    case 'read':
    case 'read_image': {
      const paths = pathsFrom(record, 'file_path', 'path', 'target_path')
      return { effect: 'read', subOperation: 'view', rawPaths: paths, signals: pathSignals(paths) }
    }
    case 'glob':
    case 'grep': {
      const paths = pathsFrom(record, 'path')
      return { effect: 'read', subOperation: 'search', rawPaths: paths, signals: pathSignals(paths) }
    }
    case 'write': {
      const paths = pathsFrom(record, 'file_path', 'path')
      const content = stringArg(record, 'content') ?? ''
      const signals = [...pathSignals(paths)]
      // Empty content on a write is the mass-clear candidate; the classifier
      // confirms it against the observed target state.
      if (content.trim() === '') signals.push('mass-clear')
      return { effect: 'write', subOperation: content.trim() === '' ? 'clear' : 'create-or-overwrite', rawPaths: paths, signals }
    }
    case 'edit': {
      const paths = pathsFrom(record, 'file_path', 'path')
      const oldString = stringArg(record, 'old_string') ?? ''
      const newString = stringArg(record, 'new_string') ?? ''
      const signals = [...pathSignals(paths)]
      let subOperation = 'replace'
      if (oldString === '' && newString !== '') subOperation = 'create'
      if (newString.trim() === '' && oldString.trim() !== '') {
        subOperation = 'clear'
        signals.push('mass-clear')
      }
      // Replacing a large existing fragment is the "important content" case;
      // size thresholds are applied by the classifier with target state.
      return { effect: 'edit', subOperation, rawPaths: paths, signals }
    }
    case 'pwsh':
    case 'bash': {
      const command = stringArg(record, 'command') ?? ''
      const signals = shellRiskSignals(command)
      if (record['run_in_background'] === true) signals.push('background-execution')
      // Redirect targets are OBSERVED change targets (T08 红队 §5a): a shell
      // `> file` writes without a write tool call — best-effort extraction so
      // the delivery check is not blind to shell-authored files.
      const rawPaths: string[] = []
      for (const match of command.matchAll(/>{1,2}\s*"?([^\s";|>&]+)"?/gu)) {
        const target = match[1]
        if (target !== undefined && !target.startsWith('/dev/')) rawPaths.push(target)
      }
      return { effect: 'execute', subOperation: 'shell', rawPaths, signals, commandText: command }
    }
    case 'run_code':
    case 'workflow': {
      return { effect: 'execute', subOperation: toolName === 'run_code' ? 'ptc-outer' : 'workflow', rawPaths: [], signals: ['opaque-execution'] }
    }
    case 'subagent':
    case 'subagent_fork':
    case 'delegate': {
      // `delegate` is the native library-preset delegation tool (T02 review
      // F04): same delegation semantics as subagent spawn/fork, and still
      // always reviewed (delegates get their own verdict).
      const subOperation = toolName === 'subagent' ? 'spawn' : toolName === 'subagent_fork' ? 'fork' : 'delegate'
      return { effect: 'delegate', subOperation, rawPaths: [], signals: [] }
    }
    case 'send_message': {
      return { effect: 'delegate', subOperation: 'message', rawPaths: [], signals: [] }
    }
    case 'web_search': {
      return { effect: 'network', subOperation: 'search', rawPaths: [], signals: [] }
    }
    case 'web_fetch': {
      return { effect: 'network', subOperation: 'fetch', rawPaths: [], signals: [] }
    }
    case 'job_kill':
    case 'interrupt_agent': {
      return { effect: 'meta', subOperation: 'stop', rawPaths: [], signals: ['system-change'] }
    }
    case 'working_directory': {
      // NOT exempt bookkeeping (T08 红队 §1d): changing the working directory
      // shifts what counts as "inside the workspace" for every later exempt
      // write — a scope change is reviewed like any other.
      return { effect: 'meta', subOperation: 'scope-change', rawPaths: [], signals: ['scope-change'] }
    }
    case 'todo_write':
    case 'create_goal':
    case 'update_goal':
    case 'get_goal':
    case 'exit_plan_mode':
    case 'skill':
    case 'list_agents':
    case 'job_list':
    case 'job_output':
    case 'second_look_finalize': {
      // `second_look_finalize` is this plugin's own delivery report (T05): read-only
      // bookkeeping, exempt from review like other meta tools.
      return { effect: 'meta', subOperation: 'bookkeeping', rawPaths: [], signals: [] }
    }
    default: {
      // MCP adapters: verified ones map to their established effect; anything
      // else (unverified adapters, future tools) is `unknown` → review.
      if (toolName.startsWith('mcp__')) {
        const verified = options.verifiedMcpTools?.[toolName]
        if (verified !== undefined) {
          return { effect: verified, subOperation: 'verified-adapter', rawPaths: [], signals: [] }
        }
        return { effect: 'unknown', subOperation: 'unverified-adapter', rawPaths: [], signals: ['unverified-adapter', 'unknown-tool'] }
      }
      return { effect: 'unknown', rawPaths: [], signals: ['unknown-tool'] }
    }
  }
}

/** Origins implied by the call shape (the pipeline also knows from `parent`). */
export function originOf(toolName: string, isPtcInner: boolean): ActionOrigin {
  if (isPtcInner) return 'ptc-inner'
  if (toolName.startsWith('mcp__')) return 'mcp'
  if (toolName === 'subagent' || toolName === 'subagent_fork' || toolName === 'delegate') return 'subagent'
  return 'native'
}
