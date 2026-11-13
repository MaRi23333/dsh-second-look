import type { Context } from '@deepseek-ai/cordis';
import { type ReactNode } from 'react';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        'settings.section.icon': {
            kind: 'list';
            scope: 'root';
            owner: {
                size: number;
                active: boolean;
            };
        };
    }
}
/** Shield and checkmark in the settings row's current theme color. */
export declare function SettingsNavIcon({ size }: {
    size?: number;
    active?: boolean;
}): ReactNode;
export declare function registerSettingsNavIcon(ctx: Pick<Context, 'slots'>): void;
//# sourceMappingURL=nav-icon.d.ts.map