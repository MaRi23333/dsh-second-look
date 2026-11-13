import type { SnapshotSource } from './session-catalog.js';
/** Publish the resolved UI language at startup, switches and host reconnects.
 * Serialize requests so an older language cannot arrive after a newer one. */
export declare function syncHostLanguage(read: () => string, subscribeLocale: (changed: () => void) => () => void, generation: SnapshotSource<{
    id: number;
} | undefined>, send: (language: string, signal: AbortSignal) => Promise<boolean>): () => void;
//# sourceMappingURL=locale-sync.d.ts.map