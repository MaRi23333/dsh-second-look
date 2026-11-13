import { redactSecretSpans } from './secret-spans.ts'
/**
 * Modified for dsh-second-look, 2026-10-31 (T02).
 *
 * Sensitive-material detection, ported from the local fork
 * `dsh-heavy-approval/src/review-policy.ts` (workspace-local source, reused
 * with attribution; see THIRD-PARTY-SOURCES.md).
 *
 * Task-doc rule: a sensitive HIT only routes the call to review — it never
 * auto-denies on a file name, and nothing here sends the raw value anywhere.
 */
export const SENSITIVE_KEY = /(?:^|[_-])(?:api[_-]?key|access[_-]?key|private[_-]?key|secret[_-]?key|client[_-]?secret|(?:access|refresh|auth|session|id)[_-]?token|credentials?|token|secret|password|passwd|authorization|cookie)(?:$|[_-])/i
/**
 * Blocking secret-value shapes ONLY (终审 Major 1): PEM blocks, token
 * prefixes with their separators, AWS key ids, JWTs, bearer headers and
 * inline `key=value` forms. Bare credential WORDS and path mentions are NOT
 * values — they route/annotate via {@link SENSITIVE_NOTE} and never block a
 * send by themselves.
 */
export const SENSITIVE_VALUE = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk[-_]|ghp_|github_pat_|glpat-|xox[baprs][-_])[A-Za-z0-9_-]{8,}\b|\b(?:AKIA|ASIA)[A-Z0-9]{12,16}\b|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b|authorization\s*:\s*(?:bearer|basic)\s+\S+|(?:api[_-]?key|access[_-]?key|token|secret|password|passwd|pwd|credential|private[_-]?key)["']?\s*[:=]\s*(?:Bearer\s+|Basic\s+)?["']?[^\s"';&|,)]{6,})/i
/**
 * Non-blocking annotations (终审 Major 1): bare credential WORDS and
 * credential-store PATH mentions. A filename or a field name is not secret
 * content; these are routing hints, never send blockers.
 */
export const SENSITIVE_NOTE = /(?:\b(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN|PASSWORD|CLIENT_SECRET)\b|(?:^|[\s/\\])(?:\.ssh|\.aws|\.gnupg|\.env)(?:[\s/\\]|$))/i
export const SENSITIVE_PATH = /(?:^|[\s'"=:/\\])(?:[\w.-]*\.env(?:\.[\w-]+)*|\.credentials\.ya?ml|\.npmrc|\.netrc|\.pypirc|\.git-credentials|\.docker[/\\]config\.json|\.(?:ssh|aws|gnupg)(?:[/\\]|$))(?=$|[\s'".,;:!?/\\)])/i

/**
 * User-declared extra sensitive markers (settings `sensitiveScope`, 终审
 * Minor 1): matched as LITERAL substrings — no regex injection surface.
 */
let userMarkers: readonly string[] = []

/** Replace the user-declared markers (settings store wires this). */
export function setUserSensitiveMarkers(markers: readonly string[]): void {
  userMarkers = markers
}

/** The active user-declared markers (status/audit). */
export function userSensitiveMarkers(): readonly string[] {
  return userMarkers
}

/** Whether a text carries a user-declared marker. */
function hasUserMarker(text: string): boolean {
  return userMarkers.some(marker => marker.length > 0 && text.includes(marker))
}

/**
 * Mask every secret-VALUE-shaped span in a text (终审 Major 2): the probe and
 * any other egress run this BEFORE content leaves the process, alongside the
 * inline `key=value` redaction — bare tokens/PEM/JWTs must never reach a
 * reviewer or a log in raw form.
 * @param text - the raw text.
 * @returns the text with value-shaped spans replaced by `[REDACTED]`.
 */
export function redactSensitiveValues(text: string): string {
  return redactSecretSpans(text)
}

/**
 * Return true when nested JSON-like data appears to contain credentials or
 * credential-store paths. The scan is structural (keys and string values); it
 * never evaluates or emits the matched material. Value shapes and
 * user-declared markers route to review; words/paths alone are routing hints
 * (they still route — routing is safe; blocking is not their job).
 */
export function containsSensitiveMaterial(value: unknown): boolean {
  const pending: unknown[] = [value]
  const seen = new Set<object>()
  while (pending.length > 0) {
    const current = pending.pop()
    if (typeof current === 'string') {
      if (SENSITIVE_VALUE.test(current) || SENSITIVE_NOTE.test(current) || SENSITIVE_PATH.test(current) || hasUserMarker(current)) return true
      continue
    }
    if (current === null || typeof current !== 'object') continue
    if (seen.has(current)) return true
    seen.add(current)
    if (Array.isArray(current)) {
      for (const nested of current) pending.push(nested)
      continue
    }
    for (const [key, nested] of Object.entries(current)) {
      if (SENSITIVE_KEY.test(key)) return true
      pending.push(nested)
    }
  }
  return false
}

/**
 * Whether a path string names a credential-store location (a review-routing
 * signal only — never a denial by itself).
 */
export function isSensitivePathText(text: string): boolean {
  return SENSITIVE_PATH.test(text) || SENSITIVE_NOTE.test(text) || SENSITIVE_VALUE.test(text) || hasUserMarker(text)
}
