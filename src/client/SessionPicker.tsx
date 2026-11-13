/** Adapted from DeepSeek Harness ui-permission-presets/src/client/
 * PermissionSelect.tsx, presentation.ts and PermissionSelect.module.css
 * (MIT, Copyright (c) 2026 DeepSeek).
 * Native Menu, permission artwork and risk dialog are preserved.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import {
  IconChevronDownOutlineRegular, Menu, PermissionIconAutoReviewRegular,
  PermissionIconFullAccessRegular, PermissionIconReadOnlyRegular,
  PermissionIconWorkspaceWriteRegular, RiskConfirmation,
} from './native-primitives.ts'
import type { PropsRuntime, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-permission-presets/client'
import type { CatalogState, SnapshotSource } from './session-catalog.ts'

export interface SessionPickerInjected {
  sessionKey: string
  catalogStore: SnapshotSource<CatalogState>
  retryCatalog: () => void
  select: (preset: string) => Promise<boolean>
}
export type SessionPickerProps = PropsRuntime<'conversation.input.permission'>
  & SessionPickerInjected & PropsLocale<'second-look.permission'>

const DAILY = 'second-look-daily'
const STRICT = 'second-look-strict'
const FULL = 'danger-full-access'
const AUTO = 'auto'
const icons: Record<string, ReactNode> = {
  'read-only': <PermissionIconReadOnlyRegular />,
  'workspace-write': <PermissionIconWorkspaceWriteRegular />,
  [FULL]: <PermissionIconFullAccessRegular />,
  [AUTO]: <PermissionIconAutoReviewRegular />,
  [DAILY]: <ReviewIcon />,
  [STRICT]: <ReviewIcon enhanced />,
}
/** Original glyphs use the host permission family's 16px currentColor outline. */
export function ReviewIcon({ enhanced = false }: { enhanced?: boolean }): React.ReactElement {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M8 1.75 13 3.6v4.1c0 3-2 5.15-5 6.55-3-1.4-5-3.55-5-6.55V3.6L8 1.75Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
    <path d={enhanced ? 'm4.7 8 1.45 1.45L9.4 6.2m-.9 3.25 2.8-2.8' : 'm5.5 8 1.65 1.65 3.4-3.4'} stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}

const STYLES = `
.sl-permission{display:inline-flex;align-items:center;gap:4px;min-width:0;max-width:220px;height:28px;padding:0 4px 0 8px;border:none;border-radius:var(--dsw-radius-sm);outline:none;background:transparent;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;font-weight:500;cursor:pointer}
.sl-permission:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.sl-permission:focus-visible{box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}
.sl-permission:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.sl-permission-icon,.sl-permission-chevron{display:inline-flex;flex:0 0 auto}
.sl-permission-icon svg{width:14px;height:14px}
.sl-permission-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sl-permission-option{display:inline-flex;align-items:center;gap:4px;min-width:0;max-width:100%}
.sl-permission-badge{flex:none;color:var(--dsw-alias-label-tertiary);font-size:8px;line-height:10px;font-weight:500;letter-spacing:.2px}
.sl-permission-chevron{color:var(--dsw-alias-label-caption);transition:transform 120ms ease}
.sl-permission-open{transform:rotate(180deg)}
.sl-permission-error{font-size:12px;color:var(--dsw-alias-state-error-primary)}
@container(max-width:460px){.sl-permission:has(.sl-permission-icon) .sl-permission-label{display:none}}
`

export function SessionPicker({
  locked, sessionKey, catalogStore, retryCatalog, select, useProjection, t,
}: SessionPickerProps): React.ReactElement | null {
  const selection = useProjection('permissions')
  const state = useSyncExternalStore(catalogStore.subscribe, catalogStore.getSnapshot, catalogStore.getSnapshot)
  const [pick, setPick] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [failed, setFailed] = useState(false)
  const request = useRef(0)
  const currentValue = selection?.currentValue
  const catalog = state.value
  useEffect(() => {
    ++request.current
    setPick(null)
    setFailed(false)
    return () => { ++request.current }
  }, [sessionKey, state.connected])
  useEffect(() => {
    setOpen(false)
    setConfirmation(null)
    setAcknowledged(false)
  }, [sessionKey, locked, state.revision, currentValue])


  if (selection === undefined) return null
  const label = (value: string, name = value): string => {
    if (value === DAILY) return t('review.daily')
    if (value === STRICT) return t('review.strict')
    if (value === AUTO) return t('auto.label')
    const defaults = { 'read-only': ['preset.readOnly', 'Read Only'], 'workspace-write': ['preset.workspaceWrite', 'Workspace Write'], [FULL]: ['preset.fullAccess', 'Full access'] } as const
    const entry = defaults[value as keyof typeof defaults]
    if (entry !== undefined && (name === value || name === entry[1])) return t(entry[0])
    return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) ? name.split('-').map(word => word[0]!.toUpperCase() + word.slice(1)).join(' ') : name
  }
  const visibleOptions = catalog?.options ?? []
  const displayedValue = pick !== null && visibleOptions.some(option => option.value === pick) ? pick : selection.currentValue
  const current = catalog?.options.find(option => option.value === displayedValue)
  const currentLabel = label(displayedValue, current?.name)
  const submit = (id: string): void => {
    const token = ++request.current
    setPick(id)
    setFailed(false)
    void Promise.resolve().then(() => select(id)).catch(() => false).then(ok => {
      if (request.current !== token) return
      setPick(null)
      setFailed(!ok)
    })
  }
  const choose = (id: string): void => {
    setOpen(false)
    if (locked || pick !== null || !visibleOptions.some(option => option.value === id) || id === selection.currentValue) return
    if (id === FULL || id === AUTO) { setAcknowledged(false); setConfirmation(id) }
    else submit(id)
  }
  const closeConfirmation = (): void => { setAcknowledged(false); setConfirmation(null) }
  const auto = confirmation === AUTO
  return <>
    <style>{STYLES}</style>
    {catalog === null ? <button type="button" className="sl-permission" disabled={!state.connected || !state.error} onClick={retryCatalog}>
      {t(!state.connected ? 'review.offline' : state.error ? 'review.retry' : 'review.loading')}
    </button> : <Menu open={open} items={visibleOptions.map(option => ({
      id: option.value,
      label: option.value === AUTO ? <span className="sl-permission-option" aria-label={`${label(option.value, option.name)} ${t('auto.badge')}`}><span>{label(option.value, option.name)}</span><span className="sl-permission-badge">{t('auto.badge')}</span></span> : label(option.value, option.name),
      ...(icons[option.value] === undefined ? {} : { icon: icons[option.value] }),
    }))} selectedId={displayedValue} onSelect={choose} onClose={() => { setOpen(false) }} side="top" portal anchor={
      <button type="button" className="sl-permission" aria-label={t('mode', { name: currentLabel })}
        title={displayedValue === AUTO ? t('auto.description') : current?.description}
        disabled={locked || pick !== null || confirmation !== null} onClick={() => { setOpen(value => !value) }}>
        {icons[displayedValue] === undefined ? null : <span className="sl-permission-icon" aria-hidden>{icons[displayedValue]}</span>}
        <span className="sl-permission-label">{currentLabel}</span>
        <span className={`sl-permission-chevron${open ? ' sl-permission-open' : ''}`} aria-hidden><IconChevronDownOutlineRegular /></span>
      </button>
    } />}
    {failed ? <span role="status" className="sl-permission-error">{t('review.failed')}</span> : null}
    {confirmation !== null && catalog !== null ? <RiskConfirmation open
      title={t(auto ? 'auto.confirm.title' : 'confirm.title')}
      description={t(auto ? 'auto.confirm.description' : 'confirm.description')}
      acknowledgeLabel={t(auto ? 'auto.confirm.acknowledge' : 'confirm.acknowledge')}
      cancelLabel={t('confirm.cancel')} closeLabel={t('close')}
      confirmLabel={t(auto ? 'auto.confirm.enable' : 'confirm.enable')}
      acknowledged={acknowledged} disabled={locked} onAcknowledgedChange={setAcknowledged}
      onCancel={closeConfirmation} onConfirm={() => {
        if (locked || !acknowledged || !visibleOptions.some(option => option.value === confirmation)) return
        closeConfirmation(); submit(confirmation)
      }} /> : null}
  </>
}
