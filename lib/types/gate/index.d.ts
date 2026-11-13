/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T04).
 *
 * The gate integration: ONE Auto-style seam pair (`tools/pre-execute` +
 * a monotonic `tools.guard`) plus an approval-answerer router, layered on the
 * host's real settlement chain. The pipeline (verified live in T00):
 *
 *   createExecution → tools/pre-execute → serviceAsk (approval/request)
 *   → guardReason (deny-only) → dispatch
 *
 * Flow for a GATED session (the `second-look` preset):
 *   pre-execute  — recognize (T02) + classify: exempt ⇒ settle+allow;
 *                  review-class ⇒ run the tiered reviewer (T03) HERE, then
 *                  hand the closed decision to the answerer router.
 *   answerer     — allow ⇒ 'allowed-once' (real host settlement);
 *                  deny ⇒ 'rejected' + model-visible boundary text;
 *                  ask_user / failure ⇒ the HUMAN chain settles the same call,
 *                  once, with no re-review.
 *   guard        — passes ONLY a bound, settled, single-use allow
 *                  (token+tool+args+session+config); anything else is a deny
 *                  with named failing dimensions. It never overrides another
 *                  guard's rejection (host guards are monotonic deny-only).
 *
 * Subagent sessions (host approval policy locked `never`, verified T00 run10):
 *   the review runs in pre-execute as above; allow settles directly; anything
 *   needing a human is relayed to the parent session (best effort) and the
 *   call returns NOT EXECUTED with correlation info — never a silent grant.
 *
 * Non-gated sessions keep their NATIVE semantics: the gate stays passive and
 * never claims protection over them.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Session } from '@deepseek-ai/dsh-session';
import { type ResolvedConfig } from '../config.js';
import type { ProbeFileSystem } from '../evidence/probe.js';
import { type TargetFileSystem } from '../evidence/path-inspect.js';
import { type ReviewTier } from '../tier.js';
import { SettlementMap } from './settlement.js';
import { type ParentAgentLike } from './ask-relay.js';
import { type GitRunner } from '../change/collect.js';
import { DisclosureLedger } from '../privacy/disclosure.js';
import { AuditLog, type AuditPersistence } from '../settings/audit.js';
import { type SettingsPersistence } from '../settings/persistence.js';
import { SettingsStore } from '../settings/store.js';
/** The structural execution object crossing `tools/pre-execute` and `guard`. */
export interface ExecLike {
    readonly token: unknown;
    readonly callId?: unknown;
    readonly rootCallId?: unknown;
    readonly name: string;
    readonly arguments: unknown;
    readonly agent?: AgentLike | undefined;
    readonly signal?: AbortSignal | undefined;
    /** Present on PTC inner dispatches (T00 run5/run6). */
    readonly parent?: unknown;
}
/** The structural agent handle on an execution. */
export interface AgentLike {
    readonly id?: unknown;
    readonly session?: Session | undefined;
    readonly parentAgent?: ParentAgentLike | undefined;
}
/** The structural approval request crossing `approval/request`. */
export interface ApprovalReqLike {
    readonly callId?: unknown;
    readonly toolName: string;
    readonly reason?: unknown;
    readonly signal?: AbortSignal | undefined;
    readonly agent?: AgentLike | undefined;
}
/** What a `tools/pre-execute` listener may return. */
export type PreExecuteDecision = {
    readonly kind: 'allow';
} | {
    readonly kind: 'ask';
    readonly reason: string;
};
/** The closed approval outcomes the host settlement chain produces. */
export type ApprovalOutcomeLike = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable';
/** Structural surface of the host `tools` service pieces the gate uses. */
export interface ToolsSeam {
    guard(checker: (exec: ExecLike) => string | undefined): () => void;
    register?(tool: unknown): () => void;
}
/** The event/tool seams the gate wires into (the host context, or a test bus). */
export interface GateSeamsLike {
    on(name: string, handler: (...args: never[]) => unknown, options?: unknown): () => void;
    tools: ToolsSeam;
    get(name: string): unknown;
}
/** Injectable execution-side dependencies (tests supply fakes). */
export interface GateDeps {
    readonly fs?: ProbeFileSystem | undefined;
    readonly targetFs?: TargetFileSystem<string> | undefined;
    readonly seams?: GateSeamsLike | undefined;
    /** Git surface for strict-tier batch collection (default: real `git`). */
    readonly git?: GitRunner | undefined;
    /**
     * Durable settings-page persistence (INSTALL-REVIEW R2). Defaults to the
     * file store under `config.settingsDir` (else `$DSH_HOME/second-look`);
     * tests pass an in-memory store so they never touch the user's settings.
     */
    readonly settingsPersistence?: SettingsPersistence | undefined;
    readonly auditPersistence?: AuditPersistence | undefined;
}
/** Live status for the settings/status surface (T07). */
export interface GateStatus {
    readonly healthy: boolean;
    readonly unhealthyReason?: string;
    readonly pendingEntries: number;
    readonly gateSessionsSeen: number;
    readonly tiers: Readonly<Record<string, ReviewTier>>;
    readonly configVersions: Readonly<Record<ReviewTier, string>>;
    /** The configured default tier. */
    readonly defaultTier: ReviewTier;
    /** Whether the host preset service is available (absent = no mode detection). */
    readonly presetService: string;
    /** The live permission-preset roster (empty when unreadable). */
    readonly presetNames: readonly string[];
    /** The ACTUAL independent reviewer route ('unconfigured' fails closed). */
    readonly reviewer: string;
    /** Batches not covered by a still-valid review (names). */
    readonly batchPending: readonly string[];
    /** Named coverage gaps (binary/over-budget/manual runs). */
    readonly batchGaps: readonly string[];
    readonly disclosures: number;
    readonly outboundEvents: readonly string[];
    readonly auditDegraded: boolean;
    readonly auditDegradedReason?: string;
}
/** The mounted gate handle. */
export interface GateHandle {
    dispose(): void;
    /** Switch one session's tier; invalidates that session's pending allows. */
    setTier(sessionId: string, tier: ReviewTier): void;
    getTier(sessionId: string): ReviewTier;
    status(): GateStatus;
    /** The settlement ledger (tests/status). */
    readonly settlement: SettlementMap;
    /** The disclosure ledger (tests/status/audit). */
    readonly disclosures: DisclosureLedger;
    /** The decision audit log (T07). */
    readonly audit: AuditLog;
    /** The runtime settings store (T07). */
    readonly settings: SettingsStore;
}
export declare function callKeyOf(exec: {
    readonly callId?: unknown;
    readonly token: unknown;
}): string;
/** Stable config-revision stamp: tier + reviewer route + policy surface (红队 §4c: a real sha256 digest, not a 32-bit hash). */
export declare function configVersionOf(config: ResolvedConfig, tier: ReviewTier): string;
/**
 * Mount the gate. Wires pre-execute, the approval answerer router, the
 * monotonic guard and the deny-feedback rewrite; returns the handle.
 * @param ctx - the plugin context.
 * @param config - resolved plugin config.
 * @param deps - injectable filesystem/clock (defaults to real node fs).
 * @returns the mounted gate handle (dispose tears everything down).
 */
export declare function mountGate(ctx: Context, baseConfig: ResolvedConfig, deps?: GateDeps): GateHandle;
//# sourceMappingURL=index.d.ts.map