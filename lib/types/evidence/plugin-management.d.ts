/** Describe the bundled management contract without trusting a dispatch by name. */
interface InstalledBundle {
    readonly name?: string;
    readonly installed?: boolean;
    readonly version?: string;
    readonly source?: string;
}
interface PluginManagerReader {
    listBundles(): Promise<readonly InstalledBundle[]>;
}
export declare function pluginManagementEvidence(tool: string, args: unknown, manager: PluginManagerReader | undefined): Promise<readonly string[]>;
export {};
//# sourceMappingURL=plugin-management.d.ts.map