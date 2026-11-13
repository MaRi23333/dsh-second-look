import { uxEn, uxZh, type UxKey } from './settings-ux-locales.ts'
const supplementalZh = {
  'settings.errorStorage': '设置未能写入磁盘，请检查数据目录权限或可用空间后重试。',
  'settings.errorCredential': '这里只能填写服务商和模型名称，请勿填写密钥。',
  'settings.errorInput': '设置内容无效，请检查填写内容后重试。',
  'settings.errorNetwork': '暂时无法保存设置，请检查客户端连接后重试。',

  "settings.reasoning.placeholder": "如 high、low",
  "settings.reasoning.desc": "使用模型支持的思考等级；留空采用默认。",
  "settings.inheritReasoning": "留空复用基础思考强度",
  "settings.budget.desc": "限制补证范围与等待时间，不是模型的思考 token 上限。",
  "settings.invalidNumber": "请输入有效的正整数",
  "settings.resetHint": "清空此项，回落到配置默认值",
  "settings.invalidValues": "请修正无效数值",
  "settings.unsaved": "有未保存更改",
  "settings.loadFailed": "设置加载失败",
  "settings.loading": "正在加载设置…",
  "settings.retry": "重试",
  "settings.health": "插件状态",
  "settings.healthy": "运行正常",
  "settings.unhealthy": "需要处理",
  "settings.reviewPresets": "权限档位",
  "settings.route.desc": "独立审核使用的模型与思考强度。",
  "settings.reasoning": "审核思考强度",
  "settings.strictTier.desc": "留空时复用基础审核路由。",
  "settings.inheritProvider": "留空复用基础服务商",
  "settings.inheritModel": "留空复用基础模型",
  "settings.strictReasoning": "加强档思考强度",
  "settings.budget": "补证范围与超时"
} as const
const supplementalEn = {
  'settings.errorStorage': 'Settings could not be written to disk. Check directory permissions or available space and retry.',
  'settings.errorCredential': 'Enter provider and model names only, never API keys.',
  'settings.errorInput': 'Invalid settings. Check the entered values and retry.',
  'settings.errorNetwork': 'Settings could not be saved. Check the client connection and retry.',

  "settings.reasoning.placeholder": "e.g. high, low",
  "settings.reasoning.desc": "Use a reasoning level supported by the model; leave empty for its default.",
  "settings.inheritReasoning": "Use base reasoning effort when empty",
  "settings.budget.desc": "Limits evidence scope and waiting time, not reasoning tokens.",
  "settings.invalidNumber": "Enter a valid positive integer",
  "settings.resetHint": "Clear to use the configured default",
  "settings.invalidValues": "Fix invalid values",
  "settings.unsaved": "Unsaved changes",
  "settings.loadFailed": "Failed to load settings",
  "settings.loading": "Loading settings…",
  "settings.retry": "Retry",
  "settings.health": "Plugin status",
  "settings.healthy": "Healthy",
  "settings.unhealthy": "Needs attention",
  "settings.reviewPresets": "Permission presets",
  "settings.route.desc": "Independent reviewer model and reasoning effort.",
  "settings.reasoning": "Review reasoning effort",
  "settings.strictTier.desc": "Leave empty to reuse the base reviewer route.",
  "settings.inheritProvider": "Use base provider when empty",
  "settings.inheritModel": "Use base model when empty",
  "settings.strictReasoning": "Enhanced reasoning effort",
  "settings.budget": "Evidence scope and timeouts"
}
import { auditZh, auditEn, type AuditKey } from './audit-locales.ts'
/**
 * Modified for dsh-second-look, 2026-10-31 (部署后补: 客户端内置设置面板).
 *
 * Client locale dictionaries for the settings section (zh/en), following the
 * local fork `dsh-heavy-approval/src/client/settings-locales.ts` pattern
 * (workspace-local source, reused with attribution; see THIRD-PARTY-SOURCES.md).
 * Row copy mirrors the native General settings rows (title + one-line
 * description left, control right).
 */

export type SettingsKey = UxKey | AuditKey | keyof typeof supplementalZh
  | 'settings.label'
  | 'settings.title'
  | 'settings.blurb'
  | 'settings.route'
  | 'settings.provider'
  | 'settings.provider.desc'
  | 'settings.model'
  | 'settings.model.desc'
  | 'settings.effort'
  | 'settings.effort.desc'
  | 'settings.effort.placeholder'
  | 'settings.strict'
  | 'settings.strictProvider'
  | 'settings.strictProvider.desc'
  | 'settings.strictModel'
  | 'settings.strictModel.desc'
  | 'settings.strictEffort'
  | 'settings.strictEffort.desc'
  | 'settings.strict.desc'
  | 'settings.daily'
  | 'settings.strictTier'
  | 'settings.evidenceRounds'
  | 'settings.evidenceRounds.desc'
  | 'settings.totalTimeoutMs'
  | 'settings.totalTimeoutMs.desc'
  | 'settings.maxEvidenceItems'
  | 'settings.maxEvidenceItems.desc'
  | 'settings.unit.rounds'
  | 'settings.unit.ms'
  | 'settings.unit.items'
  | 'settings.overridden'
  | 'settings.reset'
  | 'settings.invalid'
  | 'settings.save'
  | 'settings.saving'
  | 'settings.saved'
  | 'settings.saveFailed'
  | 'settings.persistence'
  | 'settings.status'
  | 'settings.status.ok'
  | 'settings.status.broken'
  | 'settings.status.reviewer'
  | 'settings.status.presets'

export const zh: Record<SettingsKey, string> = {
  ...auditZh,
  ...supplementalZh,
  ...uxZh,
  'settings.label': '过目',
  'settings.title': '过目',
  'settings.blurb': '在当前会话的权限菜单选择日常审查或加强审查。这里只配置审核路由与预算；凭据由宿主管理。',
  'settings.route': '审核路由',
  'settings.provider': '审核服务商',
  'settings.provider.desc': '独立审核使用的 LLM 服务商名（必填）。',
  'settings.model': '审核模型',
  'settings.model.desc': '独立审核使用的模型名（必填）。',
  'settings.effort': '审核思考强度',
  'settings.effort.desc': '由模型支持的思考等级控制；插件不另设思考 token 上限。留空用默认。',
  'settings.effort.placeholder': '如 high、low',
  'settings.strict': '加强档覆盖',
  'settings.strictProvider': '加强档服务商',
  'settings.strictProvider.desc': '留空则用上面的服务商。',
  'settings.strictModel': '加强档模型',
  'settings.strictModel.desc': '留空则用上面的模型。',
  'settings.strictEffort': '加强档思考强度',
  'settings.strictEffort.desc': '留空则用上面的强度。',
  'settings.strict.desc': '留空＝加强档复用上面的基础审核路由。',
  'settings.daily': '日常档补证与超时',
  'settings.strictTier': '加强档补证与超时',
  'settings.evidenceRounds': '补证轮数',
  'settings.evidenceRounds.desc': '一次审核允许的补证轮数；0 表示关闭补证。',
  'settings.totalTimeoutMs': '总超时',
  'settings.totalTimeoutMs.desc': '一次审核（含补证）的总时限。',
  'settings.maxEvidenceItems': '单轮补证条目上限',
  'settings.maxEvidenceItems.desc': '一轮补证请求最多带回的探查条目数。',
  'settings.unit.rounds': '轮',
  'settings.unit.ms': '毫秒',
  'settings.unit.items': '条',
  'settings.overridden': '已覆盖',
  'settings.reset': '重置',
  'settings.invalid': '请填数字；留空表示清除该覆盖。',
  'settings.save': '保存',
  'settings.saving': '保存中…',
  'settings.saved': '已保存',
  'settings.saveFailed': '保存失败',
  'settings.persistence': '持久化位置',
  'settings.status': '状态',
  'settings.status.ok': '正常',
  'settings.status.broken': '失效（fail-closed）',
  'settings.status.reviewer': '实际 reviewer',
  'settings.status.presets': '权限预设名册',
}

export const en: Record<SettingsKey, string> = {
  ...auditEn,
  ...supplementalEn,
  ...uxEn,
  'settings.label': 'Second Look',
  'settings.title': 'Second Look',
  'settings.blurb': 'Choose Routine review or Enhanced review from the current session’s permission menu. Configure reviewer routes and budgets here; credentials stay in the host.',
  'settings.route': 'Reviewer route',
  'settings.provider': 'Reviewer provider',
  'settings.provider.desc': 'LLM provider name for independent reviews (required).',
  'settings.model': 'Reviewer model',
  'settings.model.desc': 'Model name for independent reviews (required).',
  'settings.effort': 'Reviewer reasoning effort',
  'settings.effort.desc': 'Use a supported reasoning level. No additional thinking-token cap is set by this plugin. Empty keeps the default.',
  'settings.effort.placeholder': 'e.g. high, low',
  'settings.strict': 'Strict-tier override',
  'settings.strictProvider': 'Strict provider',
  'settings.strictProvider.desc': 'Empty reuses the provider above.',
  'settings.strictModel': 'Strict model',
  'settings.strictModel.desc': 'Empty reuses the model above.',
  'settings.strictEffort': 'Strict reasoning effort',
  'settings.strictEffort.desc': 'Empty reuses the effort above.',
  'settings.strict.desc': 'Leave empty to reuse the base reviewer route for the strict tier.',
  'settings.daily': 'Daily evidence and timeout',
  'settings.strictTier': 'Strict evidence and timeout',
  'settings.evidenceRounds': 'Evidence rounds',
  'settings.evidenceRounds.desc': 'Evidence rounds one review may spend; 0 disables them.',
  'settings.totalTimeoutMs': 'Total timeout',
  'settings.totalTimeoutMs.desc': 'Total deadline for one review, evidence rounds included.',
  'settings.maxEvidenceItems': 'Max evidence items per round',
  'settings.maxEvidenceItems.desc': 'Probe items one evidence round may bring back.',
  'settings.unit.rounds': 'rounds',
  'settings.unit.ms': 'ms',
  'settings.unit.items': 'items',
  'settings.overridden': 'Overridden',
  'settings.reset': 'Reset',
  'settings.invalid': 'Enter a number; leave empty to clear this override.',
  'settings.save': 'Save',
  'settings.saving': 'Saving…',
  'settings.saved': 'Saved',
  'settings.saveFailed': 'Save failed',
  'settings.persistence': 'Persisted at',
  'settings.status': 'Status',
  'settings.status.ok': 'healthy',
  'settings.status.broken': 'broken (fail-closed)',
  'settings.status.reviewer': 'Effective reviewer',
  'settings.status.presets': 'Permission presets',
}
