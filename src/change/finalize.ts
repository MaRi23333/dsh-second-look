import { localizeGap } from './gap-locale.ts'
import { brand, text } from '../locale.ts'
import type { UiLanguage } from '../messages.ts'
/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T05).
 *
 * The restricted `second_look_finalize` tool: before delivery, re-collect the
 * remaining changes and report four honest buckets — reviewed, pending,
 * explicitly user-allowed, and coverage gaps — plus the named paths the
 * batch cannot compare (binary/over-budget/manual runs). The host has NO
 * end-of-turn hook (T00 §7), so the tool description instructs the agent to
 * call this before delivering; "the final reply was sent" is never treated as
 * review success. Any later modification invalidates a previous finalize:
 * the report is a snapshot of THIS call, and re-running recomputes it.
 */
import type { ProbeFileSystem } from '../evidence/probe.ts'
import { collectFullBatch, type BatchSnapshot, type GitRunner } from './collect.ts'
import { BatchLedger, type BatchReviewRecord } from './batch.ts'
import type { ReviewTier } from '../tier.ts'

/** The four-bucket finalize report. */
export interface FinalizeReport {
  /** Files covered by a still-valid batch review right now. */
  readonly reviewed: readonly string[]
  /** Changed files with NO valid review (must be reviewed or explicitly allowed). */
  readonly pending: readonly string[]
  /** Actions the USER explicitly allowed (per-action; never a batch pardon). */
  readonly userAllowed: readonly string[]
  /** Coverage gaps: binary/over-budget files, manual runs, non-git blind spots. */
  readonly gaps: readonly string[]
  /** True only when `pending` is empty (gaps are always reported regardless). */
  readonly completed: boolean
  readonly collectedAt: number
}

/** What the finalize collection needs. */
export interface FinalizeInputs {
  readonly language?: () => UiLanguage
  readonly enabled?: boolean | undefined
  readonly fs: ProbeFileSystem
  /** Observed change targets (write/edit seen at pre-execute). */
  readonly observedPaths: ReadonlySet<string>
  readonly ledger: BatchLedger
  readonly tier: ReviewTier
  readonly configVersion: string
  readonly cwd: string | undefined
  /** Human-allowed action labels (tool + call id), newest first. */
  readonly userAllowedActions: readonly string[]
  readonly signal?: AbortSignal | undefined
  /** Git surface for git projects (missing → observed-changes fallback). */
  readonly git?: GitRunner | undefined
  /** Per-execution scope override (session tier / cwd / current allow list). */
  readonly resolve?: ((exec: { agent?: { session?: unknown } }) => Partial<FinalizeInputs>) | undefined
}

/**
 * Collect the finalize report: re-hash observed changes NOW, check every
 * stored batch by content, and sort each file into reviewed/pending.
 * @param inputs - the collection inputs.
 * @returns the four-bucket report.
 */
export async function collectFinalizeReport(inputs: FinalizeInputs): Promise<FinalizeReport> {
  const snapshot: BatchSnapshot = await collectFullBatch(
    inputs.fs,
    inputs.git,
    inputs.cwd ?? '.',
    inputs.observedPaths,
    inputs.signal,
  )
  const reviewed: string[] = []
  const pending: string[] = []
  const gaps = [...snapshot.gaps]
  for (const file of snapshot.files) {
    // Per-file content-verified reuse: an unchanged file keeps its review
    // evidence even when other files changed. A file whose content is not
    // verifiable NOW (binary/over-budget replacement) is ALWAYS pending —
    // it can never claim historical coverage (T05 review F02).
    const reviewedHash = inputs.ledger.latestHash(file.path, inputs.tier, inputs.configVersion)
    const covered = reviewedHash !== undefined
      && file.contentHash !== undefined
      && reviewedHash === file.contentHash
    if (covered) reviewed.push(file.path)
    else pending.push(file.path)
    if (file.binary === true) gaps.push(`${file.path}: binary/undecodable — not comparable`)
    if (file.deleted === true) gaps.push(`${file.path}: deleted — not comparable`)
    if (file.overBudget === true) gaps.push(`${file.path}: over budget — not compared`)
  }
  if (snapshot.files.length > 0 && reviewed.length < snapshot.files.length) {
    gaps.push('some current changes have no still-valid batch review')
  }
  return {
    reviewed,
    pending,
    userAllowed: inputs.userAllowedActions,
    gaps,
    completed: pending.length === 0 && gaps.length === 0,
    collectedAt: snapshot.collectedAt,
  }
}

/**
 * Render the report for the model/user (the tool result text).
 * @param report - the report.
 * @returns the text.
 */
export function renderFinalizeReport(report: FinalizeReport, language: UiLanguage = 'en'): string {
  const t = (zh: string, en: string): string => text(language, zh, en)
  const lines: string[] = [
    `[${brand(language)}] ${t('交付检查', 'finalize')} — ${report.completed ? t('已观察到的变更均有有效审核覆盖', 'all observed changes are covered by a valid review') : t('覆盖不完整：仍有待审变更或检查缺口', 'NOT fully covered: pending changes or coverage gaps remain')}`,
    `${t('已审核', 'reviewed')} (${report.reviewed.length}): ${report.reviewed.length === 0 ? t('无', '(none)') : report.reviewed.join(', ')}`,
    `${t('待审核', 'pending')} (${report.pending.length}): ${report.pending.length === 0 ? t('无', '(none)') : report.pending.join(', ')}`,
    `${t('用户明确允许的操作', 'explicitly user-allowed actions')} (${report.userAllowed.length}): ${report.userAllowed.length === 0 ? t('无', '(none)') : report.userAllowed.join('; ')}`,
  ]
  if (report.gaps.length > 0) {
    lines.push(t('覆盖缺口（尚未审核，不应宣称已检查）：', 'coverage gaps (not reviewed — do not claim these were checked):'))
    for (const gap of report.gaps) lines.push(`- ${localizeGap(gap, language)}`)
  }
  lines.push(t('后续修改会使本报告失效，交付前请重新调用 second_look_finalize。', 'A later modification invalidates this report — call second_look_finalize again before delivering.'))
  lines.push(t('手工执行和审核范围外的行为未被覆盖，请在交付时明确说明。', 'Manual runs and anything outside the gate are never covered; say so explicitly in the delivery.'))
  return lines.join('\n')
}

/** The `second_look_finalize` tool definition payload for `ctx.tools.register`. */
export interface FinalizeToolDeps extends FinalizeInputs {
  /** Called after a successful collection (status/audit hook). */
  readonly onCollected?: (report: FinalizeReport) => void
}

/**
 * Build the restricted finalize tool definition (no side effects beyond
 * reading; its result is the report).
 * @param deps - collection inputs and optional hook.
 * @returns the tool definition for `ctx.tools.register`.
 */
export function buildFinalizeTool(deps: FinalizeToolDeps): {
  name: string
  description: string
  parameters: Record<string, unknown>
  output: { schema: Record<string, unknown>; render: (args: unknown, value: unknown) => { type: 'text'; text: string }[] }
  execute: (args: unknown, exec: { signal?: AbortSignal | undefined }) => Promise<unknown>
} {
  return {
    name: 'second_look_finalize',
    description: 'Second Look enhanced review only: call this BEFORE delivering results that include code/config changes. '
      + 'It re-collects the remaining changes and reports reviewed / pending / explicitly user-allowed / coverage gaps. '
      + 'A sent final reply is NOT review success; any later modification invalidates a previous finalize.',
    parameters: {
      type: 'object',
      properties: {
        note: { type: 'string', description: 'Optional delivery note recorded with the report.' },
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          completed: { type: 'boolean' },
          reviewed: { type: 'array', items: { type: 'string' } },
          pending: { type: 'array', items: { type: 'string' } },
          userAllowed: { type: 'array', items: { type: 'string' } },
          gaps: { type: 'array', items: { type: 'string' } },
          report: { type: 'string' },
        },
        required: ['completed', 'reviewed', 'pending', 'userAllowed', 'gaps', 'report'],
        additionalProperties: false,
      },
      render: (_args, value) => [{
        type: 'text',
        text: String((value as { report?: unknown }).report ?? `[${brand(deps.language?.() ?? 'en')}] ${text(deps.language?.() ?? 'en', '交付检查报告缺失', 'Finalize report missing')}`),
      }],
    },
    async execute(_args, exec) {
      const resolved = deps.resolve?.(exec as { agent?: { session?: unknown } }) ?? {}
      if (resolved.enabled === false) return { completed: true, reviewed: [], pending: [], userAllowed: [], gaps: [], report: `[${brand(deps.language?.() ?? 'en')}] ${text(deps.language?.() ?? 'en', '本会话未启用加强档交付检查，不声明任何审核覆盖。', 'Enhanced delivery review is not active for this session; no review coverage is claimed.')}` }
      const report = await collectFinalizeReport({ ...deps, ...resolved, signal: exec?.signal ?? deps.signal })
      deps.onCollected?.(report)
      return {
        completed: report.completed,
        reviewed: [...report.reviewed],
        pending: [...report.pending],
        userAllowed: [...report.userAllowed],
        gaps: report.gaps.map(gap => localizeGap(gap, deps.language?.() ?? 'en')),
        report: renderFinalizeReport(report, deps.language?.() ?? 'en'),
      }
    },
  }
}

/** Human-allowed action labels derived from a batch record (audit helper). */
export function userAllowedLabel(record: BatchReviewRecord, callId: string): string {
  return `${record.tier} action ${callId} (batch ${record.id})`
}
