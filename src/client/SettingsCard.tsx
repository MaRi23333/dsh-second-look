import { ReviewerRoute, reasoningLabel, type ReviewerRouteValue } from './ReviewerRoute.tsx'
import type { ReviewerCatalog, ReviewerCatalogResult } from './reviewer-catalog.ts'
import { AuditPanel } from './AuditPanel.tsx'
/**
 * Modified for dsh-second-look, 2026-10-31 (部署后补: 客户端内置设置面板;
 * 2026-11-02 oil-ui 存量优化 — quiet operations console).
 *
 * The in-client settings section: independent reviewer route (provider,
 * model, manual reasoning-effort id), the strict-tier override, the two-tier
 * budgets. Session tiers are selected in the composer permission menu.
 * Names, budgets and effort ids only — the Host-side store rejects
 * credential-shaped keys/values.
 */

import { useEffect, useRef, useState } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { SettingsKey } from './settings-locales.ts'
import type { GateConfigView, GatePatch, GateStatusView, AuditResponse } from './settings-api.ts'

export interface GateSettingsInjected {
  modelCatalog?: () => Promise<ReviewerCatalogResult>
  t: (key: SettingsKey) => string
  config: () => Promise<GateConfigView>
  saveConfig: (patch: GatePatch) => Promise<GateConfigView>
  status: () => Promise<GateStatusView>
  audit: () => Promise<AuditResponse>
  clearAudit: (scope?: 'recent' | 'blocked') => Promise<{ ok: boolean; error?: string }>
}

export type GateSettingsProps =
  PropsRuntime<'settings.section'>
  & InjectFace<GateSettingsInjected>

type TextFieldKey =
  | 'reviewerModelProvider'
  | 'reviewerModel'
  | 'reviewerReasoningEffort'
  | 'strictReviewerModelProvider'
  | 'strictReviewerModel'
  | 'strictReviewerReasoningEffort'
  | 'evidenceRoundsDaily'
  | 'totalTimeoutMsDaily'
  | 'maxEvidenceItemsDaily'
  | 'evidenceRoundsStrict'
  | 'totalTimeoutMsStrict'
  | 'maxEvidenceItemsStrict'

const NUMERIC_KEYS: ReadonlySet<TextFieldKey> = new Set<TextFieldKey>([
  'evidenceRoundsDaily', 'totalTimeoutMsDaily', 'maxEvidenceItemsDaily',
  'evidenceRoundsStrict', 'totalTimeoutMsStrict', 'maxEvidenceItemsStrict',
])

type RowWidth = 'wide' | 'narrow'
const CSS_TAG = '@deepseek-ai/dsh-second-look/SettingsCard.css'

const STYLES = `
.sl-wrap{display:flex;flex-direction:column;padding:4px 0 32px;color:var(--dsw-alias-label-primary)}
.sl-head{position:sticky;top:0;z-index:5;padding:4px 0 12px;background:var(--dsw-alias-bg-layer-1);border-bottom:0.5px solid var(--dsw-alias-border-l2)}
.sl-headRow{display:flex;align-items:center;justify-content:space-between;gap:16px}
.sl-brand{display:flex;align-items:center;gap:10px;min-width:0}
.sl-mark{display:grid;place-items:center;width:28px;height:28px;flex:none;border:0.5px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary);font-size:15px;font-weight:700}
.sl-title{margin:0;font-size:20px;font-weight:650;line-height:28px;letter-spacing:-.01em;color:var(--dsw-alias-label-primary)}
.sl-headActions{display:flex;align-items:center;justify-content:flex-end;gap:12px;flex:none}
.sl-saveState{display:flex;align-items:center;gap:6px;max-width:180px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.sl-saveState:before{content:"";width:6px;height:6px;flex:none;border-radius:50%;background:var(--dsw-alias-state-warn-primary)}
.sl-saveStateSaved:before{background:var(--dsw-alias-state-success-primary)}
.sl-saveStateInvalid{color:var(--dsw-alias-state-error-primary)}
.sl-saveStateInvalid:before{background:var(--dsw-alias-state-error-primary)}
.sl-save{appearance:none;min-width:72px;height:34px;padding:0 16px;border:0.5px solid transparent;border-radius:8px;background:var(--dsw-alias-brand-primary);color:#fff;font:inherit;font-size:13px;font-weight:550;cursor:pointer;transition:transform 120ms ease,opacity 120ms ease,background 120ms ease}
.sl-save:hover:not(:disabled){opacity:.9}
.sl-save:active:not(:disabled){transform:scale(.98)}
.sl-save:disabled{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);opacity:.55;cursor:default}
.sl-save:focus-visible,.sl-reset:focus-visible,.sl-retry:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
.sl-intro{padding:14px 0 12px}
.sl-blurb{margin:0;max-width:660px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.sl-status{display:flex;align-items:center;gap:8px 14px;flex-wrap:wrap;min-height:40px;padding:9px 12px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-2);font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.sl-health{display:inline-flex;align-items:center;gap:7px;flex:none;color:var(--dsw-alias-label-primary);font-weight:500}
.sl-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-success-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent);flex:none}
.sl-dotBad{background:var(--dsw-alias-state-error-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent)}
.sl-statusRoute{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family-mono,monospace);font-size:11px}
.sl-statusMeta{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sl-statusFile{margin-left:auto;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sl-section{margin-top:22px;padding-top:20px;border-top:0.5px solid var(--dsw-alias-border-l2)}
.sl-sectionHead{display:flex;flex-direction:column;gap:3px;margin-bottom:6px}
.sl-sectionTitle{margin:0;font-size:14px;font-weight:600;line-height:20px;color:var(--dsw-alias-label-primary)}
.sl-sectionDesc{margin:0;max-width:660px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.sl-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:16px;padding:14px 0;border-top:0.5px solid var(--dsw-alias-border-l2)}
.sl-rowText{display:flex;flex-direction:column;gap:2px;min-width:0;cursor:pointer}
.sl-rowTitle{font-size:13px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-primary)}
.sl-rowDesc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.sl-rowDescInvalid{color:var(--dsw-alias-state-error-primary)}
.sl-control{display:flex;align-items:center;justify-content:flex-end;gap:8px;min-width:0}
.sl-input{box-sizing:border-box;width:230px;height:36px;min-width:0;padding:0 11px;border:0.5px solid var(--dsw-alias-border-l4);border-radius:8px;outline:none;background:var(--dsw-alias-bg-base);font:inherit;font-size:13px;color:var(--dsw-alias-label-primary);transition:border-color 120ms ease,box-shadow 120ms ease}
.sl-input:hover{border-color:var(--dsw-alias-label-secondary)}
.sl-input:focus-visible{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary) 14%,transparent)}
.sl-input[aria-invalid="true"]{border-color:var(--dsw-alias-state-error-primary)}
.sl-inputNarrow{width:88px;text-align:right;font-variant-numeric:tabular-nums}
.sl-unit{flex:none;min-width:2em;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.sl-resetSlot{display:flex;justify-content:flex-end;width:48px;flex:none}
.sl-reset{appearance:none;height:30px;padding:0 7px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
.sl-reset:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.sl-budgetGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px}
.sl-budget{min-width:0;padding:0 14px 6px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-2)}
.sl-budgetTitle{margin:0;padding:12px 0 10px;font-size:13px;font-weight:600;line-height:20px;color:var(--dsw-alias-label-primary)}
.sl-budget .sl-row{grid-template-columns:minmax(0,1fr);gap:8px;padding:12px 0}
.sl-budget .sl-control{justify-content:flex-start;width:100%}
.sl-budget .sl-inputNarrow{flex:1;width:auto;min-width:0;text-align:left}
.sl-budget .sl-resetSlot{margin-left:auto}
.sl-note{margin:10px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.sl-noteError{font-size:13px;line-height:1.6;padding:10px 12px;border:0.5px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 35%,transparent);border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 6%,transparent);color:var(--dsw-alias-state-error-primary)}
.sl-state{display:flex;flex-direction:column;align-items:flex-start;gap:10px;margin-top:20px;padding:24px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-2);font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.sl-retry{appearance:none;height:32px;padding:0 12px;border:0.5px solid var(--dsw-alias-border-l4);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer}
@media(max-width:720px){
  .sl-headRow{gap:10px}.sl-headActions{gap:8px}.sl-saveState{max-width:130px}.sl-mark{display:none}
  .sl-row{grid-template-columns:minmax(0,1fr);gap:8px;padding:13px 0}
  .sl-control{justify-content:flex-start;width:100%}.sl-input{flex:1;width:auto}.sl-resetSlot{margin-left:auto}
  .sl-budgetGrid{grid-template-columns:minmax(0,1fr)}
  .sl-statusFile{margin-left:0}.sl-statusMeta{max-width:100%}
}
@media(max-width:480px){.sl-saveState{display:none}.sl-title{font-size:18px}.sl-headActions{gap:6px}}
@media(prefers-reduced-motion:reduce){.sl-save,.sl-input{transition:none}}
.sl-head{padding-bottom:0;border-bottom:0}
.sl-ready{display:flex;align-items:center;gap:8px;margin:14px 0 4px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.sl-readyRoute{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary)}
.sl-tabs{display:flex;gap:24px;border-bottom:1px solid var(--dsw-alias-border-l2);margin-top:12px}
.sl-tabs button{appearance:none;border:0;border-bottom:2px solid transparent;padding:10px 0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:14px;cursor:pointer;transition:color 120ms,border-color 120ms}
.sl-tabs button[aria-selected=true]{color:var(--dsw-alias-label-primary);font-weight:600;border-bottom-color:var(--dsw-alias-brand-primary)}
.sl-routeSection{padding:24px 0 18px}.sl-routeSection .sl-sectionHead{margin-bottom:20px}
.sl-modelFields{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:16px}
.sl-modelField{display:flex;flex-direction:column;gap:8px;min-width:0;font-size:13px;font-weight:500}
.sl-modelField .sl-input{flex:none;width:100%;max-width:none;height:38px;border:1px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:14px}
.sl-effortRow{display:flex;align-items:flex-end;gap:16px;margin-top:18px}.sl-effortRow .sl-modelField{max-width:320px;flex:1}
.sl-textButton{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-primary);padding:6px 0;font:inherit;font-size:13px;line-height:20px;cursor:pointer;transition:opacity 120ms,transform 120ms}
.sl-textButton:hover:not(:disabled){text-decoration:underline}.sl-textButton:active:not(:disabled){transform:translateY(1px)}.sl-textButton:disabled{opacity:.5;cursor:default}
.sl-textButton:focus-visible,.sl-tabs button:focus-visible,.sl-advanced summary:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:3px}
.sl-catalogStatus{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-top:10px;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}.sl-catalogStatus span:empty{display:none}.sl-catalogStatus button{margin-left:auto;flex:none}
.sl-strictSection{padding:18px 0;border-top:1px solid var(--dsw-alias-border-l2)}.sl-sectionRow{display:flex;align-items:center;justify-content:space-between;gap:16px}
.sl-inheritSummary,.sl-inlineHint{margin:7px 0 0;font-size:13px;line-height:21px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}.sl-strictSection .sl-routeEditor{padding-top:16px;animation:sl-reveal 160ms ease-out}
.sl-advanced{border-top:1px solid var(--dsw-alias-border-l2);padding:18px 0}.sl-advanced summary{cursor:pointer;font-size:14px;font-weight:550}.sl-advanced summary span{margin-left:14px;font-size:13px;font-weight:400;color:var(--dsw-alias-label-secondary)}.sl-advanced .sl-budgetGrid{margin-top:18px;animation:sl-reveal 160ms ease-out}
.sl-scopeNote{margin:8px 0 0;font-size:13px;line-height:21px;color:var(--dsw-alias-label-secondary)}
.sl-wrap [hidden]{display:none!important}.sl-noteError{margin-top:16px}.sl-saveState{font-size:13px}
@keyframes sl-reveal{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}
@media(max-width:740px){.sl-modelFields{grid-template-columns:1fr}.sl-headRow{align-items:flex-start;gap:8px}.sl-headActions{flex-wrap:wrap;gap:4px 12px;max-width:65%}.sl-saveState{max-width:160px;white-space:normal}.sl-ready{flex-wrap:wrap}.sl-readyRoute{flex-basis:100%;margin-left:15px}.sl-catalogStatus{align-items:flex-start}.sl-advanced summary span{display:block;margin:6px 0 0 17px}.sl-effortRow{flex-wrap:wrap}.sl-inheritSummary{max-width:100%}}
@media(prefers-reduced-motion:reduce){.sl-routeEditor,.sl-budgetGrid{animation:none!important}.sl-textButton,.sl-tabs button,.sl-save{transition:none!important}}

`

function ensureStyles(): void {
  if (typeof document === 'undefined') return
  const previous = document.querySelector<HTMLStyleElement>(`style[data-plugin-css="${CSS_TAG}"]`)
  if (previous !== null) {
    if (previous.textContent !== STYLES) previous.textContent = STYLES
    return
  }
  const tag = document.createElement('style')
  tag.dataset.pluginCss = CSS_TAG
  tag.textContent = STYLES
  document.head.appendChild(tag)
}

function textOf(view: GateConfigView, key: TextFieldKey): string {
  const direct = (view as unknown as Record<string, unknown>)[key]
  if (typeof direct === 'string') return direct
  const group = key.endsWith('Strict') ? view.strict : key.endsWith('Daily') ? view.daily : undefined
  const suffix = key.startsWith('evidenceRounds') ? 'evidenceRounds'
    : key.startsWith('totalTimeoutMs') ? 'totalTimeoutMs' : 'maxEvidenceItems'
  const nested = (group as Record<string, unknown> | undefined)?.[suffix]
  return typeof nested === 'number' ? String(nested) : ''
}

function validDraft(key: TextFieldKey, draft: string): boolean {
  const trimmed = draft.trim()
  if (trimmed === '') return true
  if (!NUMERIC_KEYS.has(key)) return true
  const parsed = Number(trimmed)
  return Number.isSafeInteger(parsed) && (key.startsWith('evidenceRounds') ? parsed >= 0 : parsed > 0)
}

export function GateSettings(props: GateSettingsProps): React.ReactElement {
  const { t, config, saveConfig, status } = props
  const [tab, setTab] = useState<'settings' | 'history'>('settings')
  const [strictOpen, setStrictOpen] = useState(false)
  const [catalog, setCatalog] = useState<ReviewerCatalog | null>(null)
  const [catalogState, setCatalogState] = useState<'loading' | 'ready' | 'error'>('loading')
  const catalogSerial = useRef(0)
  const [view, setView] = useState<GateConfigView | null>(null)
  const [drafts, setDrafts] = useState<Record<TextFieldKey, string>>(() => emptyDrafts())
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [statusView, setStatusView] = useState<GateStatusView | null>(null)
  const alive = useRef(true)
  const configSerial = useRef(0)

  useEffect(() => {
    alive.current = true
    ensureStyles()
    return () => { alive.current = false }
  }, [])

  const refreshStatus = (): void => {
    void status().then((result) => {
      if (alive.current) setStatusView(result)
    }).catch(() => {
      if (alive.current) setStatusView({ ok: false })
    })
  }

  const applyView = (result: GateConfigView): void => {
    setView(result)
    const next = emptyDrafts()
    for (const key of Object.keys(next) as TextFieldKey[]) next[key] = textOf(result, key)
    setDrafts(next)
  }

  useEffect(() => {
    const version = ++configSerial.current
    void config().then((result) => {
      if (!alive.current || version !== configSerial.current) return
      if (!result.ok) { setLoadFailed(true); return }
      setLoadFailed(false)
      applyView(result)
    }).catch(() => {
      if (alive.current && version === configSerial.current) setLoadFailed(true)
    })
    refreshStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, reloadKey])

  const refreshCatalog = (): void => {
    const version = ++catalogSerial.current
    setCatalogState('loading')
    void (props.modelCatalog?.() ?? Promise.resolve({ ok: false } as const)).then(result => {
      if (!alive.current || version !== catalogSerial.current) return
      if (result.ok) { setCatalog(result.value); setCatalogState('ready') }
      else setCatalogState('error')
    }).catch(() => { if (alive.current && version === catalogSerial.current) setCatalogState('error') })
  }
  useEffect(() => { refreshCatalog(); return () => { ++catalogSerial.current } }, [props.modelCatalog])

  const savedKeys = new Set(view?.savedKeys ?? [])
  const invalidKeys = (Object.keys(drafts) as TextFieldKey[]).filter(key => !validDraft(key, drafts[key]))
  const dirty = view !== null && (Object.keys(drafts) as TextFieldKey[]).some(key => drafts[key] !== (view === null ? '' : textOf(view, key)))

  const edit = (key: TextFieldKey, text: string): void => {
    setDrafts(current => ({ ...current, [key]: text }))
    setSavedAt(null)
    setSaveError(null)
  }

  const resetField = (key: TextFieldKey): void => edit(key, '')

  const onSave = (): void => {
    if (saving || !dirty || invalidKeys.length > 0) return
    setSaving(true)
    setSaveError(null)
    setSavedAt(null)
    const patch: Record<string, string | number | null> = {}
    for (const key of Object.keys(drafts) as TextFieldKey[]) {
      if (view !== null && drafts[key] === textOf(view, key)) continue
      const trimmed = drafts[key].trim()
      if (trimmed === '') { patch[key] = null; continue }
      if (NUMERIC_KEYS.has(key)) patch[key] = Number(trimmed)
      else patch[key] = trimmed
    }
    void saveConfig(patch as GatePatch).then((result) => {
      if (!alive.current) return
      if (!result.ok) { setSaveError(result.error ?? 'update-failed'); setSaving(false); return }
      applyView(result)
      setSaving(false)
      setSavedAt(Date.now())
      refreshStatus()
    }).catch(() => {
      if (!alive.current) return
      setSaveError('connection-failed')
      setSaving(false)
    })
  }

  const field = (key: TextFieldKey, label: SettingsKey, desc: SettingsKey, width: RowWidth = 'wide', placeholder?: SettingsKey, unit?: SettingsKey) => {
    const invalid = !validDraft(key, drafts[key])
    const changed = drafts[key] !== (view === null ? '' : textOf(view, key))
    const inputId = `sl-${key}`
    return <div className="sl-row">
      <label className="sl-rowText" htmlFor={inputId}>
        <span className="sl-rowTitle">{t(label)}</span>
        <span className={`sl-rowDesc${invalid ? ' sl-rowDescInvalid' : ''}`} id={`${inputId}-desc`}>{invalid ? t('settings.invalidNumber') : t(desc)}</span>
      </label>
      <div className="sl-control">
        <input id={inputId} name={key} className={`sl-input${width === 'narrow' ? ' sl-inputNarrow' : ''}`} value={drafts[key]} disabled={saving}
          placeholder={placeholder ? t(placeholder) : undefined} onChange={event => edit(key, event.target.value)}
          aria-invalid={invalid} aria-describedby={`${inputId}-desc`} inputMode={NUMERIC_KEYS.has(key) ? 'numeric' : undefined}
          autoComplete="off" spellCheck={false} />
        {unit && <span className="sl-unit">{t(unit)}</span>}
        <span className="sl-resetSlot">{(savedKeys.has(key) || changed) && <button type="button" className="sl-reset" disabled={saving} title={t('settings.resetHint')} onClick={() => resetField(key)}>{t('settings.reset')}</button>}</span>
      </div>
    </div>
  }

  const budget = (tier: 'Daily' | 'Strict') => <div className="sl-budget">
    <h4 className="sl-budgetTitle">{t(tier === 'Daily' ? 'settings.dailyLabel' : 'settings.strictLabel')}</h4>
    {field(`evidenceRounds${tier}`, 'settings.evidenceRounds', 'settings.evidenceRounds.desc', 'narrow', undefined, 'settings.unit.rounds')}
    {field(`totalTimeoutMs${tier}`, 'settings.totalTimeoutMs', 'settings.totalTimeoutMs.desc', 'narrow', undefined, 'settings.unit.ms')}
    {field(`maxEvidenceItems${tier}`, 'settings.maxEvidenceItems', 'settings.maxEvidenceItems.desc', 'narrow', undefined, 'settings.unit.items')}
  </div>

  const saveState = invalidKeys.length > 0 ? 'settings.invalidValues' : dirty ? 'settings.unsaved' : savedAt !== null ? 'settings.saved' : null

  const baseRoute: ReviewerRouteValue = { provider: drafts.reviewerModelProvider, model: drafts.reviewerModel, effort: drafts.reviewerReasoningEffort }
  const strictRoute: ReviewerRouteValue = { provider: drafts.strictReviewerModelProvider, model: drafts.strictReviewerModel, effort: drafts.strictReviewerReasoningEffort }
  const setRoute = (strict: boolean, route: ReviewerRouteValue): void => {
    setDrafts(current => strict ? { ...current, strictReviewerModelProvider: route.provider, strictReviewerModel: route.model, strictReviewerReasoningEffort: route.effort }
      : { ...current, reviewerModelProvider: route.provider, reviewerModel: route.model, reviewerReasoningEffort: route.effort })
    setSavedAt(null); setSaveError(null)
  }
  const hasStrict = Object.values(strictRoute).some(Boolean)
  const configured = Boolean(view?.reviewerModel && view?.reviewerModelProvider)
  const serviceOk = statusView?.ok === true && statusView.healthy === true
  const selectTab = (next: typeof tab): void => { setTab(next) }
  const tabKeys = ['settings', 'history'] as const
  return <div className="sl-wrap">
    <header className="sl-head">
      <div className="sl-headRow">
        <div className="sl-brand"><span className="sl-mark" aria-hidden="true">✓</span><h2 className="sl-title">{t('settings.title')}</h2></div>
        <div className="sl-headActions">
          {saveState && <span className={`sl-saveState${savedAt !== null && !dirty ? ' sl-saveStateSaved' : ''}${invalidKeys.length > 0 ? ' sl-saveStateInvalid' : ''}`} role="status">{t(saveState)}</span>}
          {dirty && <button type="button" className="sl-textButton sl-discard" disabled={saving} onClick={() => { if (view) applyView(view); setSaveError(null); setSavedAt(null) }}>{t('settings.discard')}</button>}
          {(tab === 'settings' || dirty) && <button type="button" className="sl-save" onClick={onSave} disabled={!dirty || saving || invalidKeys.length > 0}>{saving ? t('settings.saving') : t('settings.save')}</button>}
        </div>
      </div>
      {view && <div className="sl-ready" aria-label={t('settings.health')}>
        <span className={`sl-dot${serviceOk && configured ? '' : ' sl-dotBad'}`} />
        <span>{t(statusView?.ok === false ? 'settings.statusUnavailable' : !serviceOk && statusView ? 'settings.unhealthy' : configured ? 'settings.configured' : 'settings.notConfigured')}</span>
        {configured && <span className="sl-readyRoute" title={`${view.reviewerModelProvider} / ${view.reviewerModel}`}>{view.reviewerModelProvider} / {view.reviewerModel}</span>}
      </div>}
      <nav className="sl-tabs" role="tablist" aria-label={t('settings.title')}>
        {tabKeys.map((value,index) => <button type="button" key={value} id={`sl-tab-${value}`} role="tab" aria-selected={tab === value} aria-controls={`sl-panel-${value}`} tabIndex={tab === value ? 0 : -1}
          onClick={() => selectTab(value)} onKeyDown={event => {
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : event.key === 'ArrowRight' || event.key === 'ArrowLeft' ? 1-index : undefined
            if (next !== undefined) { event.preventDefault(); selectTab(tabKeys[next]!); document.getElementById(`sl-tab-${tabKeys[next]}`)?.focus() }
          }}>{t(value === 'settings' ? 'settings.tabSettings' : 'settings.tabHistory')}</button>)}
      </nav>
    </header>
    {saveError && <p className="sl-note sl-noteError" role="alert">{t(saveError === 'save-failed' ? 'settings.errorStorage' : saveError === 'credential-key' ? 'settings.errorCredential' : ['invalid-value', 'invalid-patch', 'unknown-key'].includes(saveError) ? 'settings.errorInput' : 'settings.errorNetwork')}</p>}
    {view === null ? <div className="sl-state" role={loadFailed ? 'alert' : 'status'}>
      <span>{t(loadFailed ? 'settings.loadFailed' : 'settings.loading')}</span>
      {loadFailed && <button type="button" className="sl-retry" onClick={() => { setLoadFailed(false); setReloadKey(key => key + 1) }}>{t('settings.retry')}</button>}
    </div> : <>
      <div id="sl-panel-settings" role="tabpanel" aria-labelledby="sl-tab-settings" hidden={tab !== 'settings'}>
        <section className="sl-routeSection" aria-labelledby="sl-route-title">
          <div className="sl-sectionHead"><h3 className="sl-sectionTitle" id="sl-route-title">{t('settings.modelSetup')}</h3><p className="sl-sectionDesc">{t('settings.modelSetupHint')}</p></div>
          <ReviewerRoute id="sl-base" value={baseRoute} catalog={catalog} disabled={saving} t={t} onChange={route => setRoute(false, route)} />
          <div className="sl-catalogStatus">
            <span role="status">{catalogState === 'loading' ? t('settings.catalogLoading') : catalogState === 'error' ? t('settings.catalogFailed') : catalog?.failures.length ? t('settings.catalogPartial') : ''}</span>
            <button type="button" className="sl-textButton" disabled={catalogState === 'loading'} onClick={refreshCatalog}>{t('settings.catalogRefresh')}</button>
          </div>
        </section>
        <section className="sl-strictSection" aria-labelledby="sl-strict-title">
          <div className="sl-sectionRow"><h3 className="sl-sectionTitle" id="sl-strict-title">{t('settings.enhancedModel')}</h3>
            <button type="button" className="sl-textButton" aria-expanded={strictOpen} aria-controls="sl-strict-editor" onClick={() => setStrictOpen(value => !value)}>{t(strictOpen ? 'settings.hideRoute' : hasStrict ? 'settings.editRoute' : 'settings.configureSeparately')}</button></div>
          <p className="sl-inheritSummary">{t(hasStrict ? 'settings.customRoute' : 'settings.reusesBase')}
            {hasStrict && <span> · {strictRoute.provider || baseRoute.provider} / {strictRoute.model || baseRoute.model} · {t('settings.reasoningSelect')}: {reasoningLabel(strictRoute.effort || baseRoute.effort, t) || t('settings.effortDefault')} ({t(strictRoute.effort ? 'settings.explicitEffort' : 'settings.inheritBase')})</span>}</p>
          <div id="sl-strict-editor" hidden={!strictOpen}>
            {hasStrict && <button type="button" className="sl-textButton sl-resetRoute" disabled={saving} onClick={() => setRoute(true, { provider: '', model: '', effort: '' })}>{t('settings.resetRoute')}</button>}
            <p className="sl-inlineHint">{t('settings.resetRouteHint')}</p>
            <ReviewerRoute id="sl-strict" value={strictRoute} inherited={baseRoute} catalog={catalog} disabled={saving} t={t} onChange={route => setRoute(true, route)} />
          </div>
        </section>
        <details className="sl-advanced">
          <summary>{t('settings.advanced')}<span>{t(invalidKeys.length ? 'settings.invalidValues' : 'settings.budget')}</span></summary>
          <div className="sl-budgetGrid">{budget('Daily')}{budget('Strict')}</div>
        </details>
        <p className="sl-scopeNote">{t('settings.globalHint')}</p>
      </div>
      <div id="sl-panel-history" role="tabpanel" aria-labelledby="sl-tab-history" hidden={tab !== 'history'}>
        {dirty && <p className="sl-inlineHint">{t('settings.unsavedTab')}</p>}
        <AuditPanel t={t} audit={props.audit} clearAudit={props.clearAudit} enabled={tab === 'history'} />
      </div>
    </>}
  </div>
}

function emptyDrafts(): Record<TextFieldKey, string> {
  return {
    reviewerModelProvider: '', reviewerModel: '', reviewerReasoningEffort: '',
    strictReviewerModelProvider: '', strictReviewerModel: '', strictReviewerReasoningEffort: '',
    evidenceRoundsDaily: '', totalTimeoutMsDaily: '', maxEvidenceItemsDaily: '',
    evidenceRoundsStrict: '', totalTimeoutMsStrict: '', maxEvidenceItemsStrict: '',
  }
}
