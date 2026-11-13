import type { ReviewerCatalogResult } from './reviewer-catalog.js';
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { SettingsKey } from './settings-locales.js';
import type { GateConfigView, GatePatch, GateStatusView, AuditResponse } from './settings-api.js';
export interface GateSettingsInjected {
    modelCatalog?: () => Promise<ReviewerCatalogResult>;
    t: (key: SettingsKey) => string;
    config: () => Promise<GateConfigView>;
    saveConfig: (patch: GatePatch) => Promise<GateConfigView>;
    status: () => Promise<GateStatusView>;
    audit: () => Promise<AuditResponse>;
    clearAudit: (scope?: 'recent' | 'blocked') => Promise<{
        ok: boolean;
        error?: string;
    }>;
}
export type GateSettingsProps = PropsRuntime<'settings.section'> & InjectFace<GateSettingsInjected>;
export declare function GateSettings(props: GateSettingsProps): React.ReactElement;
//# sourceMappingURL=SettingsCard.d.ts.map