/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T05).
 *
 * Strict-tier change review: batch collection (git + observed fallback with
 * NAMED gaps), content-verified batch reuse (never by command text), the
 * finalize four-bucket report (reviewed / pending / user-allowed / gaps) and
 * its invalidation by later modifications, plus the strict-tier combined
 * review (batch + action, separately recorded).
 */
import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { Session, SESSION_FORMAT_VERSION, SessionId } from '@deepseek-ai/dsh-session'
import {
  BatchLedger,
  collectFinalizeReport,
  collectFullBatch,
  collectGitBatch,
  collectObservedBatch,
  comparablePath,
  hashContent,
  lexicalResolve,
  mountGate,
  parsePorcelainZ,
  renderFinalizeReport,
  resolveConfig,
  type ExecLike,
  type GateSeamsLike,
  type GitRunner,
  type PreExecuteDecision,
  type ProbeFileSystem,
  type ReviewerVerdict,
} from '../src/index.ts'
import { MemorySettingsPersistence } from '../src/index.ts'
import { makeLlm, makeSubagents, type ScriptedReview } from './harness.ts'

const WORKSPACE = path.resolve('work')

function probeFs(files: Record<string, string>): ProbeFileSystem {
  const normalized: Record<string, string> = {}
  const tree: Record<string, { type?: string; size?: number }> = { [comparablePath(WORKSPACE)]: { type: 'directory' } }
  for (const [file, content] of Object.entries(files)) {
    normalized[comparablePath(file)] = content
    tree[comparablePath(file)] = { type: 'file', size: content.length }
  }
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
    async readText(target: string, opts?: { cwd?: string }): Promise<string> {
      return normalized[comparablePath(lexicalResolve(opts?.cwd ?? WORKSPACE, target))] ?? ''
    },
    async listDir(): Promise<string[]> {
      return Object.keys(files)
    },
    async search(): Promise<readonly { file: string; line: number; text: string }[]> {
      return []
    },
  }
}

function fakeGit(status: string, diff = '', fail = false): GitRunner {
  return {
    async run(args) {
      if (fail) return { code: 128, stdout: '', stderr: 'not a git repository' }
      if (args[0] === 'status') return { code: 0, stdout: status, stderr: '' }
      return { code: 0, stdout: diff, stderr: '' }
    },
  }
}

const file = (p: string) => `${WORKSPACE}/${p}`

describe('batch collection (T05)', () => {
  it('parses porcelain -z entries including renames', () => {
    const entries = parsePorcelainZ('M  src/a.ts\0?? new.ts\0R  old.ts\0new-name.ts\0!! ignored.log\0')
    expect(entries.map(entry => entry.path)).toEqual(['src/a.ts', 'new.ts', 'old.ts', 'ignored.log'])
    expect(entries[0]?.xy).toBe('M ')
  })

  it('collects staged/unstaged/untracked with content hashes and names gaps', async () => {
    const git = fakeGit('M  src/a.ts\0 M src/b.ts\0?? new.ts\0')
    const fs = probeFs({
      [file('src/a.ts')]: 'a',
      [file('src/b.ts')]: 'b',
      [file('new.ts')]: 'n',
    })
    const snapshot = await collectGitBatch(git, fs, WORKSPACE)
    expect(snapshot.files.map(entry => entry.path).sort()).toEqual(['new.ts', 'src/a.ts', 'src/b.ts'])
    expect(snapshot.files.find(entry => entry.path === 'src/a.ts')?.kind).toBe('staged')
    expect(snapshot.files.find(entry => entry.path === 'src/b.ts')?.kind).toBe('unstaged')
    expect(snapshot.files.find(entry => entry.path === 'new.ts')?.kind).toBe('untracked')
    expect(snapshot.files.find(entry => entry.path === 'src/a.ts')?.contentHash).toBe(hashContent('a'))
  })

  it('turns git failure into a named gap and falls back to observed changes', async () => {
    const git = fakeGit('', '', true)
    const fs = probeFs({ [file('x.ts')]: 'changed' })
    const snapshot = await collectFullBatch(fs, git, WORKSPACE, ['x.ts'])
    expect(snapshot.gaps.some(gap => gap.includes('non-git project'))).toBe(true)
    // F04: the REAL git failure stays a named gap alongside the fallback note
    expect(snapshot.gaps.some(gap => gap.includes('not a git repository'))).toBe(true)
    expect(snapshot.files.map(entry => entry.path)).toEqual(['x.ts'])
    // and the git failure itself is a named gap on the git-only path
    const gitOnly = await collectGitBatch(git, fs, WORKSPACE)
    expect(gitOnly.gaps[0]).toContain('git status unavailable')
    expect(gitOnly.gaps[0]).toContain('must not claim completeness')
  })

  it('marks binary and over-budget files as uncovered, never reviewed', async () => {
    const fs = probeFs({
      [file('bin.dat')]: 'a\u0000b',
      [file('huge.ts')]: 'x'.repeat(300 * 1024),
    })
    const snapshot = await collectObservedBatch(fs, ['bin.dat', 'huge.ts'], WORKSPACE)
    expect(snapshot.files.find(entry => entry.path === 'bin.dat')?.binary).toBe(true)
    expect(snapshot.files.find(entry => entry.path === 'huge.ts')?.overBudget).toBe(true)
    expect(snapshot.files.every(entry => entry.contentHash === undefined)).toBe(true)
    expect(snapshot.gaps.length).toBeGreaterThan(0)
  })
})

describe('batch ledger: content-verified reuse only', () => {
  function ledgerWith(hashes: Record<string, string>): BatchLedger {
    const ledger = new BatchLedger()
    ledger.add({
      id: 'batch-1',
      hashes: new Map(Object.entries(hashes)),
      actionCallIds: ['call-1'],
      tier: 'strict',
      configVersion: 'cfg-1',
      decidedBy: 'reviewer',
      at: 1,
      uncovered: [],
    })
    return ledger
  }

  function snapshotOf(files: Record<string, string>) {
    return {
      files: Object.entries(files).map(([p, content]) => ({ path: p, kind: 'observed' as const, contentHash: hashContent(content) })),
      gaps: [],
      collectedAt: 2,
    }
  }

  it('reuses an unchanged batch and refuses it the moment content changes', () => {
    const ledger = ledgerWith({ 'a.ts': hashContent('v1') })
    expect(ledger.checkReuse('batch-1', snapshotOf({ 'a.ts': 'v1' }), 'strict', 'cfg-1').ok).toBe(true)
    const changed = ledger.checkReuse('batch-1', snapshotOf({ 'a.ts': 'v2' }), 'strict', 'cfg-1')
    expect(changed.ok).toBe(false)
    if (!changed.ok) expect(changed.reason).toContain('changed since review')
  })

  it('refuses reuse on new files, missing files, tier or config changes', () => {
    const ledger = ledgerWith({ 'a.ts': hashContent('v1') })
    const extra = ledger.checkReuse('batch-1', snapshotOf({ 'a.ts': 'v1', 'b.ts': 'x' }), 'strict', 'cfg-1')
    expect(extra.ok).toBe(false)
    const missing = ledger.checkReuse('batch-1', snapshotOf({}), 'strict', 'cfg-1')
    expect(missing.ok).toBe(false)
    expect(ledger.checkReuse('batch-1', snapshotOf({ 'a.ts': 'v1' }), 'daily', 'cfg-1').ok).toBe(false)
    expect(ledger.checkReuse('batch-1', snapshotOf({ 'a.ts': 'v1' }), 'strict', 'cfg-2').ok).toBe(false)
  })

  it('refuses reuse when a reviewed file becomes unverifiable (binary/over-budget)', () => {
    const ledger = ledgerWith({ 'a.ts': hashContent('v1') })
    // F01: a reviewed text file replaced by a binary blob has NO hash — that
    // is a change, never an implicit "unchanged".
    const binaryNow = {
      files: [{ path: 'a.ts', kind: 'observed' as const, binary: true }],
      gaps: [],
      collectedAt: 2,
    }
    const verdict = ledger.checkReuse('batch-1', binaryNow, 'strict', 'cfg-1')
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toContain('not verifiable')
  })

  it('finds the newest reusable record and supports invalidation', () => {
    const ledger = ledgerWith({ 'a.ts': hashContent('v1') })
    expect(ledger.findReusable(snapshotOf({ 'a.ts': 'v1' }), 'strict', 'cfg-1')?.id).toBe('batch-1')
    ledger.invalidate('batch-1', 'target script changed')
    expect(ledger.findReusable(snapshotOf({ 'a.ts': 'v1' }), 'strict', 'cfg-1')).toBeUndefined()
  })
})

describe('finalize report (delivery check)', () => {
  it('keeps unverifiable files pending even with review history (F02)', async () => {
    const fs = probeFs({ [file('a.ts')]: 'a\u0000binary now' })
    const ledger = new BatchLedger()
    ledger.add({
      id: 'batch-9',
      hashes: new Map([['a.ts', hashContent('text before')]]),
      actionCallIds: ['call-9'],
      tier: 'daily',
      configVersion: 'cfg-1',
      decidedBy: 'reviewer',
      at: 1,
      uncovered: [],
    })
    const report = await collectFinalizeReport({
      fs,
      observedPaths: new Set(['a.ts']),
      ledger,
      tier: 'daily',
      configVersion: 'cfg-1',
      cwd: WORKSPACE,
      userAllowedActions: [],
    })
    expect(report.reviewed).toEqual([])
    expect(report.pending).toEqual(['a.ts'])
    expect(report.completed).toBe(false)
    expect(report.gaps.some(gap => gap.includes('binary'))).toBe(true)
  })

  it('splits reviewed / pending / user-allowed / gaps and flags later modifications', async () => {
    const fs = probeFs({ [file('a.ts')]: 'v1', [file('b.ts')]: 'draft' })
    const ledger = new BatchLedger()
    ledger.add({
      id: 'batch-1',
      hashes: new Map([['a.ts', hashContent('v1')], ['b.ts', hashContent('draft')]]),
      actionCallIds: ['call-1'],
      tier: 'daily',
      configVersion: 'cfg-1',
      decidedBy: 'reviewer',
      at: 1,
      uncovered: [],
    })
    const inputs = {
      fs,
      observedPaths: new Set(['a.ts', 'b.ts']),
      ledger,
      tier: 'daily' as const,
      configVersion: 'cfg-1',
      cwd: WORKSPACE,
      userAllowedActions: ['write call-9 (human, this action only)'],
    }
    const report = await collectFinalizeReport(inputs)
    expect([...report.reviewed].sort()).toEqual(['a.ts', 'b.ts'])
    expect(report.pending).toEqual([])
    expect(report.completed).toBe(false) // non-git collection still has an explicit coverage gap
    expect(report.gaps.some(gap => gap.includes('non-git'))).toBe(true)
    expect(report.userAllowed).toHaveLength(1)
    // a later modification invalidates completion
    const mutated = probeFs({ [file('a.ts')]: 'v2', [file('b.ts')]: 'draft' })
    const after = await collectFinalizeReport({ ...inputs, fs: mutated })
    expect(after.completed).toBe(false)
    expect(after.pending).toEqual(['a.ts'])
    const text = renderFinalizeReport(after)
    expect(text).toContain('NOT fully covered')
    expect(text).toContain('explicitly user-allowed')
    expect(text).toContain('call second_look_finalize again')
    expect(text).toContain('Manual runs')
  })
})

describe('strict-tier combined review (batch + action)', () => {
  function seamBus(): GateSeamsLike & {
    pre(exec: ExecLike): Promise<unknown>
    ask(req: unknown, next: () => Promise<string>): Promise<unknown>
    guard(exec: ExecLike): string | undefined
    tools: GateSeamsLike['tools'] & { registered: unknown[] }
  } {
    const handlers = new Map<string, ((...args: unknown[]) => unknown)[]>()
    const tools: { registered: unknown[]; guardFn?: (exec: ExecLike) => string | undefined } = { registered: [] }
    return {
      on(name, handler) {
        const list = handlers.get(name) ?? []
        list.push(handler as (...args: unknown[]) => unknown)
        handlers.set(name, list)
        return () => undefined
      },
      tools: {
        registered: tools.registered,
        guard(fn) {
          tools.guardFn = fn
          return () => undefined
        },
        register(tool) {
          tools.registered.push(tool)
          return () => undefined
        },
      },
      get: () => undefined,
      guard(exec: ExecLike) {
        return tools.guardFn?.(exec)
      },
      async pre(exec) {
        const handler = handlers.get('tools/pre-execute')?.[0]
        return await (handler as (e: ExecLike, n: () => Promise<PreExecuteDecision>) => Promise<PreExecuteDecision>)(exec, async () => ({ kind: 'ask', reason: 'next-called' }))
      },
      async ask(req, next) {
        const handler = handlers.get('approval/request')?.[0]
        return await (handler as (r: unknown, n: () => Promise<string>) => Promise<string>)(req, next)
      },
    }
  }

  const ALLOW: ReviewerVerdict = { decision: 'allow', reason: 'batch and run are fine' }

  it('sends the pending batch with a strict-tier run and records the batch verdict', async () => {
    const script = (): ScriptedReview => ({ verdict: ALLOW })
    const ctx = new Context()
    ctx.provide('subagents', makeSubagents(script, undefined, { withStart: false }) as never)
    const llm = makeLlm(script)
    ctx.provide('llm', llm as never)
    ctx.provide('permissionPresets', { current: () => 'second-look-strict' } as never)
    const bus = seamBus()
    mountGate(ctx, resolveConfig({ reviewerModel: 'rv', reviewerModelProvider: 'rp', reviewerTimeoutMs: 2_000, tiers: { defaultTier: 'strict' } }), {
      fs: probeFs({ [file('src/a.ts')]: 'pending change' }),
      seams: bus,
      // Isolated persistence: the shared default settings dir must never leak
      // a real user override (e.g. defaultTier) into a test's tier resolution.
      settingsPersistence: new MemorySettingsPersistence(),
      git: fakeGit('M  src/a.ts\0', 'diff --git a/src/a.ts b/src/a.ts\n+pending change'),
    })
    const session = Session.create(SessionId('batch-session'), undefined, {
      version: SESSION_FORMAT_VERSION,
      id: SessionId('batch-session'),
      createdAt: 0,
      cwd: WORKSPACE,
      isSeeded: false,
    })
    const exec: ExecLike = {
      token: Symbol('batch-exec'),
      callId: 'batch-call-1',
      name: 'bash',
      arguments: { command: 'pnpm test' },
      agent: { session },
      signal: new AbortController().signal,
    }
    const decision = await bus.pre(exec) as PreExecuteDecision
    if (decision.kind !== 'ask') throw new Error(`expected ask, got ${decision.kind}`)
    const prompt = String((llm.calls[0]!.messages![0] as unknown as { content: { readonly text: string }[] }).content[0]!.text)
    expect(prompt).toContain('Change-batch under review')
    expect(prompt).toContain('src/a.ts')
    expect(prompt).toContain('pending change')
    // settle through the answerer and pass the guard — the action, not the batch
    await bus.ask({ callId: exec.callId, toolName: exec.name }, async () => 'unavailable')
    expect(bus.guard(exec)).toBeUndefined()
    // the finalize tool is registered for the delivery check
    expect(bus.tools.registered.length).toBe(1)
    expect((bus.tools.registered[0] as { name: string }).name).toBe('second_look_finalize')
  })

  it('reuses an unchanged reviewed batch for a later run (F03) and re-reviews after edits', async () => {
    const script = (): ScriptedReview => ({ verdict: ALLOW })
    const ctx = new Context()
    ctx.provide('subagents', makeSubagents(script, undefined, { withStart: false }) as never)
    const llm = makeLlm(script)
    ctx.provide('llm', llm as never)
    ctx.provide('permissionPresets', { current: () => 'second-look-strict' } as never)
    const bus = seamBus()
    const git = fakeGit('M  src/a.ts\0', 'diff --git a/src/a.ts\n+pending change')
    mountGate(ctx, resolveConfig({ reviewerModel: 'rv', reviewerModelProvider: 'rp', tiers: { defaultTier: 'strict' } }), {
      fs: probeFs({ [file('src/a.ts')]: 'pending change' }),
      seams: bus,
      git,
      settingsPersistence: new MemorySettingsPersistence(),
    })
    const session = Session.create(SessionId('reuse-session'), undefined, {
      version: SESSION_FORMAT_VERSION,
      id: SessionId('reuse-session'),
      createdAt: 0,
      cwd: WORKSPACE,
      isSeeded: false,
    })
    const run = async (callId: string): Promise<void> => {
      const exec: ExecLike = {
        token: Symbol(callId),
        callId,
        name: 'bash',
        arguments: { command: 'pnpm test' },
        agent: { session },
        signal: new AbortController().signal,
      }
      const decision = await bus.pre(exec) as PreExecuteDecision
      if (decision.kind !== 'ask') throw new Error(`expected ask, got ${decision.kind}: ${JSON.stringify(decision)}`)
      if (!decision.reason.includes('Reviewer allowed')) {
        throw new Error(`expected a reviewer-allow ask, got: ${decision.reason}`)
      }
      await bus.ask({ callId: exec.callId, toolName: exec.name }, async () => 'unavailable')
    }
    await run('reuse-1')
    const firstPrompt = String((llm.calls[0]!.messages![0] as unknown as { content: { readonly text: string }[] }).content[0]!.text)
    expect(firstPrompt).toContain('Change-batch under review')
    await run('reuse-2')
    // unchanged content: the batch evidence is REUSED — the diff itself is
    // NOT re-sent as pending changes to re-review
    const secondPrompt = String((llm.calls[1]!.messages![0] as unknown as { content: { readonly text: string }[] }).content[0]!.text)
    expect(secondPrompt).toContain('VERIFIED unchanged')
    expect(secondPrompt).not.toContain('+pending change')
  })

  it('finalize follows live settings and user-allowed records (T07 review F01 lock)', async () => {
    const answers: ReviewerVerdict[] = [
      ALLOW,
      ALLOW,
      { decision: 'ask_user', reason: 'cannot verify', question: 'run it?' },
    ]
    let index = 0
    const script = (): ScriptedReview => ({ verdict: answers[Math.min(index++, answers.length - 1)]! })
    const ctx = new Context()
    ctx.provide('subagents', makeSubagents(script, undefined, { withStart: false }) as never)
    const llm = makeLlm(script)
    ctx.provide('llm', llm as never)
    ctx.provide('permissionPresets', { current: () => 'second-look-strict' } as never)
    const bus = seamBus()
    const handle = mountGate(ctx, resolveConfig({ reviewerModel: 'rv', reviewerModelProvider: 'rp', tiers: { defaultTier: 'strict' } }), {
      fs: probeFs({ [file('src/a.ts')]: 'pending change' }),
      seams: bus,
      git: fakeGit('M  src/a.ts\0', 'diff --git a/src/a.ts\n+pending change'),
      settingsPersistence: new MemorySettingsPersistence(),
    })
    const session = Session.create(SessionId('finalize-session'), undefined, {
      version: SESSION_FORMAT_VERSION,
      id: SessionId('finalize-session'),
      createdAt: 0,
      cwd: WORKSPACE,
      isSeeded: false,
    })
    const run = async (callId: string, downstream: () => Promise<string>): Promise<void> => {
      const exec: ExecLike = {
        token: Symbol(callId),
        callId,
        name: 'bash',
        arguments: { command: 'pnpm test' },
        agent: { session },
        signal: new AbortController().signal,
      }
      await bus.pre(exec)
      await bus.ask({ callId, toolName: 'bash' }, downstream)
    }
    const finalizeTool = bus.tools.registered[0] as {
      execute: (args: unknown, exec: unknown) => Promise<{ completed: boolean; reviewed: string[]; userAllowed: string[] }>
    }
    await run('fin-1', async () => 'unavailable')
    const first = await finalizeTool.execute({}, { agent: { session } })
    expect(first.reviewed).toContain('src/a.ts')
    // a settings change is a NEW config version — old batches are void...
    handle.settings.update({ reviewerModel: 'rv2' })
    // ...and a fresh run under the NEW config re-reviews and records it:
    // finalize must NOT be stuck reporting pending (T07 review F01)
    await run('fin-2', async () => 'unavailable')
    const second = await finalizeTool.execute({}, { agent: { session } })
    expect(second.reviewed).toContain('src/a.ts')
    // an explicit human allow surfaces in its own bucket — the ACTION only
    await run('fin-3', async () => 'allowed-once')
    const third = await finalizeTool.execute({}, { agent: { session } })
    expect(third.userAllowed.some(entry => entry.includes('fin-3'))).toBe(true)
    expect(third.completed).toBe(true)
  })

  it('does not send a batch for ordinary writes (no per-write review)', async () => {
    const script = (): ScriptedReview => ({ verdict: ALLOW })
    const ctx = new Context()
    ctx.provide('subagents', makeSubagents(script, undefined, { withStart: false }) as never)
    const llm = makeLlm(script)
    ctx.provide('llm', llm as never)
    ctx.provide('permissionPresets', { current: () => 'second-look-daily' } as never)
    const bus = seamBus()
    mountGate(ctx, resolveConfig({ reviewerModel: 'rv', reviewerModelProvider: 'rp' }), {
      fs: probeFs({}),
      seams: bus,
      git: fakeGit(''),
      settingsPersistence: new MemorySettingsPersistence(),
    })
    const session = Session.create(SessionId('batch-session-2'), undefined, {
      version: SESSION_FORMAT_VERSION,
      id: SessionId('batch-session-2'),
      createdAt: 0,
      cwd: WORKSPACE,
      isSeeded: false,
    })
    const exec: ExecLike = {
      token: Symbol('w'),
      callId: 'w-1',
      name: 'write',
      arguments: { file_path: 'src/a.ts', content: 'hello' },
      agent: { session },
      signal: new AbortController().signal,
    }
    const decision = await bus.pre(exec)
    expect(decision).toEqual({ kind: 'allow' })
    expect(llm.calls.length).toBe(0) // exempt: no reviewer, no batch review
  })
})
