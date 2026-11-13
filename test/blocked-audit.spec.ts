import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AuditLog, FileAuditPersistence, type AuditRecord } from '../src/settings/audit.ts'
const row = (at: number, decision = 'deny'): AuditRecord => ({ at, decision, callId: `call-${at}`, sessionId: 'test-session',
  toolName: 'node', tier: 'daily', configVersion: 'test', model: 'test', reason: 'token=FAKE_AUDIT_SECRET_123456', durationMs: 1, usage: 'unknown' })
describe('durable blocked history', () => {
  it('keeps the newest 100 blocks despite 700 approvals, restarts redacted, and clears independently', () => {
    const dir = mkdtempSync(join(tmpdir(), 'second-look-audit-'))
    try {
      const persistence = new FileAuditPersistence(dir)
      const log = new AuditLog(persistence)
      for (let i = 0; i < 105; i++) log.append(row(i))
      for (let i = 0; i < 700; i++) log.append(row(i + 1000, 'allow'))
      expect(log.recent(500)).toHaveLength(500)
      expect(log.blockedRecent()).toHaveLength(100)
      expect(log.blockedRecent().at(-1)?.at).toBe(5)
      expect(readFileSync(join(dir, 'blocked-audit.json'), 'utf8')).not.toContain('FAKE_AUDIT_SECRET')
      log.clear()
      const restored = new AuditLog(persistence)
      expect(restored.recent()).toHaveLength(0)
      expect(restored.blockedRecent()).toHaveLength(100)
      restored.append(row(2000, 'allow')); restored.clear('blocked')
      expect(restored.recent()).toHaveLength(1)
      expect(new AuditLog(persistence).blockedRecent()).toHaveLength(0)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
  it('persists actual refusal classes, not asks, cancellations or approvals', () => {
    const log = new AuditLog()
    for (const decision of ['deny','rule-deny','guard-blocked','outbound-blocked','allow','exempt','ask_user','cancelled']) log.append(row(1,decision))
    log.append({ ...row(2,'human-settled'), humanOutcome: 'rejected' })
    log.append({ ...row(3,'human-settled'), humanOutcome: 'allowed-once' })
    expect(log.blockedRecent()).toHaveLength(5)
  })
  it('keeps in-memory evidence on disk failure, exposes degradation, and does not falsely report a clear', () => {
    const log = new AuditLog({ load: () => [], save: () => { throw new Error('disk failure') } })
    expect(() => log.append(row(1))).not.toThrow()
    expect(log.degraded).toBe(true)
    expect(log.blockedRecent()).toHaveLength(1)
    expect(() => log.clear('blocked')).toThrow('disk failure')
    expect(log.blockedRecent()).toHaveLength(1)
  })
  it('reports corrupt history without crashing the gate', () => {
    const dir = mkdtempSync(join(tmpdir(), 'second-look-audit-'))
    try {
      writeFileSync(join(dir,'blocked-audit.json'), '{broken')
      const log = new AuditLog(new FileAuditPersistence(dir))
      expect(log.degraded).toBe(true)
      expect(log.blockedRecent()).toEqual([])
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})
