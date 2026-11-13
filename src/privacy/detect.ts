/**
 * Modified for dsh-second-look, 2026-10-31 (original work; T06).
 *
 * Outbound sensitive detection: find credential-bearing content in an
 * outbound LLM request WITHOUT ever carrying the secret itself out of this
 * module's matching step. Findings hold redacted, bounded excerpts only; the
 * DATA FINGERPRINT is a local digest of the raw matched spans (never stored
 * raw) so identical retries match an existing authorization while any ADDED
 * sensitive content produces a new fingerprint and forces re-review.
 */
import { createHash } from 'node:crypto'
import { SENSITIVE_NOTE, SENSITIVE_PATH } from '../evidence/sensitive.ts'

import { secretSpans, SECRET_FIELD, isSecretLiteral, redactSecretSpans } from '../evidence/secret-spans.ts'

/** What kind of sensitive material was detected outbound. */
export type SensitiveKind = 'credential-value' | 'credential-path' | 'credential-key'

/** One detection: redacted evidence only. */
export interface SensitiveFinding {
  readonly kind: SensitiveKind
  /** Redacted, bounded excerpt — the secret itself is NEVER stored. */
  readonly evidence: string
  /** Where it appeared (message index + content block), for the review request. */
  readonly location: string
}

/** The scan result for one outbound request. */
export interface OutboundScan {
  /**
   * Blocking findings: credential VALUES and credential-named fields —
   * material whose disclosure needs a decision.
   */
  readonly findings: readonly SensitiveFinding[]
  /**
   * Non-blocking notes: bare credential-store PATH mentions (a filename is
   * not secret content — routing/sensitive READS are gated elsewhere; T08
   * replay found that blocking the model's whole request over a path NAME
   * is a false positive).
   */
  readonly notes: readonly SensitiveFinding[]
  /**
   * Local digest of the RAW matched spans (sorted). Identical sensitive
   * content → identical fingerprint; new content → new fingerprint. Raw
   * spans never leave the matching step.
   */
  readonly dataFingerprint: string
  /** True when the request carries attachments this hook cannot inspect. */
  readonly attachmentsUnscanned: boolean
}

function scanText(text: string, location: string, findings: SensitiveFinding[], notes: SensitiveFinding[], rawSpans: string[]): void {
  for (const span of secretSpans(text)) {
    rawSpans.push(text.slice(span.start, span.end))
    findings.push({ kind: 'credential-value', evidence: `${span.label}=[REDACTED]`, location })
  }
  if (SENSITIVE_PATH.test(text) || SENSITIVE_NOTE.test(text)) {
    notes.push({ kind: 'credential-path', evidence: 'credential path or name mentioned (not its value)', location })
  }
}

/** Clone only JSON content; never rewrite the caller's frozen request or history. */
export function redactOutboundPayload(value: unknown): unknown {
  if (typeof value === 'string') return redactSecretSpans(value)
  if (Array.isArray(value)) return value.map(redactOutboundPayload)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'replayState').map(([key, item]) => [
      key, SECRET_FIELD.test(key) && typeof item === 'string' && isSecretLiteral(item)
        ? '[REDACTED]' : redactOutboundPayload(item),
    ]))
  }
  return value
}

/**
 * Scan an outbound LLM request payload (messages/system as plain JSON).
 * @param payload - the request content (read-only; it is never modified).
 * @param options - whether attachments are present but unscannable.
 * @returns findings + the local data fingerprint.
 */
export function scanOutbound(
  payload: unknown,
  options: { readonly attachmentsPresent?: boolean } = {},
): OutboundScan {
  const findings: SensitiveFinding[] = []
  const notes: SensitiveFinding[] = []
  const rawSpans: string[] = []
  let attachmentsPresent = options.attachmentsPresent === true
  const visit = (value: unknown, location: string): void => {
    if (typeof value === 'string') {
      scanText(value, location, findings, notes, rawSpans)
      return
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${location}[${index}]`))
      return
    }
    if (typeof value === 'object' && value !== null) {
      if ((value as { type?: string }).type === 'image') attachmentsPresent = true
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        if (SECRET_FIELD.test(key) && typeof item === 'string' && isSecretLiteral(item)) {
          // A credential-NAMED field: its value is a raw span even if plain.
          rawSpans.push(`${key}=${typeof item === 'string' ? item : JSON.stringify(item)}`)
          findings.push({ kind: 'credential-key', evidence: `${key}=[REDACTED]`, location: `${location}.${key}` })
          continue
        }
        visit(item, `${location}.${key}`)
      }
    }
  }
  visit(payload, 'request')
  const unique = [...new Set(rawSpans)].sort()
  const dataFingerprint = createHash('sha256').update(unique.join('\u0000')).digest('hex').slice(0, 32)
  return {
    findings,
    notes,
    dataFingerprint,
    attachmentsUnscanned: attachmentsPresent,
  }
}
