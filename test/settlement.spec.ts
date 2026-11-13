/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T04).
 *
 * The settlement ledger: execution-identity binding, single-use consumption,
 * mismatch accounting, late-settle rejection and invalidation — the exact
 * model verified live in T00 runs 15–17b (`guard-pass consumed:true`).
 */
import { describe, expect, it } from 'vitest'
import { argsDigest, SettlementMap, type ExecutionIdentity } from '../src/index.ts'

function identity(over: Partial<ExecutionIdentity> = {}): ExecutionIdentity {
  return {
    token: Symbol('exec'),
    callId: 'call-1',
    rootCallId: undefined,
    sessionId: 'session-1',
    toolName: 'bash',
    argHash: argsDigest({ command: 'echo hi' }),
    configVersion: 'cfg-1',
    ...over,
  }
}

describe('settlement ledger', () => {
  it('passes exactly once for a bound, settled allow (single-use)', () => {
    const map = new SettlementMap()
    const id = identity()
    map.record(id)
    expect(map.settle('call-1', 'bash', 'allowed-once', 'reviewer')).toBe(true)
    const first = map.verifyAndConsume(id)
    expect(first).toEqual({ ok: true, decidedBy: 'reviewer' })
    const second = map.verifyAndConsume(id)
    expect(second.ok).toBe(false)
    // the tombstone reports WHY (T04 review F2): consumed, not "no record"
    if (!second.ok) expect(second.reason).toContain('already consumed')
  })

  it('names every failing dimension on a mismatch', () => {
    const map = new SettlementMap()
    const id = identity()
    map.record(id)
    map.settle('call-1', 'bash', 'allowed-once', 'human')
    const wrongToken = map.verifyAndConsume(identity({ token: Symbol('other') }))
    expect(wrongToken.ok).toBe(false)
    if (!wrongToken.ok) expect(wrongToken.reason).toContain('token:false')
    const wrongTool = map.verifyAndConsume(identity({ toolName: 'write' }))
    if (!wrongTool.ok) expect(wrongTool.reason).toContain('tool:false')
    const wrongArgs = map.verifyAndConsume(identity({ argHash: argsDigest({ command: 'rm -rf /' }) }))
    if (!wrongArgs.ok) expect(wrongArgs.reason).toContain('args:false')
    const wrongConfig = map.verifyAndConsume(identity({ configVersion: 'cfg-2' }))
    if (!wrongConfig.ok) expect(wrongConfig.reason).toContain('config:false')
  })

  it('never passes a non-allow outcome', () => {
    const map = new SettlementMap()
    const id = identity()
    map.record(id)
    map.settle('call-1', 'bash', 'rejected', 'reviewer')
    const verdict = map.verifyAndConsume(id)
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toContain('"rejected" is not an allow')
  })

  it('ignores settles for unknown, consumed or cross-tool calls (no replay)', () => {
    const map = new SettlementMap()
    expect(map.settle('ghost', 'bash', 'allowed-once', 'human')).toBe(false)
    const id = identity()
    map.record(id)
    // cross-tool settle must not bind
    expect(map.settle('call-1', 'write', 'allowed-once', 'human')).toBe(false)
    map.settle('call-1', 'bash', 'allowed-once', 'human')
    map.verifyAndConsume(id)
    // late settle after consumption is ignored
    expect(map.settle('call-1', 'bash', 'allowed-once', 'human')).toBe(false)
  })

  it('invalidates on cancellation, session end and config change', () => {
    const map = new SettlementMap()
    const a = identity({ callId: 'a' })
    const b = identity({ callId: 'b', sessionId: 'session-2' })
    map.record(a)
    map.record(b)
    map.settle('a', 'bash', 'allowed-once', 'human')
    map.settle('b', 'bash', 'allowed-once', 'human')
    map.invalidate('a', 'execution cancelled')
    const denied = map.verifyAndConsume(a)
    expect(denied.ok).toBe(false)
    if (!denied.ok) expect(denied.reason).toContain('invalidated (execution cancelled)')
    map.invalidateSession('session-2', 'session ended')
    expect(map.verifyAndConsume(b).ok).toBe(false)
    const c = identity({ callId: 'c' })
    map.record(c)
    map.settle('c', 'bash', 'allowed-once', 'human')
    map.invalidateAll('config changed')
    const verdict = map.verifyAndConsume(c)
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toContain('no gate record')
    expect(map.size).toBe(0)
  })

  it('evicts tombstones before live pending records under pressure (终审 §4b)', () => {
    const map = new SettlementMap()
    const first = identity({ callId: 'tombstone' })
    map.record(first)
    map.settle('tombstone', 'bash', 'allowed-once', 'reviewer')
    map.verifyAndConsume(first) // consumed → tombstone
    for (let index = 0; index < 511; index += 1) {
      map.record(identity({ callId: `live-${index}`, token: Symbol(index) }))
    }
    map.record(identity({ callId: 'newest', token: Symbol('newest') }))
    expect(map.has('newest')).toBe(true)
    expect(map.has('live-0')).toBe(true) // live pending survived the pressure
    expect(map.has('tombstone')).toBe(false) // the tombstone went first
  })

  it('digests arguments stably and locally', () => {
    expect(argsDigest({ command: 'echo hi' })).toBe(argsDigest({ command: 'echo hi' }))
    expect(argsDigest({ command: 'echo hi' })).not.toBe(argsDigest({ command: 'echo bye' }))
    expect(argsDigest({ command: 'echo hi' })).toHaveLength(32)
  })
})
