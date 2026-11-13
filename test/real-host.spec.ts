import { createServer } from 'node:net'
import { mkdtemp, writeFile, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
/** Production rc.5 services and real agent loop; only provider responses are scripted. */
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { LlmAdapter, createUserMessage, ToolCallId, ReasoningEffortId, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore, { Session, SessionId } from '@deepseek-ai/dsh-session'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import ApprovalService, { setApprovalPolicy } from '@deepseek-ai/dsh-user-approval'
import PermissionPresets from '@deepseek-ai/dsh-permission-presets'
import FsLocal from '@deepseek-ai/dsh-fs-local'
import WorkingDirectory from '@deepseek-ai/dsh-working-directory'
import { WebServer } from '@deepseek-ai/dsh-host-webserver'
import { FileSettingsPersistence, type SettingsPersistence } from '../src/settings/persistence.ts'
import { FileAuditPersistence, type AuditPersistence } from '../src/settings/audit.ts'
import { mountPermissionPresets } from '../src/gate/register-presets.ts'
const bundlePath = '../lib/index.js'
const { mountGate, resolveConfig, MemorySettingsPersistence } = process.env.SECOND_LOOK_TEST_BUNDLE === '1'
  ? await import(bundlePath) as typeof import('../src/index.ts')
  : await import('../src/index.ts')

// Let the OS select an ephemeral test port; host port=0 picks its own random
// low port, which can hit fetch's forbidden-port list and make HTTP tests flaky.
async function availablePort(): Promise<number> {
  const socket = createServer()
  await new Promise<void>((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve) })
  const port = (socket.address() as { port: number }).port
  await new Promise<void>((resolve, reject) => socket.close(error => error ? reject(error) : resolve()))
  return port
}
const contexts: Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })
function textChunks(text: string): StreamChunk[] {
  return [{ type: 'block-start', index: 0, blockType: 'text' }, { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } }, { type: 'finish', reason: { kind: 'stop' } }]
}
function callChunks(id: string, name = 'pwsh'): StreamChunk[] {
  const args = JSON.stringify({ command: 'Write-Output "dsh-second-look tool-call test ok"' })
  return [{ type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id: ToolCallId(id), name, argumentsDelta: args },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id: ToolCallId(id), name, arguments: args } },
    { type: 'finish', reason: { kind: 'tool-calls' } }]
}
async function host(decision: 'allow' | 'deny' | 'ask_user' = 'allow', cwd = process.cwd(), persistence: SettingsPersistence = new MemorySettingsPersistence(), realShell = false, auditPersistence?: AuditPersistence) {
  const ctx = new Context()
  contexts.push(ctx)
  for (const plugin of [LlmRuntime, SessionStore, SessionProjections, SystemPrompt, FsLocal, WorkingDirectory]) await ctx.plugin(plugin as never, {} as never)
  await ctx.plugin(ToolRuntime, { mode: 'native' })
  await ctx.plugin(AgentRegistry)
  ctx.provide('shell', { sandboxMode: 'danger-full-access' } as never)
  await ctx.plugin(ApprovalService, { policy: 'ask' })
  await ctx.plugin(PermissionPresets, { presets: {
    'read-only': { sandbox: 'read-only', approval: 'ask' },
    'workspace-write': { sandbox: 'workspace-write', approval: 'ask' },
    'danger-full-access': { sandbox: 'danger-full-access', approval: 'never' },
  }, defaultPreset: 'danger-full-access' })
  mountPermissionPresets(ctx)
  const requests: GenerateOptions[] = []
  let script: StreamChunk[][] = []
  let reviewerOverride: ((options: GenerateOptions) => AsyncIterable<StreamChunk>) | undefined
  class Adapter extends LlmAdapter {
    override async resolveModel(provider: string, model: string) {
      return { ...await super.resolveModel(provider, model), reasoning: { efforts: [{ id: ReasoningEffortId('high'), name: 'High' }] } }
    }
    override async *stream(options: GenerateOptions) {
      requests.push(options)
      if (options.provider === 'review-test' && reviewerOverride) { yield* reviewerOverride(options); return }
      if (options.provider === 'review-test') yield* textChunks(JSON.stringify({ decision, reason: decision === 'deny' ? 'test disclosure or action is not authorized' : 'test action is safe', question: 'allow once?' }))
      else yield* (script.shift() ?? textChunks('继续处理安全任务，受限内容没有发送。'))
    }
  }
  ctx.llm.registerAdapter(['main-test', 'review-test'], new Adapter())
  let executed = 0
  ctx.tools.register({ name: 'pwsh', description: 'harmless marker', parameters: { type: 'object', properties: { command: { type: 'string' } } },
    output: { schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }, render: (_args, value) => [{ type: 'text', text: String((value as { text: string }).text) }] },
    async execute() {
      executed++
      if (realShell) {
        const { stdout } = await promisify(execFile)('pwsh.exe', ['-NoProfile', '-Command', 'Write-Output "dsh-second-look tool-call test ok"'], { timeout: 5000, windowsHide: true })
        return { text: stdout.trim() }
      }
      return { text: 'dsh-second-look tool-call test ok' }
    },
  })
  const gate = mountGate(ctx, resolveConfig({ reviewerModelProvider: 'review-test', reviewerModel: 'reviewer' }), { settingsPersistence: persistence, auditPersistence })
  ctx.effect(() => () => gate.dispose())
  await ctx.plugin(AgentLoop, { agents: [] })
  const agent = await ctx.agentLoop.create(SessionId(`health-${Math.random()}`), { provider: 'main-test', model: 'main' }, { cwd })
  ctx.permissionPresets.set(agent.session, 'second-look-daily')
  const turn = async (text: string, chunks: StreamChunk[][] = [], target: Pick<typeof agent, 'session' | 'followup' | 'whenIdle'> = agent) => {
    script = chunks
    const before = target.session.seq
    target.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
    await target.whenIdle()
    return target.session.snapshotEvents(before)
  }
  return { ctx, agent, gate, requests, turn, executed: () => executed, setReviewer: (fn: (options: GenerateOptions) => AsyncIterable<StreamChunk>) => { reviewerOverride = fn } }
}

describe('real rc.5 host pipeline', () => {
  it('keeps native custom approval human-controlled until an explicit review selection', async () => {
    const h = await host('allow')
    h.ctx.permissionPresets.set(h.agent.session, 'danger-full-access')
    setApprovalPolicy(h.agent.session, 'ask')
    let humanRequests = 0
    // This fixture's marker tool has no native preflight; model a native
    // ask-producing tool downstream of the gate using the real tool seam.
    h.ctx.on('tools/pre-execute', async () => ({ kind: 'ask' as const, reason: 'native tool requires confirmation' }))
    h.ctx.on('approval/request', async () => { humanRequests++; return 'rejected' as const })
    expect(h.ctx.permissionPresets.current(h.agent.session)).toBe('custom')
    await h.turn('native custom must ask a human', [callChunks('native-custom-human'), textChunks('not authorized')])
    expect(humanRequests).toBe(1)
    expect(h.executed()).toBe(0)
    expect(h.requests.filter(request => request.provider === 'review-test')).toHaveLength(0)
    h.ctx.permissionPresets.set(h.agent.session, 'second-look-daily')
    await h.turn('explicit review can now use the reviewer', [callChunks('explicit-daily'), textChunks('done')])
    expect(h.executed()).toBe(1)
    expect(h.requests.filter(request => request.provider === 'review-test')).toHaveLength(1)
  })
  it('follows host locale over HTTP for real human approval, prompt output language, and denial feedback', async () => {
    const h = await host('ask_user')
    await h.ctx.plugin(WebServer, { host: '127.0.0.1', port: await availablePort() })
    const origin = h.ctx.webServer.getOrigin()
    const locale = (language: string) => fetch(`${origin}/second-look/locale`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ language }) })
    const asks: string[] = []
    h.ctx.on('approval/request', async (request) => { asks.push(request.reason ?? ''); return 'rejected' })
    let decision = 'ask_user'
    h.setReviewer(async function* (options) {
      const zh = JSON.stringify(options).includes('Simplified Chinese')
      yield* textChunks(JSON.stringify({ decision, reason: zh ? '需要确认操作范围' : 'Confirm scope', question: zh ? '是否允许本次操作？' : 'Allow once?' }))
    })
    const beforeVersion = h.gate.status().configVersions
    expect((await locale('zh')).status).toBe(200)
    expect((await locale('invalid')).status).toBe(400)
    expect(h.gate.status().configVersions).toEqual(beforeVersion)
    await h.turn('ask in Chinese', [callChunks('locale-zh'), textChunks('继续')])
    expect(asks.at(-1)).toContain('[过目]'); expect(asks.at(-1)).toContain('是否允许本次操作')
    const zhRequest = h.requests.find(r => r.provider === 'review-test')!
    expect(zhRequest.system).toContain('Simplified Chinese')
    expect(JSON.stringify(zhRequest.messages)).toContain('Output language: Simplified Chinese')
    expect((await locale('en')).status).toBe(200)
    await h.turn('ask in English', [callChunks('locale-en'), textChunks('continue')])
    expect(asks.at(-1)).toContain('[Second Look]'); expect(asks.at(-1)).toContain('Allow once?')
    decision = 'deny'; await locale('zh')
    const denied = await h.turn('deny in Chinese', [callChunks('locale-deny'), textChunks('继续')])
    const feedback = JSON.stringify(denied.filter(e => e.type === 'tool/result'))
    expect(feedback).toContain('[过目]'); expect(feedback).toContain('不要绕过此次拒绝'); expect(feedback).not.toContain('[second-look]')
    expect(h.executed()).toBe(0)
  })
  it('restores denied tool and outbound records over real HTTP and clears each history independently', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'second-look-blocked-host-'))
    try {
      const first = await host('deny', process.cwd(), new MemorySettingsPersistence(), false, new FileAuditPersistence(dir))
      await first.turn('deny a tool', [callChunks('durable-denial'), textChunks('continue')])
      await first.turn('do not publish token=FAKE_HOST_SECRET_12345678')
      expect(first.gate.audit.blockedRecent().some(r => r.decision === 'deny')).toBe(true)
      expect(first.gate.audit.blockedRecent().some(r => r.decision === 'outbound-blocked')).toBe(true)
      await first.ctx.fiber.dispose(); contexts.splice(contexts.indexOf(first.ctx), 1)
      const second = await host('allow', process.cwd(), new MemorySettingsPersistence(), false, new FileAuditPersistence(dir))
      await second.ctx.plugin(WebServer, { host: '127.0.0.1', port: await availablePort() })
      const origin = second.ctx.webServer.getOrigin()
      const get = async () => await (await fetch(`${origin}/second-look/audit?limit=500`)).json() as { records: unknown[]; blockedRecords: { decision: string; reason: string }[] }
      let result = await get()
      expect(result.records).toHaveLength(0)
      expect(result.blockedRecords.some(r => r.decision === 'deny')).toBe(true)
      expect(JSON.stringify(result)).not.toContain('FAKE_HOST_SECRET_12345678')
      const clear = async (scope: string) => await fetch(`${origin}/second-look/audit/clear`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ confirm: true, scope }) })
      expect((await clear('recent')).status).toBe(200)
      expect((await get()).blockedRecords.length).toBeGreaterThan(0)
      expect((await clear('invalid')).status).toBe(400)
      expect((await clear('blocked')).status).toBe(200)
      result = await get(); expect(result.blockedRecords).toHaveLength(0)
      expect(new FileAuditPersistence(dir).load()).toEqual([])
    } finally { await rm(dir, { recursive: true, force: true }) }
  })
  it('isolates explicit tiers and replays both choices in a fresh permission service', async () => {
    const h = await host()
    const other = await h.ctx.agentLoop.create(SessionId('independent-tier'), { provider: 'main-test', model: 'main' }, { cwd: process.cwd() })
    h.ctx.permissionPresets.set(h.agent.session, 'second-look-daily')
    h.ctx.permissionPresets.set(other.session, 'second-look-strict')
    expect(h.gate.getTier(String(h.agent.id))).toBe('daily')
    expect(h.gate.getTier(String(other.id))).toBe('strict')
    h.gate.settings.update({ defaultTier: 'strict', reviewerReasoningEffort: 'high' })
    expect(h.gate.getTier(String(h.agent.id))).toBe('daily')
    expect(h.gate.getTier(String(other.id))).toBe('strict')
    const fresh = await host()
    for (const source of [h.agent.session, other.session]) {
      const replay = Session.create(source.id, source.snapshotEvents(), source.header)
      expect(fresh.ctx.permissionPresets.current(replay)).toBe(h.ctx.permissionPresets.current(source))
    }
  })

  it('voids an in-flight allow even when the user switches daily to strict and back', async () => {
    const h = await host()
    h.ctx.permissionPresets.set(h.agent.session, 'second-look-daily')
    let entered!: () => void
    const reviewing = new Promise<void>(resolve => { entered = resolve })
    let release!: () => void
    const released = new Promise<void>(resolve => { release = resolve })
    h.setReviewer(async function* () { entered(); await released; yield* textChunks('{"decision":"allow","reason":"old decision"}') })
    const running = h.turn('review now', [callChunks('old-tier'), textChunks('old call cancelled')])
    await reviewing
    h.ctx.permissionPresets.set(h.agent.session, 'second-look-strict')
    h.ctx.permissionPresets.set(h.agent.session, 'second-look-daily')
    release()
    await running
    expect(h.executed()).toBe(0)
    expect(h.gate.status().pendingEntries).toBe(0)
    h.setReviewer(async function* () { yield* textChunks('{"decision":"allow","reason":"fresh decision"}') })
    await h.turn('new call', [callChunks('new-tier'), textChunks('done')])
    expect(h.executed()).toBe(1)
  }, 3000)

  it('inherits the parent tier across grandchildren and cancels child review on parent switch', async () => {
    const h = await host()
    h.ctx.permissionPresets.set(h.agent.session, 'second-look-strict')
    const child = await h.ctx.agents.create({ sessionId: SessionId('tier-child'), parentAgent: h.agent,
      meta: { cwd: process.cwd(), origin: 'subagent', parentSession: h.agent.id }, agentOptions: { provider: 'main-test', model: 'main' } })
    const grandchild = await h.ctx.agents.create({ sessionId: SessionId('tier-grandchild'), parentAgent: child.agent,
      meta: { cwd: process.cwd(), origin: 'subagent', parentSession: child.agent.id }, agentOptions: { provider: 'main-test', model: 'main' } })
    setApprovalPolicy(child.agent.session, 'never')
    setApprovalPolicy(grandchild.agent.session, 'never')
    expect(h.gate.getTier(String(grandchild.agent.id))).toBe('strict')
    let entered!: () => void
    const reviewing = new Promise<void>(resolve => { entered = resolve })
    h.setReviewer(async function* () { entered(); await new Promise(() => {}); yield* textChunks('{}') })
    const running = h.turn('delegate review', [callChunks('grandchild-tier'), textChunks('cancelled')], grandchild.agent)
    await reviewing
    h.ctx.permissionPresets.set(h.agent.session, 'second-look-daily')
    await running
    expect(h.executed()).toBe(0)
    expect(h.gate.getTier(String(child.agent.id))).toBe('daily')
    expect(h.gate.getTier(String(grandchild.agent.id))).toBe('daily')
    h.setReviewer(async function* () { yield* textChunks('{"decision":"allow","reason":"new parent tier"}') })
    await h.turn('fresh delegated call', [callChunks('child-daily'), textChunks('done')], grandchild.agent)
    expect(h.executed()).toBe(1)
    expect(h.gate.audit.recent(30).some(r => r.sessionId === String(grandchild.agent.id) && r.tier === 'daily' && r.decision === 'allow')).toBe(true)
  }, 3000)

  it('settles a harmless tool, returns its result, and continues the same conversation', async () => {
    const h = await host('allow', process.cwd(), new MemorySettingsPersistence(), process.platform === 'win32')
    h.gate.settings.update({ reviewerReasoningEffort: 'high' })
    const events = await h.turn('run the harmless marker', [callChunks('marker-1'), textChunks('执行成功')])
    expect(h.executed()).toBe(1)
    expect(events.some(e => e.type === 'tool/result' && e.data.message.isError === false)).toBe(true)
    expect(h.requests.filter(r => r.provider === 'review-test')).toHaveLength(1)
    expect(h.requests.find(r => r.provider === 'review-test')?.reasoningEffort).toBe('high')
    expect(h.requests.find(r => r.provider === 'review-test')).not.toHaveProperty('maxTokens')
    expect(h.requests.find(r => r.provider === 'review-test')).not.toHaveProperty('maxOutputTokens')
    expect(JSON.stringify(h.requests.find(r => r.provider === 'review-test')?.messages)).toContain('Write-Output')
    expect(h.agent.status).toBe('idle')
    expect(JSON.stringify(await h.turn('continue'))).toContain('继续处理安全任务')
  })
  it('returns denial reason as a tool result and continues without executing the tool', async () => {
    const h = await host('deny')
    const events = await h.turn('test denial', [callChunks('denied-1'), textChunks('已收到拒绝原因，继续其他工作')])
    expect(h.executed()).toBe(0)
    expect(JSON.stringify(events.filter(e => e.type === 'tool/result'))).toContain('not authorized')
    expect(JSON.stringify(events)).toContain('继续其他工作')
    expect(h.gate.status().pendingEntries).toBe(0)
  })
  it('protects the FIRST outbound request, redacts a refused disclosure, and survives repeated followups', async () => {
    const h = await host('deny')
    const secret = 'ghp_FAKE_HEALTH_SECRET_12345678'
    const events = await h.turn(`do not publish this token=${secret}`)
    expect(h.requests.filter(r => r.provider === 'review-test')).toHaveLength(1)
    expect(JSON.stringify(h.requests)).not.toContain(secret)
    expect(JSON.stringify(h.requests)).toContain('[REDACTED]')
    expect(JSON.stringify(events)).toContain('继续处理安全任务')
    await h.turn('why?')
    await h.turn('continue safely')
    expect(h.requests.filter(r => r.provider === 'main-test')).toHaveLength(3)
    expect(h.requests.filter(r => r.provider === 'review-test')).toHaveLength(1)
    expect(JSON.stringify(h.requests)).not.toContain(secret)
    expect(h.agent.status).toBe('idle')
  })
  it('repeatedly switches to every native preset and back without sticky interception', async () => {
    const h = await host('deny')
    await h.turn('token=FAKE_SWITCH_SECRET_123456')
    for (const native of ['danger-full-access', 'workspace-write', 'read-only', 'danger-full-access']) {
      h.ctx.permissionPresets.set(h.agent.session, native)
      expect(h.ctx.permissionPresets.current(h.agent.session)).toBe(native)
      const before = h.requests.length
      await h.turn(`continue in ${native}`)
      expect(h.requests.slice(before).every(r => r.provider === 'main-test')).toBe(true)
      // Native full-access intentionally sends its own unmodified context.
      expect(JSON.stringify(h.requests.at(-1)?.messages)).toContain('FAKE_SWITCH_SECRET_123456')
      h.ctx.permissionPresets.set(h.agent.session, 'second-look-daily')
      const gateBefore = h.requests.length
      await h.turn('back in second-look')
      expect(JSON.stringify(h.requests.slice(gateBefore))).not.toContain('FAKE_SWITCH_SECRET_123456')
    }
  })
  it('times out an uncooperative reviewer and returns to the main model instead of hanging', async () => {
    const h = await host()
    h.gate.settings.update({ totalTimeoutMsDaily: 30 })
    h.setReviewer(async function* () { await new Promise(() => {}); yield* textChunks('{}') })
    const events = await h.turn('test unavailable reviewer', [callChunks('timeout-1'), textChunks('审核超时，命令未执行')])
    expect(h.executed()).toBe(0)
    expect(JSON.stringify(events)).toContain('审核超时，命令未执行')
    expect(h.gate.status().pendingEntries).toBe(0)
  }, 2000)
  it('cancels an in-flight review when the user switches to native full access; the next tool uses native rules', async () => {
    const h = await host()
    let entered!: () => void
    const reviewing = new Promise<void>(resolve => { entered = resolve })
    h.setReviewer(async function* () { entered(); await new Promise(() => {}); yield* textChunks('{}') })
    const running = h.turn('start review', [callChunks('switch-pending'), textChunks('已切换，旧调用未执行')])
    await reviewing
    h.ctx.permissionPresets.set(h.agent.session, 'danger-full-access')
    const events = await running
    expect(h.executed()).toBe(0)
    expect(JSON.stringify(events)).toContain('旧调用未执行')
    await h.turn('run the next harmless command', [callChunks('native-after-switch'), textChunks('原生模式正常')])
    expect(h.executed()).toBe(1)
  }, 2000)
  it('uses the effective working directory instead of the immutable session header', async () => {
    const h = await host()
    h.agent.session.append('working-directory/change', { cwd: dirname(process.cwd()) })
    await h.turn('run marker', [callChunks('cwd-1'), textChunks('done')])
    expect(JSON.stringify(h.requests.find(r => r.provider === 'review-test')?.messages)).toContain(JSON.stringify(`Workspace: ${dirname(process.cwd())}`).slice(1, -1))
  })

  it('reviews untracked content at delivery, isolates sessions, and never covers omitted files', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'second-look-host-'))
    try {
      await promisify(execFile)('git', ['init', '--quiet', cwd])
      await writeFile(join(cwd, 'new.ts'), 'export const uniqueHealthMarker = 42;')
      const h = await host('allow', cwd)
      h.gate.setTier(String(h.agent.id), 'strict')
      const events = await h.turn('finalize code changes', [callChunks('finalize-first', 'second_look_finalize'), textChunks('done')])
      const review = h.requests.find(r => r.provider === 'review-test')
      expect(JSON.stringify(review?.messages)).toContain('uniqueHealthMarker')
      const results = events.filter(e => e.type === 'tool/result')
      expect(JSON.stringify(results)).toContain('all observed changes are covered')
      const other = await h.ctx.agentLoop.create(SessionId('second-independent-session'), { provider: 'main-test', model: 'main' }, { cwd })
      h.ctx.permissionPresets.set(other.session, 'second-look-daily')
      h.gate.setTier(String(other.id), 'strict')
      const before = h.requests.length
      await h.ctx.tools.execute({ callId: ToolCallId('finalize-other'), name: 'second_look_finalize', arguments: {}, agent: other, signal: new AbortController().signal })
      const secondReview = h.requests.slice(before).find(r => r.provider === 'review-test')
      expect(JSON.stringify(secondReview?.messages)).toContain('uniqueHealthMarker')
      expect(JSON.stringify(secondReview?.messages)).not.toContain('VERIFIED unchanged')
      await writeFile(join(cwd, 'huge.ts'), 'x'.repeat(30000))
      const omitted = await h.turn('finalize again', [callChunks('finalize-omitted', 'second_look_finalize'), textChunks('coverage incomplete')])
      expect(JSON.stringify(omitted.filter(e => e.type === 'tool/result'))).toContain('NOT fully covered')
      expect(JSON.stringify(omitted.filter(e => e.type === 'tool/result'))).toContain('huge.ts')
    } finally { await rm(cwd, { recursive: true, force: true }) }
  })

  it('does not execute repository fsmonitor before a denied strict review or send sensitive batch content', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'second-look-review-safety-'))
    const git = async (...args: string[]) => promisify(execFile)('git', args, { cwd, windowsHide: true })
    try {
      await git('init', '-q')
      await writeFile(join(cwd, 'normal.ts'), 'export const ordinaryBatchMarker = 42;')
      await git('add', 'normal.ts')
      const fakeToken = 'npm_' + 'Q'.repeat(50)
      await writeFile(join(cwd, '.npmrc'), '_authToken=' + fakeToken)
      await writeFile(join(cwd, '.git', 'fsmonitor-test'), '#!/bin/sh\nprintf touched > fsmonitor-ran\nprintf "\\0"\n', { mode: 0o755 })
      await git('config', 'core.fsmonitor', '.git/fsmonitor-test')
      const h = await host('deny', cwd)
      h.ctx.permissionPresets.set(h.agent.session, 'second-look-strict')
      await h.turn('run a command requiring review', [callChunks('deny-batch'), textChunks('denied')])
      expect(h.executed()).toBe(0)
      await expect(access(join(cwd, 'fsmonitor-ran'))).rejects.toMatchObject({ code: 'ENOENT' })
      const reviewed = JSON.stringify(h.requests.filter(r => r.provider === 'review-test'))
      expect(reviewed).toContain('ordinaryBatchMarker')
      expect(reviewed).not.toContain(fakeToken)
    } finally { await rm(cwd, { recursive: true, force: true }) }
  })

  it('serves real HTTP after late webserver injection and persists the reviewer across host recreation', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'second-look-settings-'))
    try {
      const first = await host('allow', process.cwd(), new FileSettingsPersistence(dir))
      await first.ctx.plugin(WebServer, { host: '127.0.0.1', port: await availablePort() })
      const origin = first.ctx.webServer.getOrigin()
      expect((await fetch(`${origin}/second-look/status`)).status).toBe(200)
      await first.turn('harmless audit check', [callChunks('audit-marker'), textChunks('done')])
      const audit = await (await fetch(`${origin}/second-look/audit?limit=500`)).json() as { records: { sessionId: string; callId: string }[] }
      expect(audit.records.some(r => r.sessionId === String(first.agent.id) && r.callId === 'audit-marker')).toBe(true)
      const clear = await fetch(`${origin}/second-look/audit/clear`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: true }) })
      expect(clear.status).toBe(200)
      expect((await (await fetch(`${origin}/second-look/audit`)).json() as { records: unknown[] }).records).toEqual([])
      const saved = await fetch(`${origin}/second-look/config`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reviewerModel: 'persisted-reviewer', totalTimeoutMsDaily: 1234 }) })
      expect(saved.status).toBe(200)
      const ambiguous = await fetch(`${origin}/second-look/tier`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tier: 'strict' }) })
      expect(ambiguous.status).toBe(400)
      await first.ctx.fiber.dispose()
      contexts.splice(contexts.indexOf(first.ctx), 1)
      const second = await host('allow', process.cwd(), new FileSettingsPersistence(dir))
      await second.ctx.plugin(WebServer, { host: '127.0.0.1', port: await availablePort() })
      const readback = await (await fetch(`${second.ctx.webServer.getOrigin()}/second-look/config`)).json() as { reviewerModel: string; daily: { totalTimeoutMs: number } }
      expect(readback.reviewerModel).toBe('persisted-reviewer')
      expect(readback.daily.totalTimeoutMs).toBe(1234)
      expect(second.gate.status().reviewer).toBe('review-test/persisted-reviewer')
    } finally { await rm(dir, { recursive: true, force: true }) }
  })

  it('reviews real delegated calls despite child approval=never and returns a sourced parent notice', async () => {
    const h = await host('ask_user')
    const child = await h.ctx.agents.create({ sessionId: SessionId('health-child'), parentAgent: h.agent,
      meta: { cwd: process.cwd(), origin: 'subagent', parentSession: h.agent.id }, agentOptions: { provider: 'main-test', model: 'main' } })
    setApprovalPolicy(child.agent.session, 'never')
    const events = await h.turn('perform a delegated marker', [callChunks('child-action'), textChunks('I will ask the parent before retrying')], child.agent)
    const result = events.filter(e => e.type === 'tool/result')
    expect(JSON.stringify(result)).toContain('"isError":true')
    expect(h.executed()).toBe(0)
    expect(JSON.stringify(result)).toContain('NOT executed')
    const notices = h.agent.session.snapshotEvents().filter(e => e.type === 'agent/inbox/spliced')
    expect(JSON.stringify(notices)).toContain('second-look-relay')
    expect(h.requests.filter(r => r.provider === 'review-test')).toHaveLength(1)
    h.ctx.permissionPresets.set(h.agent.session, 'danger-full-access')
    await h.turn('run under the current native parent mode', [callChunks('child-native'), textChunks('native child completed')], child.agent)
    expect(h.executed()).toBe(1)
    expect(h.requests.filter(r => r.provider === 'review-test')).toHaveLength(1)
  })

})
