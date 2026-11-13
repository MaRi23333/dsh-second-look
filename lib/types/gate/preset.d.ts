/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T04).
 *
 * The gate's own permission preset — the product's dedicated fourth mode in
 * the input-bar permission dropdown, delivered as a CUSTOM named preset in the
 * permission row's `presets` dict (the three native presets keep their exact
 * meaning). The preset bundle is Full access sandbox + ask: the plugin's
 * pre-execute/guard seam does the gating. This module is the single source of
 * truth for the preset key/bundle and for "is this session running under the
 * gate" detection — the status surface must never claim protection for
 * sessions that are not.
 */
import type { ParentAgentLike } from './ask-relay.js';
import type { ReviewTier } from '../tier.js';
export declare const GATE_DAILY_PRESET = "second-look-daily";
export declare const GATE_STRICT_PRESET = "second-look-strict";
export declare const GATE_PRESET_KEYS: readonly string[];
export declare function presetForTier(tier: ReviewTier): string;
export declare function tierFromPreset(preset: unknown): ReviewTier | undefined;
/**
 * The preset bundle (mirrors the host `AUTO_PRESET_SPEC` shape without using
 * the reserved `auto` slot, whose label is owned by the official experiment):
 * Full access sandbox with `ask` — every call reaches the approval seam where
 * this plugin's gate decides.
 */
export declare const GATE_PRESET_BUNDLE: {
    readonly sandbox: 'danger-full-access';
    readonly approval: 'ask';
};
/** The permission-row config fragment that declares the preset. */
export declare const GATE_PERMISSION_ROW_PRESETS: {
    readonly "second-look-daily": {
        readonly sandbox: 'danger-full-access';
        readonly approval: 'ask';
        readonly name: 'Routine review';
        readonly description: 'Review risky actions with fewer interruptions.';
    };
    readonly "second-look-strict": {
        readonly sandbox: 'danger-full-access';
        readonly approval: 'ask';
        readonly name: 'Enhanced review';
        readonly description: 'Additional checks for changes and sensitive information.';
    };
};
/** The structural shape of the host `permissionPresets` service (feature-detected). */
export interface PermissionPresetsLike {
    readonly names?: readonly string[];
    current?(session: unknown): unknown;
    set?(session: unknown, preset: string): void;
}
/**
 * Whether a session runs under the gate preset. Sessions on any other preset
 * keep their NATIVE semantics — the gate stays passive there and must never
 * claim protection over them (nor silently weaken their own ask rules).
 * @param presets - the host service, when present.
 * @param session - the session to test.
 * @returns true only when the current preset is the gate preset.
 */
export declare function isGateSession(presets: PermissionPresetsLike | undefined, session: unknown): boolean;
/** The structural session fields the gate scope check reads. */
export interface GateScopeSession {
    readonly header?: {
        readonly origin?: unknown;
        readonly parentSession?: unknown;
    } | undefined;
}
/**
 * Whether the gate applies to one execution's session (T04, closed by the
 * run26b live finding; lineage walk per 终审 Major 4): the session's own gate
 * preset, OR a subagent whose LINEAGE is gated.
 *
 * Subagent descendants are ALWAYS in scope when their lineage is gated (or
 * cannot be established): the host does NOT inherit custom presets down the
 * delegation chain and locks child approval to `never`, so an ungated
 * grandchild would execute everything with zero review. A child whose ROOT is
 * demonstrably NOT gated keeps the root's native semantics.
 * @param presets - the host permissionPresets service, when present.
 * @param session - the execution's session.
 * @param parentHandle - the parent agent handle (lineage walk start).
 * @returns true when the gate must run for this session.
 */
export declare function shouldGate(presets: PermissionPresetsLike | undefined, session: GateScopeSession | undefined, parentHandle: ParentAgentLike | undefined): boolean;
//# sourceMappingURL=preset.d.ts.map