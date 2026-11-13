import type { PropsRuntime, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { CatalogState, SnapshotSource } from './session-catalog.js';
export interface SessionPickerInjected {
    sessionKey: string;
    catalogStore: SnapshotSource<CatalogState>;
    retryCatalog: () => void;
    select: (preset: string) => Promise<boolean>;
}
export type SessionPickerProps = PropsRuntime<'conversation.input.permission'> & SessionPickerInjected & PropsLocale<'second-look.permission'>;
/** Original glyphs use the host permission family's 16px currentColor outline. */
export declare function ReviewIcon({ enhanced }: {
    enhanced?: boolean;
}): React.ReactElement;
export declare function SessionPicker({ locked, sessionKey, catalogStore, retryCatalog, select, useProjection, t, }: SessionPickerProps): React.ReactElement | null;
//# sourceMappingURL=SessionPicker.d.ts.map