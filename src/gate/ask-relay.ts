import { brand, text } from '../locale.ts'
import type { UiLanguage } from '../messages.ts'
import { createUserMessage } from '@deepseek-ai/dsh-llm'

declare module '@deepseek-ai/dsh-llm/message' {
  interface MessageSourceMap { 'second-look-relay': { kind: 'second-look-relay'; form: 'notice'; summary: string } }
}
/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T04).
 *
 * The self-built ask relay for in-process subagents. The host locks subagent
 * approval policy to `never` (verified in T00 run10): a child's approval ask
 * is silently rejected at the service level and NEVER reaches the answerer
 * chain or a human. This module offers the only humane alternative: hand the
 * question to the PARENT session through the parent agent's verified
 * injection surface, and ALWAYS return "not executed" with correlation
 * information to the child — a relay attempt never authorizes execution by
 * itself.
 */
import type { EvidenceDisclosure } from '../action/types.ts'

/** What the child needs to know about its unexecuted ask. */
export interface AskRelayRequest {
  readonly language?: UiLanguage
  readonly callId: string
  readonly toolName: string
  /** The question the reviewer wanted a human to decide. */
  readonly question: string
  /** Short reason/evidence summary (already redacted upstream). */
  readonly reason: string
  readonly childSessionId: string
}

/** The relay outcome recorded for audit/status. */
export interface AskRelayResult {
  /** Whether a parent-session handoff was attempted. */
  readonly relayed: boolean
  /** Correlation line returned to the child (always present). */
  readonly correlation: string
  readonly disclosures: readonly EvidenceDisclosure[]
}

/** The structural parent-agent injection surface (feature-detected). */
export interface ParentAgentLike {
  inject?(message: unknown): unknown
  /** The parent's session (used for gate-scope checks). */
  readonly session?: unknown
  /** The next link up the delegation lineage (grandparent), when present. */
  readonly parentAgent?: ParentAgentLike | undefined
}

/**
 * Build the "not executed" answer for a child whose ask cannot be settled
 * here, and attempt the parent handoff when the injection surface exists.
 *
 * The rc.5 integration test verifies insertion into the parent inbox. Delivery
 * remains best-effort: insertion does not prove that a human saw or approved
 * the question, and inject does not wake an idle parent.
 * @param parent - the parent agent handle, when the execution exposes one.
 * @param request - the relay content.
 * @returns the relay result (correlation always, relayed flag when attempted).
 */
export function relayAskToParent(parent: ParentAgentLike | undefined, request: AskRelayRequest): AskRelayResult {
  const language = request.language ?? 'en'
  const t = (zh: string, en: string): string => text(language, zh, en)
  const prefix = `[${brand(language)}]`
  const correlation = `${prefix} ${t(`子会话 ${request.childSessionId} 的请求 ${request.callId}（${request.toolName}）未执行，需要你确认：${request.question}`, `Request ${request.callId} (${request.toolName}) from child session ${request.childSessionId} was NOT executed — human decision needed: ${request.question}`)}`
  if (parent === undefined || typeof parent.inject !== 'function') {
    return {
      relayed: false,
      correlation: `${correlation} ${t('（无法转交父会话；请保留调用编号，在父会话中处理）', '(no parent injection surface; keep this correlation to retry in the parent session)')}`,
      disclosures: [{ kind: 'omitted', detail: 'ask relay unavailable: no parent injection surface' }],
    }
  }
  try {
    parent.inject(createUserMessage({
      source: { kind: 'second-look-relay', form: 'notice', summary: `${brand(language)}：${t('子代理操作需要你确认', 'Delegated action requires a human decision')}` },
      content: [{
        type: 'text',
        text: `${prefix} ${t('子代理请求等待父会话处理，操作尚未执行。', 'A delegated subagent call awaits a human decision and was NOT executed.')}\n`
          + `${t('问题', 'Question')}: ${request.question}\n`
          + `${t('调用', 'Call')}: ${request.callId} (${request.toolName}), ${t('子会话', 'child session')} ${request.childSessionId}\n`
          + `${t('审核摘要', 'Reviewer summary')}: ${request.reason}\n`
          + t('如需授权，请明确告知代理；操作将按新授权重新评估。', 'To authorize, tell the agent explicitly; the action will be re-evaluated under the new authorization.'),
      }],
    }))
    return {
      relayed: true,
      correlation: `${correlation} ${t('（已转交父会话，尚不代表用户批准）', '(question handed to the parent session)')}`,
      disclosures: [{ kind: 'omitted', detail: 'parent inbox delivery is best-effort; human receipt or approval is not acknowledged' }],
    }
  } catch (error: unknown) {
    return {
      relayed: false,
      correlation: `${correlation} (${t('转交父会话失败', 'parent injection failed')}: ${error instanceof Error ? error.message : String(error)})`,
      disclosures: [{ kind: 'omitted', detail: 'ask relay injection threw' }],
    }
  }
}
