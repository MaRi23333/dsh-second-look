import type { ProbeFileSystem } from './probe.js';
/**
 * Build the node-backed probe filesystem.
 * @param baseCwd - fallback cwd when a probe call passes none.
 * @returns the structural filesystem surface for `runProbe`.
 */
export declare function createNodeProbeFs(baseCwd?: string): ProbeFileSystem;
//# sourceMappingURL=node-fs.d.ts.map