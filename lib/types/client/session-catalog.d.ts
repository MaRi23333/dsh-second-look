/** Adapted from DeepSeek Harness ui-permission-presets/src/client/catalog.ts
 * (MIT, Copyright (c) 2026 DeepSeek).
 * A local snapshot store avoids a runtime client-store dependency.
 */
import type { PermissionCatalog } from '@deepseek-ai/dsh-permission-presets/client';
export interface SnapshotSource<T> {
    getSnapshot: () => T;
    subscribe: (listener: () => void) => () => void;
}
export declare function snapshotStore<T>(initial: T): SnapshotSource<T> & {
    set: (value: T) => void;
};
export interface CatalogState {
    value: PermissionCatalog | null;
    connected: boolean;
    error: boolean;
    revision: number;
}
/** Only the public Remote + Connection contracts used by the native catalog. */
export interface CatalogHost {
    connection: {
        generation: SnapshotSource<{
            id: number;
        } | undefined>;
    };
    remote: {
        $on: (name: 'permission-presets/catalog-changed', listener: () => void) => () => void;
        permissionPresets: {
            catalog: () => Promise<{
                ok: true;
                value: PermissionCatalog;
            } | {
                ok: false;
                error: {
                    code: string;
                    message: string;
                };
            }>;
        };
    };
}
export declare class SessionCatalog {
    private readonly host;
    readonly store: SnapshotSource<CatalogState> & {
        set: (value: CatalogState) => void;
    };
    private readonly stopCatalog;
    private readonly stopGeneration;
    private generationId;
    private epoch;
    private disposed;
    constructor(host: CatalogHost);
    private syncGeneration;
    private publish;
    /** Withdraw stale rows immediately; only the newest same-generation read may settle. */
    refresh: () => void;
    private accepts;
    dispose(): void;
}
//# sourceMappingURL=session-catalog.d.ts.map