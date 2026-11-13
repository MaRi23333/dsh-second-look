/** Shared detection/redaction: values, not type declarations or schema field names. */
export interface SecretSpan { start: number; end: number; label: string }

export const SECRET_FIELD = /^(?:[a-z0-9]+[_-])*(?:api[_-]?key|access[_-]?key|private[_-]?key|secret[_-]?key|client[_-]?secret|(?:access|refresh|auth|session|id)[_-]?token|credentials?|token|secret|password|passwd|pwd|authorization|cookie)$/iu

export function isSecretLiteral(value: string): boolean {
  const text = value.trim()
  if (!text || /^\[REDACTED\]$/iu.test(text)) return false
  if (/^(?:string|number|boolean|unknown|undefined|null|never|any|object|true|false)$/u.test(text)) return false
  if (/^(?:process\.env\.|import\.meta\.env\.|\$env:|\$\{|\$[A-Za-z_]|env\(|z\.|input\b|args\b|options\b|config\b)/u.test(text)) return false
  return true
}

export function secretSpans(text: string): SecretSpan[] {
  const spans: SecretSpan[] = []
  const strong = /-----BEGIN ([A-Z ]*PRIVATE KEY)-----[\s\S]*?(?:-----END \1-----|$)|\b(?:sk[-_]|ghp_|github_pat_|glpat-|xox[baprs][-_])[A-Za-z0-9_-]{8,}\b|\b(?:AKIA|ASIA)[A-Z0-9]{12,16}\b|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/gu
  for (const match of text.matchAll(strong)) spans.push({ start: match.index, end: match.index + match[0].length, label: 'credential' })
  const assignments = /\b((?:[a-z0-9]+[_-])*(?:api[_-]?key|access[_-]?key|private[_-]?key|secret[_-]?key|client[_-]?secret|(?:access|refresh|auth|session|id)[_-]?token|credentials?|token|secret|password|passwd|pwd|authorization|cookie))["']?\s*[:=]\s*(?:Bearer\s+|Basic\s+)?(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([^\s"';&|,)}]+))/giu
  for (const match of text.matchAll(assignments)) {
    const value = match[2] ?? match[3] ?? match[4] ?? ''
    const quoted = match[2] !== undefined || match[3] !== undefined
    if (!isSecretLiteral(value)) continue
    if (!quoted && (/[(){}<>]/u.test(value) || /^(?:function|async|const|let)$/u.test(value))) continue
    const offset = match[0].lastIndexOf(value)
    spans.push({ start: match.index + offset, end: match.index + offset + value.length, label: match[1] ?? 'credential' })
  }
  const flags = /--?((?:[a-z0-9]+[_-])*(?:api[_-]?key|token|secret|password|passwd|pwd|authorization|credential|private[_-]?key|access[_-]?key))\s+(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([^\s"';&|,)}]+))/giu
  for (const match of text.matchAll(flags)) {
    const value = match[2] ?? match[3] ?? match[4] ?? ''
    if (!isSecretLiteral(value)) continue
    const offset = match[0].lastIndexOf(value)
    spans.push({ start: match.index + offset, end: match.index + offset + value.length, label: match[1] ?? 'credential' })
  }
  spans.sort((a, b) => a.start - b.start || b.end - a.end)
  const merged: SecretSpan[] = []
  for (const span of spans) {
    const previous = merged.at(-1)
    if (previous && span.start < previous.end) previous.end = Math.max(previous.end, span.end)
    else merged.push({ ...span })
  }
  return merged
}

export function redactSecretSpans(text: string): string {
  let result = text
  for (const span of secretSpans(text).reverse()) result = result.slice(0, span.start) + '[REDACTED]' + result.slice(span.end)
  return result
}
