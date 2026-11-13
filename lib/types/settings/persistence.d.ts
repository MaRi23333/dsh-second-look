/** The persisted override document (flat settings-page keys, names only). */
export type SavedOverrides = Record<string, unknown>;
/**
 * The durable settings surface. `save` must be durable-or-throw: the store
 * reports success to the page only after it resolves without throwing.
 */
export interface SettingsPersistence {
    /** The saved override values (empty object when none); corrupt files degrade to no overrides. */
    load(): SavedOverrides;
    /** Durably replace the saved override values. Throws when the write fails. */
    save(values: SavedOverrides): void;
    /** Human-readable sink description for the status surface (no secrets). */
    describe(): string;
}
/** Default settings directory: `$DSH_HOME/second-look`, else `~/.dsh/second-look` (fork pattern). */
export declare function defaultSettingsDir(): string;
/**
 * File-backed persistence: `settings.json` in the given directory, written
 * via temp-file + atomic rename (the fork's pattern).
 */
export declare class FileSettingsPersistence implements SettingsPersistence {
    readonly dir: string;
    /** Result of the most recent {@link load} (status surface honesty). */
    private lastLoad;
    constructor(dir: string);
    load(): SavedOverrides;
    save(values: SavedOverrides): void;
    describe(): string;
}
/**
 * In-memory persistence for tests and hosts without a writable state dir.
 * Durable only for the process lifetime — `describe()` says so.
 */
export declare class MemorySettingsPersistence implements SettingsPersistence {
    private saved;
    private readonly label;
    constructor(label?: string);
    load(): SavedOverrides;
    save(values: SavedOverrides): void;
    describe(): string;
}
//# sourceMappingURL=persistence.d.ts.map