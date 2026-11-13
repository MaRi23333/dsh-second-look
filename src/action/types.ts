/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T02).
 *
 * The unified action model: one normalized description of a pending tool
 * execution that every entry point (native tools, PTC inner dispatch, MCP
 * adapters, in-process subagents) maps into, and that the review service,
 * the change-batch reviewer (T05) and the privacy checks (T06) all consume.
 *
 * Task-doc invariants honoured here:
 * - the frozen original arguments stay LOCAL to the call's lifetime; the
 *   reviewer sees only sanitized text (see src/review.ts sanitizeArguments);
 * - model claims, tool outputs and repository instructions are evidence with
 *   provenance, never user authorization.
 */

/** Review tiers (the two strengths of the gate). */
export type ReviewTier = 'daily' | 'strict'

/** Where the call entered the pipeline. */
export type ActionOrigin =
  | 'native'
  | 'ptc-inner'
  | 'mcp'
  | 'subagent'
  | 'unknown'

/**
 * What a call actually does. Sub-operations of one tool are recognized
 * separately (e.g. the edit tool's replace vs create); an unrecognized tool is
 * `unknown`, which classifies as review-required.
 */
export type ActionEffect =
  | 'read'
  | 'write'
  | 'edit'
  | 'delete'
  | 'execute'
  | 'delegate'
  | 'network'
  | 'meta'
  | 'unknown'

/** One path or object a call acts on. */
export interface ActionTarget {
  /** The raw path argument as written (evidence; not a resolution claim). */
  readonly rawPath: string
  /**
   * Best-effort scope of the RESOLVED path vs the workspace. `'unknown'`
   * means the resolver could not establish the scope — which forces review.
   */
  readonly scope: 'inside' | 'outside' | 'unknown'
  /** Target-state signals the classifier needs (existence/size), when probed. */
  readonly state?: TargetState
}

/** Target state observed by the evidence layer (never via shell). */
export interface TargetState {
  readonly exists: boolean
  readonly kind?: 'file' | 'directory' | 'symlink' | 'other'
  readonly sizeBytes?: number
}

/**
 * Deterministic risk signals. These SEND a call to review (or tighten the
 * evidence request); they never grant anything by themselves and never
 * auto-deny purely on a file name (task-doc rule: sensitive naming raises
 * `sensitive-candidate`, which routes to review, not rejection).
 */
export type RiskSignal =
  | 'destructive-command'
  | 'system-change'
  | 'network-or-install'
  | 'opaque-execution'
  | 'mass-clear'
  | 'important-replacement'
  | 'unverified-overwrite'
  | 'git-control-change'
  | 'sensitive-candidate'
  | 'scope-unknown'
  | 'symlink-target'
  | 'unknown-tool'
  | 'unverified-adapter'
  | 'background-execution'
  | 'scope-change'

/** The normalized pending action. */
export interface UnifiedAction {
  /** Host execution identity: binds the settlement to THIS execution (T04). */
  readonly callId: string
  readonly rootCallId?: string | undefined
  readonly isPtcInner: boolean
  /** session/agent/parent identity for authorization scoping and audit. */
  readonly sessionId: string
  readonly parentSessionId?: string | undefined
  readonly origin: ActionOrigin
  readonly toolName: string
  /**
   * Host-frozen original arguments. LOCAL ONLY: kept for the call's lifetime
   * for evidence building and matching; never sent to any model verbatim.
   */
  readonly arguments: unknown
  readonly cwd?: string | undefined
  /** Which tier's policy applies; set by the session's mode (T03/T04). */
  readonly tier: ReviewTier
  /** Version stamp of the policy/config that classified this action. */
  readonly configVersion: string
  readonly effect: ActionEffect
  /** Recognized sub-operation within the tool (e.g. 'replace', 'create'). */
  readonly subOperation?: string | undefined
  readonly targets: readonly ActionTarget[]
  readonly signals: readonly RiskSignal[]
}

/** Evidence bundle assembled for a review request (T02 evidence layer). */
export interface ActionEvidence {
  readonly action: UnifiedAction
  /** Trusted user-task context with provenance (see src/evidence/context.ts). */
  readonly userContext: TrustedUserContext
  /** Redacted, bounded argument text actually shown to the reviewer. */
  readonly sanitizedArgumentsText?: string | undefined
  /** Truncation/omission disclosures — never silently dropped evidence. */
  readonly disclosures: readonly EvidenceDisclosure[]
}

/** Trusted user context: only real user/parent instructions, labelled. */
export interface TrustedUserContext {
  readonly entries: readonly UserContextEntry[]
  readonly historyOmitted: boolean
  readonly currentTruncated: boolean
}

/** One context line and where it came from. */
export interface UserContextEntry {
  readonly source: 'user' | 'parent-instruction'
  readonly text: string
}

/** What the evidence omits or reduces, so the reviewer is never misled. */
export interface EvidenceDisclosure {
  readonly kind: 'truncated' | 'redacted' | 'omitted' | 'unknown-scope'
  readonly detail: string
}
