import { useCallback, useEffect, useRef, useState } from 'react'
import type { AuditRecord, AuditResponse } from './settings-api.ts'
import { exportAudit, groupAudit, type AuditCategory } from './audit-view.ts'
import type { AuditKey } from './audit-locales.ts'

export interface AuditPanelProps {
  enabled?: boolean
  t: (key: AuditKey) => string
  audit: () => Promise<AuditResponse>
  clearAudit: (scope?: 'recent' | 'blocked') => Promise<{ ok: boolean; error?: string }>
}
export const AUDIT_STYLES = `
.sl-audit-search{flex:1;min-width:180px;height:36px;padding:0 10px;border:1px solid var(--dsw-alias-border-l4);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
.sl-audit-search:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}

.sl-audit{margin-top:28px;padding-top:22px;border-top:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);font-size:14px;line-height:1.6}
.sl-audit-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}
.sl-audit h3{margin:0;font-size:16px;font-weight:600}.sl-audit p{margin:4px 0}
.sl-audit-muted{color:var(--dsw-alias-label-secondary);font-size:13px}
.sl-audit-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
.sl-audit button,.sl-audit select{font:inherit;font-size:13px;color:inherit;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l4);border-radius:6px;min-height:32px;padding:4px 12px;cursor:pointer}
.sl-audit button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.sl-audit button[aria-pressed="true"]{background:var(--dsw-alias-interactive-bg-hover);font-weight:600}
.sl-audit button:disabled{opacity:.5;cursor:default}.sl-audit :focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
.sl-audit-toolbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin:16px 0 8px}
.sl-audit-empty{padding:24px 0;text-align:center}.sl-audit-error{color:var(--dsw-alias-state-error-primary)}
.sl-audit-confirm{display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:12px 0}
.sl-audit-entry{border-top:1px solid var(--dsw-alias-border-l2)}
.sl-audit-entry summary{cursor:pointer;list-style:none;padding:12px 0}.sl-audit-entry summary::-webkit-details-marker{display:none}
.sl-audit-topline{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.sl-audit-time{margin-left:auto;font-size:12px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.sl-audit-badge{font-size:12px;line-height:20px;padding:0 7px;border-radius:4px;background:var(--dsw-alias-interactive-bg-hover);font-weight:500}
.sl-audit-entry[data-category="deny"] .sl-audit-badge,.sl-audit-entry[data-category="failure"] .sl-audit-badge{color:var(--dsw-alias-state-error-primary)}
.sl-audit-entry[data-category="ask"] .sl-audit-badge{color:var(--dsw-alias-state-business-primary)}
.sl-audit-reason{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;margin-top:4px;color:var(--dsw-alias-label-secondary);font-size:13px}
.sl-audit-chevron{font-size:16px;color:var(--dsw-alias-label-secondary);transition:transform .12s}.sl-audit-entry[open] .sl-audit-chevron{transform:rotate(90deg)}
.sl-audit-detail{padding:0 0 14px;font-size:13px;overflow-wrap:anywhere}.sl-audit-step{padding:8px 0}.sl-audit-step p{white-space:pre-wrap}.sl-audit-meta{display:flex;flex-wrap:wrap;gap:4px 16px;color:var(--dsw-alias-label-secondary)}
.sl-audit-footer{padding-top:12px;display:flex;gap:8px}
@media(max-width:600px){.sl-audit-head{display:block}.sl-audit-actions{margin-top:12px}.sl-audit-topline{display:grid;grid-template-columns:auto 1fr auto;gap:4px 8px}.sl-audit-time{grid-column:1 / -1;grid-row:2;margin-left:0}.sl-audit-chevron{grid-column:3;grid-row:1}.sl-audit-toolbar{flex-wrap:wrap}}
@media(prefers-reduced-motion:reduce){.sl-audit-chevron{transition:none}}
`
function label(record: AuditRecord): AuditKey {
  if (record.decision === 'human-settled') return record.humanOutcome === 'allowed-once' ? 'audit.humanAllow'
    : record.humanOutcome === 'rejected' ? 'audit.humanDeny' : record.humanOutcome === 'cancelled' ? 'audit.cancelled' : 'audit.unavailable'
  if (record.decision === 'cancelled') return 'audit.cancelled'
  if (record.decision.startsWith('failure-')) return 'audit.failed'
  const keys: Record<string, AuditKey> = { 'guard-blocked': 'audit.guardBlocked', 'outbound-blocked': 'audit.outboundBlocked', exempt: 'audit.exempt', allow: 'audit.allow', ask_user: 'audit.ask', deny: 'audit.deny', 'rule-deny': 'audit.ruleDeny', 'rule-ask': 'audit.ruleAsk', 'settings-changed': 'audit.settings' }
  return keys[record.decision] ?? 'audit.other'
}
function time(at: number, locale: string): string { return new Date(at).toLocaleString(locale) }
export function AuditPanel({ t, audit, clearAudit, enabled = true }: AuditPanelProps): React.ReactElement {
  const [recent, setRecent] = useState<readonly AuditRecord[]>([])
  const [blocked, setBlocked] = useState<readonly AuditRecord[]>([])
  const [scope, setScope] = useState<'recent' | 'blocked'>('recent')
  const [persistenceDegraded, setPersistenceDegraded] = useState(false)
  const records = scope === 'blocked' ? blocked : recent
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<AuditKey | null>(null)
  const [notice, setNotice] = useState<AuditKey | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<AuditCategory | 'all'>('all')
  const [limit, setLimit] = useState(5)
  const active = useRef(false)
  const pending = useRef(false)
  const serial = useRef(0)
  const load = useCallback(async () => {
    if (pending.current) return
    pending.current = true
    const version = ++serial.current
    setBusy(true)
    try {
      const result = await audit()
      if (!active.current || version !== serial.current) return
      if (!result.ok || !Array.isArray(result.records)) { setError('audit.loadFailed'); return }
      setRecent(result.records); setBlocked(result.blockedRecords ?? []); setPersistenceDegraded(result.persistenceDegraded ?? false); setLoaded(true); setError(null)
    } catch { if (active.current && version === serial.current) setError('audit.loadFailed') }
    finally { if (active.current && version === serial.current) { pending.current = false; setBusy(false) } }
  }, [audit])
  useEffect(() => {
    if (!enabled) return
    active.current = true; pending.current = false
    void load()
    const timer = setInterval(() => { if (document.visibilityState !== 'hidden') void load() }, 10000)
    return () => { active.current = false; ++serial.current; clearInterval(timer) }
  }, [load, enabled])
  const clear = async () => {
    if (pending.current) return
    pending.current = true; const version = ++serial.current; setBusy(true); setError(null); setNotice(null)
    try {
      const result = await clearAudit(scope)
      if (!active.current || version !== serial.current) return
      if (!result.ok) { setError('audit.clearFailed'); return }
      if (scope === 'blocked') { setBlocked([]); setPersistenceDegraded(false) } else setRecent([]); setLoaded(true); setConfirm(false); setNotice('audit.cleared')
    } catch { if (active.current && version === serial.current) setError('audit.clearFailed') }
    finally { if (active.current && version === serial.current) { pending.current = false; setBusy(false) } }
  }
  const download = () => {
    let url: string | undefined
    try {
      const blob = new Blob([exportAudit(records, scope)], { type: 'application/json;charset=utf-8' })
      url = URL.createObjectURL(blob)
      const anchor = document.createElement('a'); anchor.href = url
      anchor.download = `second-look-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
      document.body.appendChild(anchor)
      try { anchor.click() } finally { anchor.remove() }
      setError(null)
    } catch { setError('audit.exportFailed') }
    finally { if (url) { const release = url; setTimeout(() => URL.revokeObjectURL(release), 1000) } }
  }
  const entries = groupAudit(records)
  const query = search.trim().toLocaleLowerCase()
  const filtered = entries.filter(entry => (filter === 'all' || entry.category === filter)
    && (!query || entry.records.some(record => [record.toolName, record.reason, record.sessionId, record.callId].some(value => value?.toLocaleLowerCase().includes(query)))))
  return <section className="sl-audit" aria-label={t('audit.title')}>
    <style>{AUDIT_STYLES}</style>
    <div className="sl-audit-head">
      <div><h3>{t('audit.title')}</h3><p className="sl-audit-muted">{t('audit.description')}</p></div>
      <div className="sl-audit-actions">
        <button type="button" disabled={busy} onClick={() => { setNotice(null); void load() }}>{t('audit.refresh')}</button>
        <button type="button" disabled={!records.length} onClick={download}>{t('audit.export')}</button>
        <button type="button" disabled={busy || !records.length} onClick={() => setConfirm(true)}>{t('audit.clear')}</button>
      </div>
    </div>
    <div className="sl-audit-actions" aria-label={t('audit.historyScope')}>
      {(['recent', 'blocked'] as const).map(value => <button type="button" key={value} aria-pressed={scope === value} disabled={busy} onClick={() => { setScope(value); setFilter('all'); setLimit(5); setConfirm(false); setNotice(null) }}>{t(value === 'recent' ? 'audit.recent' : 'audit.blocked')}</button>)}
    </div>
    <p className="sl-audit-muted">{t(scope === 'blocked' ? 'audit.blockedRetention' : 'audit.retention')}</p>
    {persistenceDegraded && <p className="sl-audit-error" role="alert">{t('audit.persistenceFailed')}</p>}
    {confirm && <div className="sl-audit-confirm" role="group" aria-label={t('audit.confirmText')}>
      <span>{t('audit.confirmText')}</span><button type="button" disabled={busy} onClick={() => void clear()}>{t('audit.confirm')}</button>
      <button type="button" disabled={busy} onClick={() => setConfirm(false)}>{t('audit.cancel')}</button>
    </div>}
    {error && <p className="sl-audit-error" role="alert">{t(error)}</p>}
    {notice && <p className="sl-audit-muted" role="status">{t(notice)}</p>}
    <div className="sl-audit-toolbar">
      <input type="search" className="sl-audit-search" aria-label={t('audit.searchLabel')} placeholder={t('audit.search')} value={search} onChange={event => { setSearch(event.target.value); setLimit(5) }} />
      <label className="sl-audit-muted">{t('audit.filter')} {' '}<select value={filter} onChange={e => { setFilter(e.target.value as typeof filter); setLimit(5) }}>
        {(['all', 'exempt', 'allow', 'ask', 'deny', 'failure', 'other'] as const).map(key => <option key={key} value={key}>{t(key === 'allow' ? 'audit.filterAllow' : key === 'deny' ? 'audit.filterDeny' : `audit.${key}`)}</option>)}
      </select></label>
      <span className="sl-audit-muted">{filtered.length} {t('audit.calls')} · {records.length} {t('audit.events')}</span>
    </div>
    {!loaded && !error ? <p className="sl-audit-empty">{t('audit.loading')}</p>
      : loaded && filtered.length === 0 ? <p className="sl-audit-empty sl-audit-muted">{t(records.length ? 'audit.searchEmpty' : 'audit.empty')}</p> : null}
    {filtered.slice(0, limit).map(entry => {
      const record = entry.latest
      const reason = entry.records.find(r => r.decision !== 'human-settled')?.reason ?? record.reason
      return <details className="sl-audit-entry" key={entry.key} data-category={entry.category}>
        <summary><div className="sl-audit-topline"><span className="sl-audit-badge">{t(label(record))}</span><strong>{record.toolName}</strong><time className="sl-audit-time" dateTime={new Date(record.at).toISOString()}>{time(record.at, t('audit.locale'))}</time><span aria-hidden="true" className="sl-audit-chevron">›</span></div>
          <div className="sl-audit-reason">{reason}</div></summary>
        <div className="sl-audit-detail">
          {[...entry.records].reverse().map((step, i) => <div key={i} className="sl-audit-step">
            <strong>{t(label(step))}</strong> <span className="sl-audit-muted">{time(step.at, t('audit.locale'))}</span><p>{step.reason}</p>
            <div className="sl-audit-meta"><span>{t(step.decision === 'outbound-blocked' ? 'audit.destinationModel' : 'audit.model')}: {step.model || '—'}</span><span>{t('audit.duration')}: {step.durationMs === null ? t('audit.unknown') : `${(step.durationMs / 1000).toFixed(1)} ${t('audit.seconds')}`}</span><span>{t('audit.tier')}: {step.tier === 'daily' ? t('audit.daily') : step.tier === 'strict' ? t('audit.strict') : step.tier}</span></div>
          </div>)}
          <div className="sl-audit-muted">{t('audit.session')}: {record.sessionId || '—'}<br />{t('audit.call')}: {record.callId || '—'}</div>
        </div>
      </details>
    })}
    <div className="sl-audit-footer">{filtered.length > limit && <button type="button" onClick={() => setLimit(n => n + 25)}>{t('audit.more')}</button>}{limit > 5 && <button type="button" onClick={() => setLimit(5)}>{t('audit.less')}</button>}</div>
  </section>
}
