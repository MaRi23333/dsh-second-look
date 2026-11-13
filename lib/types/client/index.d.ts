import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { type PermissionAccessKey } from './session-locales.js';
import { type SettingsKey } from './settings-locales.js';
export { GateSettings } from './SettingsCard.js';
export type { GateSettingsInjected, GateSettingsProps } from './SettingsCard.js';
export type { SettingsKey } from './settings-locales.js';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Second Look settings section. */
        'second-look': SettingsKey;
        'second-look.permission': PermissionAccessKey;
    }
}
/** Browser services required by the settings section. */
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map