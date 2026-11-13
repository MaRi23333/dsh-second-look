/** Shared detection/redaction: values, not type declarations or schema field names. */
export interface SecretSpan {
    start: number;
    end: number;
    label: string;
}
export declare const SECRET_FIELD: RegExp;
export declare function isSecretLiteral(value: string): boolean;
export declare function secretSpans(text: string): SecretSpan[];
export declare function redactSecretSpans(text: string): string;
//# sourceMappingURL=secret-spans.d.ts.map