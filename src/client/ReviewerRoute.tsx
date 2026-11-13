import { useState } from 'react'
import type { ReviewerCatalog } from './reviewer-catalog.ts'
import type { SettingsKey } from './settings-locales.ts'

export interface ReviewerRouteValue { provider: string; model: string; effort: string }
export interface ReviewerRouteProps {
  id: string
  value: ReviewerRouteValue
  inherited?: ReviewerRouteValue
  catalog: ReviewerCatalog | null
  disabled: boolean
  t: (key: SettingsKey) => string
  onChange: (value: ReviewerRouteValue) => void
}

/** Unknown saved routes remain visible and editable even when discovery fails. */
export function ReviewerRoute({ id, value, inherited, catalog, disabled, t, onChange }: ReviewerRouteProps) {
  const [manual, setManual] = useState(false)
  const [effortReset, setEffortReset] = useState(false)
  const groups = catalog?.groups ?? []
  const provider = value.provider || inherited?.provider || ''
  const model = value.model || inherited?.model || ''
  const models = groups.find(group => group.id === provider)?.models ?? []
  const selected = models.find(item => item.id === model)
  const efforts = selected?.reasoning?.efforts ?? []
  const inheritedLabel = inherited ? t('settings.inheritBase') : t('settings.providerDefault')
  const update = (key: keyof ReviewerRouteValue, next: string): void => {
    const changed = { ...value, [key]: next }
    if (key === 'provider') changed.model = ''
    if (key === 'provider' || key === 'model') {
      // Deliberate route changes must not silently carry an old model's effort.
      changed.effort = ''
      setEffortReset(value.effort !== '')
    } else setEffortReset(false)
    onChange(changed)
  }
  const input = (key: keyof ReviewerRouteValue, label: SettingsKey, placeholder: string) => <label className="sl-modelField" htmlFor={`${id}-${key}`}>
    <span>{t(label)}</span><input className="sl-input" id={`${id}-${key}`} value={value[key]} disabled={disabled}
      onChange={event => update(key, event.target.value)} placeholder={placeholder} autoComplete="off" spellCheck={false} />
  </label>
  return <div className="sl-routeEditor">
    <div className="sl-modelFields">
      {manual || !catalog ? <>
        {input('provider', 'settings.providerSelect', inherited?.provider || t('settings.chooseProvider'))}
        {input('model', 'settings.modelSelect', inherited?.model || t('settings.chooseModel'))}
      </> : <>
        <label className="sl-modelField" htmlFor={`${id}-provider`}><span>{t('settings.providerSelect')}</span>
          <select className="sl-input" id={`${id}-provider`} value={value.provider} disabled={disabled} onChange={e => update('provider', e.target.value)}>
            <option value="">{inherited ? `${inheritedLabel}${inherited.provider ? ` · ${inherited.provider}` : ''}` : t('settings.chooseProvider')}</option>
            {value.provider && !groups.some(g => g.id === value.provider) && <option value={value.provider}>{value.provider} · {t('settings.currentCustom')}</option>}
            {groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
        </label>
        <label className="sl-modelField" htmlFor={`${id}-model`}><span>{t('settings.modelSelect')}</span>
          <select className="sl-input" id={`${id}-model`} value={value.model} disabled={disabled || !provider} onChange={e => update('model', e.target.value)}>
            <option value="">{inherited ? `${inheritedLabel}${inherited.model ? ` · ${inherited.model}` : ''}` : t('settings.chooseModel')}</option>
            {value.model && !models.some(m => m.id === value.model) && <option value={value.model}>{value.model} · {t('settings.currentCustom')}</option>}
            {models.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      </>}
    </div>
    <div className="sl-effortRow">
      {manual || !selected?.reasoning ? input('effort', 'settings.reasoningSelect', inherited ? inheritedLabel : t('settings.effortDefault')) :
        <label className="sl-modelField" htmlFor={`${id}-effort`}><span>{t('settings.reasoningSelect')}</span>
          <select className="sl-input" id={`${id}-effort`} disabled={disabled} value={value.effort} onChange={e => update('effort', e.target.value)}>
            <option value="">{inherited ? inheritedLabel : t('settings.effortDefault')}</option>
            {value.effort && !efforts.some(item => item.id === value.effort) && <option value={value.effort}>{value.effort} · {t('settings.currentCustom')}</option>}
            {efforts.map(item => <option key={item.id} value={item.id}>{reasoningLabel(item.id, t, item.name)}</option>)}
          </select>
        </label>}
      {catalog && <button type="button" className="sl-textButton" disabled={disabled} onClick={() => setManual(current => !current)}>{t(manual ? 'settings.pickFromList' : 'settings.manualEntry')}</button>}
    </div>
    {effortReset ? <p className="sl-inlineHint" role="status">{t('settings.effortCleared')}</p>
      : !manual && selected && !selected.reasoning ? <p className="sl-inlineHint">{t('settings.reasoningManual')}</p> : null}
  </div>
}

export function reasoningLabel(id: string, t: (key: SettingsKey) => string, fallback = id): string {
  return ['off', 'none', 'minimal', 'low', 'medium', 'high', 'max', 'xhigh'].includes(id)
    ? t(`settings.effort.${id}` as SettingsKey) : fallback
}
