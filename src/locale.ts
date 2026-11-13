import type { UiLanguage } from './messages.ts'

/** Product copy only. Protocol ids, paths and model/provider names stay unchanged. */
export function text(language: UiLanguage, zh: string, en: string): string { return language === 'zh' ? zh : en }
export function brand(language: UiLanguage): string { return text(language, '过目', 'Second Look') }
export function languageOf(value: unknown): UiLanguage | undefined {
  if (typeof value !== 'string') return undefined
  if (/^zh(?:-|$)/i.test(value)) return 'zh'
  if (/^en(?:-|$)/i.test(value)) return 'en'
  return undefined
}

/** The client publishes its effective locale (including browser auto-detection).
 * Before it connects, use the host's explicit preference, then plugin fallback.
 * This never writes a preference or affects permission/settlement state. */
export class HostLanguage {
  private active: UiLanguage | undefined
  constructor(private readonly hostPreference: () => unknown, private readonly fallback: UiLanguage) {}
  set(value: unknown): boolean {
    const language = languageOf(value)
    if (!language) return false
    this.active = language
    return true
  }
  get(): UiLanguage {
    if (this.active) return this.active
    try { return languageOf(this.hostPreference()) ?? this.fallback } catch { return this.fallback }
  }
}

/** Stable failure categories get translated; external diagnostic text is retained
 * as a separate detail so provider-specific causes are not hidden or invented. */
export function failureText(language: UiLanguage, kind: string): string {
  const zh: Record<string, string> = {
    timeout: '审核超时', cancelled: '审核已取消', unavailable: '审核服务不可用',
    schema: '审核模型返回格式无效', budget: '补证次数已用完',
  }
  return language === 'zh' ? zh[kind] ?? '审核未完成' : `Review could not decide (${kind})`
}
