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
export declare const SENSITIVE_KEY: RegExp;
/**
 * Blocking secret-value shapes ONLY (终审 Major 1): PEM blocks, token
 * prefixes with their separators, AWS key ids, JWTs, bearer headers and
 * inline `key=value` forms. Bare credential WORDS and path mentions are NOT
 * values — they route/annotate via {@link SENSITIVE_NOTE} and never block a
 * send by themselves.
 */
export declare const SENSITIVE_VALUE: RegExp;
/**
 * Non-blocking annotations (终审 Major 1): bare credential WORDS and
 * credential-store PATH mentions. A filename or a field name is not secret
 * content; these are routing hints, never send blockers.
 */
export declare const SENSITIVE_NOTE: RegExp;
export declare const SENSITIVE_PATH: RegExp;
/** Replace the user-declared markers (settings store wires this). */
export declare function setUserSensitiveMarkers(markers: readonly string[]): void;
/** The active user-declared markers (status/audit). */
export declare function userSensitiveMarkers(): readonly string[];
/**
 * Mask every secret-VALUE-shaped span in a text (终审 Major 2): the probe and
 * any other egress run this BEFORE content leaves the process, alongside the
 * inline `key=value` redaction — bare tokens/PEM/JWTs must never reach a
 * reviewer or a log in raw form.
 * @param text - the raw text.
 * @returns the text with value-shaped spans replaced by `[REDACTED]`.
 */
export declare function redactSensitiveValues(text: string): string;
/**
 * Return true when nested JSON-like data appears to contain credentials or
 * credential-store paths. The scan is structural (keys and string values); it
 * never evaluates or emits the matched material. Value shapes and
 * user-declared markers route to review; words/paths alone are routing hints
 * (they still route — routing is safe; blocking is not their job).
 */
export declare function containsSensitiveMaterial(value: unknown): boolean;
/**
 * Whether a path string names a credential-store location (a review-routing
 * signal only — never a denial by itself).
 */
export declare function isSensitivePathText(text: string): boolean;
//# sourceMappingURL=sensitive.d.ts.map