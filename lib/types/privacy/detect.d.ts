/** What kind of sensitive material was detected outbound. */
export type SensitiveKind = 'credential-value' | 'credential-path' | 'credential-key';
/** One detection: redacted evidence only. */
export interface SensitiveFinding {
    readonly kind: SensitiveKind;
    /** Redacted, bounded excerpt — the secret itself is NEVER stored. */
    readonly evidence: string;
    /** Where it appeared (message index + content block), for the review request. */
    readonly location: string;
}
/** The scan result for one outbound request. */
export interface OutboundScan {
    /**
     * Blocking findings: credential VALUES and credential-named fields —
     * material whose disclosure needs a decision.
     */
    readonly findings: readonly SensitiveFinding[];
    /**
     * Non-blocking notes: bare credential-store PATH mentions (a filename is
     * not secret content — routing/sensitive READS are gated elsewhere; T08
     * replay found that blocking the model's whole request over a path NAME
     * is a false positive).
     */
    readonly notes: readonly SensitiveFinding[];
    /**
     * Local digest of the RAW matched spans (sorted). Identical sensitive
     * content → identical fingerprint; new content → new fingerprint. Raw
     * spans never leave the matching step.
     */
    readonly dataFingerprint: string;
    /** True when the request carries attachments this hook cannot inspect. */
    readonly attachmentsUnscanned: boolean;
}
/** Clone only JSON content; never rewrite the caller's frozen request or history. */
export declare function redactOutboundPayload(value: unknown): unknown;
/**
 * Scan an outbound LLM request payload (messages/system as plain JSON).
 * @param payload - the request content (read-only; it is never modified).
 * @param options - whether attachments are present but unscannable.
 * @returns findings + the local data fingerprint.
 */
export declare function scanOutbound(payload: unknown, options?: {
    readonly attachmentsPresent?: boolean;
}): OutboundScan;
//# sourceMappingURL=detect.d.ts.map