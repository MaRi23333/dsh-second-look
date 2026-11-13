/**
 * Modified for dsh-second-look, 2026-10-31 (T02).
 *
 * Deterministic shell-command risk signals, ported from the local fork
 * `dsh-heavy-approval/src/review-policy.ts` (workspace-local source, reused
 * with attribution; see THIRD-PARTY-SOURCES.md).
 *
 * A hit raises a {@link RiskSignal} that routes the command to review; a miss
 * grants nothing (a novel dangerous command still reaches the reviewer via
 * the `execute` effect).
 */
import type { RiskSignal } from '../action/types.js';
export declare const DESTRUCTIVE_SHELL: RegExp;
export declare const FIND_DELETE_SHELL: RegExp;
export declare const SYSTEM_SHELL: RegExp;
export declare const HOST_CONTAINER_SHELL: RegExp;
export declare const INSTALL_SHELL: RegExp;
export declare const NETWORK_TRANSFER_SHELL: RegExp;
export declare const REMOTE_WRITE_SHELL: RegExp;
export declare const OPAQUE_SHELL: RegExp;
export declare const WINDOWS_DESTRUCTIVE_SHELL: RegExp;
export declare const WINDOWS_SYSTEM_SHELL: RegExp;
export declare const WINDOWS_INSTALL_SHELL: RegExp;
export declare const WINDOWS_NETWORK_SHELL: RegExp;
export declare const WINDOWS_OPAQUE_SHELL: RegExp;
/**
 * Map a shell command onto deterministic risk signals.
 * @param command - the command text as submitted.
 * @returns the signals the patterns raise (possibly empty — never a grant).
 */
export declare function shellRiskSignals(command: string): RiskSignal[];
//# sourceMappingURL=shell-signals.d.ts.map