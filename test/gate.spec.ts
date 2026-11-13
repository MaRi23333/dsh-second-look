/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T04).
 *
 * The gate integration against a MOCK host seam bus and a simulated reviewer:
 * exempt pass-through, reviewer-allow settlement through the real answerer
 * route, deny + model-visible boundary text, ask_user → the human chain
 * settling the SAME call without re-review, failure → human (default),
 * hostile short-call short-circuit denial, concurrent-call isolation,
 * cancellation (never a human question), subagent paths (direct settle /
 * ask relay, never a silent grant), tier-change invalidation and the
 * unhealthy fail-closed guard. Execution counts are asserted via the guard's
 * single-use ledger — the same evidence model the real-host runs use.
 */
import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { Session, SESSION_FORMAT_VERSION, SessionId } from '@deepseek-ai/dsh-session'
import {
  comparablePath,
  lexicalResolve,
  mountGate,
  resolveConfig,
  scanOutbound,
  type ExecLike,
  type GateSeamsLike,
  type PreExecuteDecision,
  type ProbeFileSystem,
  type ReviewerVerdict,
} from '../src/index.ts'
import { MemorySettingsPersistence, type SettingsPersistence } from '../src/index.ts'
import { makeLlm, makeSubagents, appendRequestHeader, type ScriptedReview } from './harness.ts'

const WORKSPACE = path.resolve('work')

function makeSession(id = 'gate-session', extra: Record<string, unknown> = {}): Session {
  return Session.create(SessionId(id), undefined, {
    version: SESSION_FORMAT_VERSION,
    id: SessionId(id),
    createdAt: 0,
    cwd: WORKSPACE,
    isSeeded: false,
    ...extra,
  } as never)
}

/** A tiny seam bus capturing the handlers `mountGate` wires. */
function seamBus() {
  const handlers = new Map<string, ((...args: unknown[]) => unknown)[]>()
  let guardFn: ((exec: ExecLike) => string | undefined) | undefined
  const bus: GateSeamsLike & {
    pre(exec: ExecLike): Promise<unknown>
    ask(req: unknown, downstream: () => Promise<string>): Promise<unknown>
    post(exec: unknown, result: unknown, downstream: () => Promise<unknown>): Promise<unknown>
    stream(payload: Record<string, unknown>): Promise<{ sent: number }>
    guard(exec: ExecLike): string | undefined
  } = {
    on(name: string, handler: (...args: never[]) => unknown) {
      const list = handlers.get(name) ?? []
      list.push(handler as (...args: unknown[]) => unknown)
      handlers.set(name, list)
      return () => undefined
    },
    tools: {
      guard(fn: (exec: ExecLike) => string | undefined) {
        guardFn = fn
        return () => undefined
      },
    },
    get: () => undefined,
    async pre(exec: ExecLike) {
      const handler = handlers.get('tools/pre-execute')?.[0]
      return await (handler as (e: ExecLike, n: () => Promise<PreExecuteDecision>) => Promise<PreExecuteDecision>)(exec, async () => ({ kind: 'ask', reason: 'next-called' }))
    },
    async ask(req: unknown, downstream: () => Promise<string>) {
      const handler = handlers.get('approval/request')?.[0]
      return await (handler as (r: unknown, n: () => Promise<string>) => Promise<string>)(req, downstream)
    },
    async post(exec: unknown, result: unknown, downstream: () => Promise<unknown>) {
      const handler = handlers.get('tools/post-execute')?.[0]
      return await (handler as (e: unknown, r: unknown, n: () => Promise<unknown>) => Promise<unknown>)(exec, result, downstream)
    },
    async stream(payload: Record<string, unknown>) {
      const handler = handlers.get('llm/stream')?.[0] as
        | ((options: unknown, next: () => AsyncIterable<unknown>) => AsyncIterable<unknown>)
        | undefined
      if (handler === undefined) return { sent: 0 }
      let sent = 0
      const iterable = handler(
        { provider: 'deepseek-official', model: 'deepseek-flash', ...payload },
        async function* () {
          sent += 1
          yield { type: 'finish' }
        },
      )
      for await (const _chunk of iterable) void _chunk
      return { sent }
    },
    guard(exec: ExecLike) {
      return guardFn?.(exec)
    },
  }
  return bus
}

function probeFs(): ProbeFileSystem {
  const tree: Record<string, { type?: string; size?: number }> = { [comparablePath(WORKSPACE)]: { type: 'directory' } }
  return {
    async resolve(target: string, opts?: { cwd?: string }): Promise<string> {
      return lexicalResolve(opts?.cwd ?? WORKSPACE, target)
    },
    processPath: (target: string) => target,
    contains: (parent: string, child: string) => comparablePath(child).startsWith(comparablePath(parent)),
    async stat(target: string) {
      return tree[comparablePath(target)]
    },
    async lstat(target: string, opts?: { cwd?: string }) {
      return tree[comparablePath(lexicalResolve(opts?.cwd ?? WORKSPACE, target))]
    },
    async readText(): Promise<string> {
      return ''
    },
    async listDir(): Promise<string[]> {
      return []
    },
    async search(): Promise<readonly { file: string; line: number; text: string }[]> {
      return []
    },
  }
}

function config(overrides: Record<string, unknown> = {}) {
  return resolveConfig({
    reviewerProvider: 'mock',
    reviewerModel: 'review-model',
    reviewerModelProvider: 'review-provider',
    reviewerTimeoutMs: 2_000,
    ...overrides,
  })
}

function scriptOf(answers: readonly (ReviewerVerdict | ScriptedReview)[]): () => ScriptedReview {
  let index = 0
  return () => {
    const answer = answers[Math.min(index, answers.length - 1)]
    index += 1
    return (answer !== undefined && 'decision' in answer)
      ? { verdict: answer as ReviewerVerdict }
      : (answer as ScriptedReview)
  }
}

interface GateHarness {
  bus: ReturnType<typeof seamBus>
  llm: ReturnType<typeof makeLlm>
  handle: ReturnType<typeof mountGate>
  session: Session
}

function gateHarness(
  script: () => ScriptedReview,
  session: Session = makeSession(),
  preset: string | ((session: unknown) => string) = 'second-look-daily',
  overrides: Record<string, unknown> = {},
  settingsPersistence: SettingsPersistence = new MemorySettingsPersistence(),
): GateHarness {
  const ctx = new Context()
  ctx.provide('subagents', makeSubagents(script, undefined, { withStart: false }) as never)
  const llm = makeLlm(script)
  ctx.provide('llm', llm as never)
  const selected = new Map<unknown, string>()
  const fallback = typeof preset === 'function' ? preset : () => preset
  const current = (session: unknown) => selected.get(session) ?? fallback(session)
  ctx.provide('permissionPresets', { current, names: ['second-look-daily', 'second-look-strict'], set: (session: unknown, value: string) => { selected.set(session, value) } } as never)
  const bus = seamBus()
  const handle = mountGate(ctx, config(overrides), { fs: probeFs(), seams: bus, settingsPersistence })
  return { bus, llm, handle, session }
}

let callCounter = 0
function execOf(session: Session, name: string, args: unknown, over: Partial<ExecLike> = {}): ExecLike {
  callCounter += 1
  return {
    token: Symbol(`exec-${callCounter}`),
    callId: `call-${callCounter}`,
    name,
    arguments: args,
    agent: { session },
    signal: new AbortController().signal,
    ...over,
  }
}

const READ_EXEC = { name: 'read', args: { file_path: 'src/a.ts' } }
const SHELL_EXEC = { name: 'bash', args: { command: 'rm -rf build' } }
const ALLOW: ReviewerVerdict = { decision: 'allow', reason: 'covered by the task' }

describe('gate integration (T04)', () => {
  it('stays passive for sessions outside the gate preset', async () => {
    const { bus, llm } = gateHarness(scriptOf([ALLOW]), makeSession(), 'native-full')
    const decision = await bus.pre(execOf(makeSession(), READ_EXEC.name, READ_EXEC.args))
    expect(decision).toEqual({ kind: 'ask', reason: 'next-called' })
    expect(llm.calls.length).toBe(0)
  })

  it('lets ordinary reads pass without a reviewer and burns the allow once', async () => {
    const { bus, llm, session } = gateHarness(scriptOf([ALLOW]))
    const exec = execOf(session, READ_EXEC.name, READ_EXEC.args)
    expect(await bus.pre(exec)).toEqual({ kind: 'allow' })
    expect(llm.calls.length).toBe(0)
    expect(bus.guard(exec)).toBeUndefined()
    // single-use: the same execution cannot pass the guard twice
    expect(bus.guard(exec)).toContain('already consumed')
  })

  it('settles a reviewer allow through the answerer and executes exactly once', async () => {
    const { bus, llm, session } = gateHarness(scriptOf([ALLOW]))
    const exec = execOf(session, SHELL_EXEC.name, SHELL_EXEC.args)
    const decision = await bus.pre(exec) as PreExecuteDecision
    expect(decision.kind).toBe('ask')
    expect(llm.calls.length).toBe(1)
    const outcome = await bus.ask({ callId: exec.callId, toolName: exec.name, signal: exec.signal }, async () => 'unavailable')
    expect(outcome).toBe('allowed-once')
    expect(bus.guard(exec)).toBeUndefined()
    expect(bus.guard(exec)).toContain('already consumed')
  })

  it('denies with model-visible boundary text and never executes', async () => {
    const { bus, session } = gateHarness(scriptOf([{ decision: 'deny', reason: 'destroys the build tree' }]))
    const exec = execOf(session, SHELL_EXEC.name, SHELL_EXEC.args)
    await bus.pre(exec)
    const outcome = await bus.ask({ callId: exec.callId, toolName: exec.name }, async () => 'allowed-once')
    expect(outcome).toBe('rejected')
    expect(bus.guard(exec)).toContain('"rejected" is not an allow')
    const feedback = await bus.post(exec, { isError: true }, async () => ({ kind: 'pass' }))
    expect(feedback).toMatchObject({ kind: 'block' })
    expect(JSON.stringify(feedback)).toContain('destroys the build tree')
  })

  it('hands ask_user to the human chain — same call, no re-review', async () => {
    const { bus, llm, session } = gateHarness(scriptOf([{ decision: 'ask_user', reason: 'cannot verify', question: 'allow rm -rf build?' }]))
    const exec = execOf(session, SHELL_EXEC.name, SHELL_EXEC.args)
    await bus.pre(exec)
    let humanAsked = false
    const outcome = await bus.ask({ callId: exec.callId, toolName: exec.name }, async () => {
      humanAsked = true
      return 'allowed-once'
    })
    expect(humanAsked).toBe(true)
    expect(outcome).toBe('allowed-once')
    expect(bus.guard(exec)).toBeUndefined()
    // the human settlement is final: the reviewer ran exactly once
    expect(llm.calls.length).toBe(1)
  })

  it('routes reviewer failures to a human by default (task §2)', async () => {
    const { bus, session } = gateHarness(scriptOf([{ llmFinish: 'error', llmFailure: { code: 'TRANSPORT', message: 'down' } }]))
    const exec = execOf(session, SHELL_EXEC.name, SHELL_EXEC.args)
    await bus.pre(exec)
    const outcome = await bus.ask({ callId: exec.callId, toolName: exec.name }, async () => 'allowed-once')
    expect(outcome).toBe('allowed-once')
    expect(bus.guard(exec)).toBeUndefined()
  })

  it('denies a hostile short-circuited call: no gate record, no execution', async () => {
    const { bus, session } = gateHarness(scriptOf([ALLOW]))
    // No pre-execute ran for this execution (a hostile earlier listener
    // short-circuited with allow) — the guard must still refuse it.
    const exec = execOf(session, SHELL_EXEC.name, SHELL_EXEC.args)
    expect(bus.guard(exec)).toContain('no gate record')
  })

  it('does not cross-settle concurrent same-name calls', async () => {
    const { bus, session } = gateHarness(scriptOf([ALLOW, ALLOW]))
    const first = execOf(session, SHELL_EXEC.name, SHELL_EXEC.args)
    const second = execOf(session, SHELL_EXEC.name, SHELL_EXEC.args)
    await bus.pre(first)
    await bus.pre(second)
    await bus.ask({ callId: first.callId, toolName: first.name }, async () => 'unavailable')
    await bus.ask({ callId: second.callId, toolName: second.name }, async () => 'unavailable')
    expect(bus.guard(first)).toBeUndefined()
    expect(bus.guard(second)).toBeUndefined()
    // each allow is spent; neither can replay
    expect(bus.guard(first)).toContain('already consumed')
    expect(bus.guard(second)).toContain('already consumed')
  })

  it('cancellation is terminal: no human question, no execution', async () => {
    const controller = new AbortController()
    const { bus, session } = gateHarness(scriptOf([{ verdict: ALLOW, llmDelayMs: 200 }]))
    const exec = execOf(session, SHELL_EXEC.name, SHELL_EXEC.args, { signal: controller.signal })
    const pending = bus.pre(exec)
    setTimeout(() => controller.abort(), 20)
    const decision = await pending as PreExecuteDecision
    if (decision.kind !== 'ask') throw new Error(`expected ask, got ${decision.kind}`)
    expect(decision.reason).toContain('not executed')
    // even if an answerer chain sees the request, a cancelled signal settles
    // 'cancelled' — never a human question, never an execution
    const outcome = await bus.ask({ callId: exec.callId, toolName: exec.name, signal: controller.signal }, async () => 'allowed-once')
    expect(outcome).toBe('cancelled')
    expect(bus.guard(exec)).not.toBeUndefined()
  })

  it('settles a subagent reviewer-allow directly (answerer is unreachable for children)', async () => {
    const child = makeSession('gate-child', { origin: 'subagent', parentSession: SessionId('gate-parent') })
    const { bus, llm } = gateHarness(scriptOf([ALLOW]), child)
    const exec = execOf(child, SHELL_EXEC.name, SHELL_EXEC.args)
    const decision = await bus.pre(exec) as PreExecuteDecision
    expect(decision.kind).toBe('allow')
    expect(llm.calls.length).toBe(1)
    expect(bus.guard(exec)).toBeUndefined()
  })

  it('gates subagent children even when their own preset is not the gate preset (run26b fix)', async () => {
    const parent = makeSession('scope-parent')
    const child = makeSession('scope-child', { origin: 'subagent', parentSession: SessionId('scope-parent') })
    // The parent runs under the gate; the CHILD session is on workspace-write —
    // without the scope rule the child would execute unchecked (approval locked `never`).
    const perSession = (s: unknown): string => (s === parent ? 'second-look-daily' : 'workspace-write')
    const { bus, llm } = gateHarness(scriptOf([ALLOW]), child, perSession)
    const exec = execOf(child, SHELL_EXEC.name, SHELL_EXEC.args, {
      agent: { session: child, parentAgent: { session: parent } },
    })
    const decision = await bus.pre(exec) as PreExecuteDecision
    expect(decision.kind).toBe('allow') // reviewer allow → direct settle for children
    expect(llm.calls.length).toBe(1) // the child call WAS reviewed
    expect(bus.guard(exec)).toBeUndefined()
  })

  it('gates grandchildren through the lineage even without preset inheritance (终审 Major 4)', async () => {
    // Host contract: custom presets are NOT inherited — the grandchild's own
    // preset is workspace-write, its parent is a subagent whose parent is the
    // gated root.
    const root = makeSession('lineage-root')
    const child = makeSession('lineage-child', { origin: 'subagent', parentSession: SessionId('lineage-root') })
    const grandchild = makeSession('lineage-grandchild', { origin: 'subagent', parentSession: SessionId('lineage-child') })
    const perSession = (s: unknown): string => (s === root ? 'second-look-daily' : 'workspace-write')
    const { bus, llm } = gateHarness(scriptOf([ALLOW]), grandchild, perSession)
    const exec = execOf(grandchild, SHELL_EXEC.name, SHELL_EXEC.args, {
      agent: {
        session: grandchild,
        parentAgent: { session: child, parentAgent: { session: root } },
      },
    })
    const decision = await bus.pre(exec) as PreExecuteDecision
    expect(decision.kind).toBe('allow') // reviewer allow → direct settle
    expect(llm.calls.length).toBe(1) // the grandchild call WAS reviewed
    expect(bus.guard(exec)).toBeUndefined()
  })

  it('keeps children of demonstrably ungated parents on native semantics', async () => {
    const parent = makeSession('native-parent')
    const child = makeSession('native-child', { origin: 'subagent', parentSession: SessionId('native-parent') })
    const { bus, llm } = gateHarness(scriptOf([ALLOW]), child, () => 'native-full')
    const exec = execOf(child, SHELL_EXEC.name, SHELL_EXEC.args, {
      agent: { session: child, parentAgent: { session: parent } },
    })
    const decision = await bus.pre(exec)
    expect(decision).toEqual({ kind: 'ask', reason: 'next-called' })
    expect(llm.calls.length).toBe(0)
    expect(bus.guard(exec)).toBeUndefined()
  })

  it('gates a subagent child conservatively when the parent is unreachable', async () => {
    const child = makeSession('orphan-child', { origin: 'subagent' })
    // The child's own session is not on the gate preset and there is no parent
    // handle — unknown scope means gate, never unchecked execution.
    const { bus, llm } = gateHarness(scriptOf([ALLOW]), child, () => 'workspace-write')
    const exec = execOf(child, SHELL_EXEC.name, SHELL_EXEC.args)
    const decision = await bus.pre(exec) as PreExecuteDecision
    expect(decision.kind).toBe('allow')
    expect(llm.calls.length).toBe(1)
    expect(bus.guard(exec)).toBeUndefined()
  })

  it('relays a subagent ask to the parent and returns NOT EXECUTED', async () => {
    const child = makeSession('gate-child', { origin: 'subagent', parentSession: SessionId('gate-parent') })
    const injected: unknown[] = []
    const { bus } = gateHarness(scriptOf([{ decision: 'ask_user', reason: 'cannot verify', question: 'push to remote?' }]), child)
    const exec = execOf(child, SHELL_EXEC.name, SHELL_EXEC.args, {
      agent: { session: child, parentAgent: { inject: (message: unknown) => { injected.push(message) } } },
    })
    const decision = await bus.pre(exec) as PreExecuteDecision
    if (decision.kind !== 'ask') throw new Error(`expected ask, got ${decision.kind}`)
    expect(decision.reason).toContain('NOT executed')
    expect(decision.reason).toContain('push to remote?')
    expect(injected.length).toBe(1)
    expect(bus.guard(exec)).not.toBeUndefined()
  })

  it('invalidates pending allows when the tier changes', async () => {
    const { bus, handle, session } = gateHarness(scriptOf([ALLOW]))
    const exec = execOf(session, SHELL_EXEC.name, SHELL_EXEC.args)
    await bus.pre(exec)
    handle.setTier(String(session.id), 'strict')
    await bus.ask({ callId: exec.callId, toolName: exec.name }, async () => 'unavailable')
    // the settle no longer binds (session invalidated + config version moved)
    expect(bus.guard(exec)).not.toBeUndefined()
    expect(handle.getTier(String(session.id))).toBe('strict')
  })

  it('records decisions in the audit log and exposes T07 status', async () => {
    const { bus, handle, session } = gateHarness(scriptOf([ALLOW]))
    const exec = execOf(session, SHELL_EXEC.name, SHELL_EXEC.args)
    await bus.pre(exec)
    await bus.ask({ callId: exec.callId, toolName: exec.name }, async () => 'unavailable')
    const record = handle.audit.recent(1)[0]!
    expect(record.decision).toBe('allow')
    expect(record.callId).toBe(exec.callId)
    expect(record.model).toContain('review-model')
    expect(record.configVersion).toContain('cfg-')
    expect(record.usage).toBe('unknown') // usage is never estimated
    const status = handle.status()
    expect(status.reviewer).toBe('review-provider/review-model')
    expect(status.auditDegraded).toBe(false)
    expect(status.defaultTier).toBe('daily')
  })

  it('void older allows when settings change (T07)', async () => {
    const { bus, handle, session } = gateHarness(scriptOf([ALLOW, ALLOW]))
    const first = execOf(session, SHELL_EXEC.name, SHELL_EXEC.args)
    await bus.pre(first)
    await bus.ask({ callId: first.callId, toolName: first.name }, async () => 'unavailable')
    expect(bus.guard(first)).toBeUndefined()
    // a settings update is a NEW config revision — nothing older survives it
    const second = execOf(session, SHELL_EXEC.name, SHELL_EXEC.args)
    await bus.pre(second)
    handle.settings.update({ reviewerModel: 'other-model' })
    await bus.ask({ callId: second.callId, toolName: second.name }, async () => 'unavailable')
    expect(bus.guard(second)).not.toBeUndefined()
    expect(handle.status().reviewer).toContain('other-model')
  })

  it('absorbs persisted settings AT MOUNT (安装前复核 R2 补: a restart keeps the reviewer route)', () => {
    const persistence = new MemorySettingsPersistence()
    persistence.save({ reviewerModel: 'user-entered-model', reviewerModelProvider: 'user-entered-provider', defaultTier: 'strict' })
    const { handle } = gateHarness(scriptOf([ALLOW]), undefined, 'second-look-daily', {}, persistence)
    // the LIVE config, not just the store: reviews run with the saved route
    expect(handle.status().reviewer).toBe('user-entered-provider/user-entered-model')
    expect(handle.status().defaultTier).toBe('strict')
  })

  it('grants disclosure of an allowed sensitive read to the session route only (T06)', async () => {
    const { bus, handle, session, llm } = gateHarness(scriptOf([{ decision: 'allow', reason: 'user asked for this config file' }]))
    // the session's main-model route is the disclosed destination
    appendRequestHeader(session, { provider: 'deepseek-official', model: 'deepseek-flash' })
    const exec = execOf(session, 'read', { file_path: '/srv/.env' })
    const decision = await bus.pre(exec) as PreExecuteDecision
    if (decision.kind !== 'ask') throw new Error(`expected ask, got ${decision.kind}`)
    // F01: the review request discloses the destination up front — an
    // INFORMED disclosure decision
    const reviewPrompt = String((llm.calls[0]!.messages![0] as unknown as { content: { readonly text: string }[] }).content[0]!.text)
    expect(reviewPrompt).toContain('disclosed to the main model at [deepseek-official/deepseek-flash]')
    await bus.ask({ callId: exec.callId, toolName: exec.name }, async () => 'unavailable')
    expect(bus.guard(exec)).toBeUndefined()
    // the sensitive read EXECUTED: its returned spans are granted to THIS
    // destination only — identical outbound sends reuse the grant, other
    // destinations stay unauthorized (scenario-bound disclosure)
    const content = [{ type: 'text', text: 'SECRET=sk-live-abcdef123456' }]
    await bus.post(exec, { content }, async () => ({ ok: true }))
    const scan = scanOutbound({ result: content })
    expect(scan.findings.length).toBeGreaterThan(0)
    expect(handle.disclosures.check({
      destination: { provider: 'deepseek-official', model: 'deepseek-flash' },
      dataFingerprint: scan.dataFingerprint,
      sessionId: String(session.id),
    })).toBe('granted')
    expect(handle.disclosures.check({
      destination: { provider: 'other-provider', model: 'other-model' },
      dataFingerprint: scan.dataFingerprint,
      sessionId: String(session.id),
    })).toBe('unknown')
    // F04 end-to-end: the granted content flows OUTBOUND without a new review...
    const first = await bus.stream({ sessionId: String(session.id), messages: [{ text: 'SECRET=sk-live-abcdef123456' }] })
    expect(first.sent).toBe(1)
    // ...while another DESTINATION needs a fresh decision (one privacy review)
    const before = llm.calls.length
    const second = await bus.stream({
      sessionId: String(session.id),
      provider: 'other-provider',
      model: 'other-model',
      messages: [{ text: 'SECRET=sk-live-abcdef123456' }],
    })
    expect(second.sent).toBe(1) // the privacy review allowed it (scripted)
    expect(llm.calls.length).toBe(before + 1)
  })

  it('fails closed when the gate itself breaks', async () => {
    const { bus, handle, session, llm } = gateHarness(scriptOf([ALLOW]))
    // An execution whose signal surface throws breaks the gate internals.
    const broken = execOf(session, SHELL_EXEC.name, SHELL_EXEC.args, {
      signal: {
        aborted: false,
        addEventListener() {
          throw new Error('signal surface broken')
        },
      } as never,
    })
    const decision = await bus.pre(broken) as PreExecuteDecision
    if (decision.kind !== 'ask') throw new Error(`expected ask, got ${decision.kind}`)
    expect(decision.reason).toContain('unhealthy')
    expect(bus.guard(broken)).toContain('unhealthy')
    expect(handle.status().healthy).toBe(false)
    expect(llm.calls.length).toBe(0)
  })
  it('honors an explicit never/human override without calling the reviewer', async () => {
    const denied = gateHarness(scriptOf([ALLOW]), makeSession(), 'second-look-daily', { toolsPolicy: { overrides: { bash: 'never' } } })
    const exec = execOf(denied.session, 'bash', { command: 'echo test' })
    await denied.bus.pre(exec)
    expect(await denied.bus.ask({ callId: exec.callId, toolName: exec.name }, async () => 'allowed-once')).toBe('rejected')
    expect(denied.llm.calls).toHaveLength(0)
    const human = gateHarness(scriptOf([ALLOW]), makeSession(), 'second-look-daily', { toolsPolicy: { overrides: { bash: 'human' } } })
    const asked = execOf(human.session, 'bash', { command: 'echo test' })
    await human.bus.pre(asked)
    let count = 0
    expect(await human.bus.ask({ callId: asked.callId, toolName: asked.name }, async () => { count++; return 'allowed-once' })).toBe('allowed-once')
    expect(count).toBe(1)
    expect(human.llm.calls).toHaveLength(0)
  })
  it('enforces the configured risk ceiling before recording an automatic allow', async () => {
    const h = gateHarness(scriptOf([{ decision: 'allow', reason: 'risky', riskLevel: 'high' }]), makeSession(), 'second-look-daily', { riskPolicy: { maxAutoAllow: 'low', onHighRisk: 'deny' } })
    const exec = execOf(h.session, 'bash', { command: 'echo test' })
    await h.bus.pre(exec)
    expect(await h.bus.ask({ callId: exec.callId, toolName: exec.name }, async () => 'allowed-once')).toBe('rejected')
    expect(h.bus.guard(exec)).toContain('not an allow')
  })

})


it('uses Chinese for human questions, missing-reviewer fallback and execution guards', async () => {
  const h = gateHarness(scriptOf([{ decision: 'ask_user', reason: '需要确认范围', question: '是否允许读取指定目录？' }]), makeSession(), 'second-look-daily', { language: 'zh' })
  const action = execOf(h.session, SHELL_EXEC.name, SHELL_EXEC.args)
  const ask = await h.bus.pre(action)
  expect(ask).toEqual({ kind: 'ask', reason: '[过目] bash 需要你确认：是否允许读取指定目录？' })
  expect(h.bus.guard(action)).toContain('未获批准')
  const missing = gateHarness(scriptOf([ALLOW]), makeSession(), 'second-look-daily', { language: 'zh', reviewerModel: undefined })
  const fallback = await missing.bus.pre(execOf(missing.session, SHELL_EXEC.name, SHELL_EXEC.args)) as PreExecuteDecision
  expect(fallback.kind).toBe('ask')
  if (fallback.kind === 'ask') {
    expect(fallback.reason).toContain('[过目]'); expect(fallback.reason).toContain('尚未配置独立审批模型')
    expect(fallback.reason).not.toContain('Approve once'); expect(fallback.reason).not.toContain('[second-look]')
  }
  h.handle.dispose(); missing.handle.dispose()
})
