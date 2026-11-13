import { type UxKey } from './settings-ux-locales.js';
declare const supplementalZh: {
    readonly 'settings.errorStorage': '设置未能写入磁盘，请检查数据目录权限或可用空间后重试。';
    readonly 'settings.errorCredential': '这里只能填写服务商和模型名称，请勿填写密钥。';
    readonly 'settings.errorInput': '设置内容无效，请检查填写内容后重试。';
    readonly 'settings.errorNetwork': '暂时无法保存设置，请检查客户端连接后重试。';
    readonly "settings.reasoning.placeholder": "如 high、low";
    readonly "settings.reasoning.desc": "使用模型支持的思考等级；留空采用默认。";
    readonly "settings.inheritReasoning": "留空复用基础思考强度";
    readonly "settings.budget.desc": "限制补证范围与等待时间，不是模型的思考 token 上限。";
    readonly "settings.invalidNumber": "请输入有效的正整数";
    readonly "settings.resetHint": "清空此项，回落到配置默认值";
    readonly "settings.invalidValues": "请修正无效数值";
    readonly "settings.unsaved": "有未保存更改";
    readonly "settings.loadFailed": "设置加载失败";
    readonly "settings.loading": "正在加载设置…";
    readonly "settings.retry": "重试";
    readonly "settings.health": "插件状态";
    readonly "settings.healthy": "运行正常";
    readonly "settings.unhealthy": "需要处理";
    readonly "settings.reviewPresets": "权限档位";
    readonly "settings.route.desc": "独立审核使用的模型与思考强度。";
    readonly "settings.reasoning": "审核思考强度";
    readonly "settings.strictTier.desc": "留空时复用基础审核路由。";
    readonly "settings.inheritProvider": "留空复用基础服务商";
    readonly "settings.inheritModel": "留空复用基础模型";
    readonly "settings.strictReasoning": "加强档思考强度";
    readonly "settings.budget": "补证范围与超时";
};
import { type AuditKey } from './audit-locales.js';
/**
 * Modified for dsh-second-look, 2026-10-31 (部署后补: 客户端内置设置面板).
 *
 * Client locale dictionaries for the settings section (zh/en), following the
 * local fork `dsh-heavy-approval/src/client/settings-locales.ts` pattern
 * (workspace-local source, reused with attribution; see THIRD-PARTY-SOURCES.md).
 * Row copy mirrors the native General settings rows (title + one-line
 * description left, control right).
 */
export type SettingsKey = UxKey | AuditKey | keyof typeof supplementalZh | 'settings.label' | 'settings.title' | 'settings.blurb' | 'settings.route' | 'settings.provider' | 'settings.provider.desc' | 'settings.model' | 'settings.model.desc' | 'settings.effort' | 'settings.effort.desc' | 'settings.effort.placeholder' | 'settings.strict' | 'settings.strictProvider' | 'settings.strictProvider.desc' | 'settings.strictModel' | 'settings.strictModel.desc' | 'settings.strictEffort' | 'settings.strictEffort.desc' | 'settings.strict.desc' | 'settings.daily' | 'settings.strictTier' | 'settings.evidenceRounds' | 'settings.evidenceRounds.desc' | 'settings.totalTimeoutMs' | 'settings.totalTimeoutMs.desc' | 'settings.maxEvidenceItems' | 'settings.maxEvidenceItems.desc' | 'settings.unit.rounds' | 'settings.unit.ms' | 'settings.unit.items' | 'settings.overridden' | 'settings.reset' | 'settings.invalid' | 'settings.save' | 'settings.saving' | 'settings.saved' | 'settings.saveFailed' | 'settings.persistence' | 'settings.status' | 'settings.status.ok' | 'settings.status.broken' | 'settings.status.reviewer' | 'settings.status.presets';
export declare const zh: Record<SettingsKey, string>;
export declare const en: Record<SettingsKey, string>;
export {};
//# sourceMappingURL=settings-locales.d.ts.map