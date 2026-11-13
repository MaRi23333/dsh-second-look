/**
 * Modified for dsh-second-look, 2026-10-31 (T01 migration; see THIRD-PARTY-SOURCES.md).
 * User-facing command strings for `dsh-auto-review` in the supported
 * languages. The table is a pure function of the resolved `language` config;
 * the English strings are the source of truth, the Chinese twin mirrors
 * them. Reviewer-prompt content is NOT here (it is config-provided
 * guidance/policy text, not command UI).
 * @module dsh-auto-review/messages
 */
/** Supported UI languages for the `/auto-review` command output. */
export type UiLanguage = 'en' | 'zh';
/** All command strings of one language. */
export interface Messages {
    readonly usage: string;
    readonly description: string;
    readonly statusLine: (enabled: boolean) => string;
    readonly reviewerLine: (model: string | undefined) => string;
    readonly verdictsLine: (used: number, max: number) => string;
    readonly failuresLine: (used: number, max: number) => string;
    readonly circuitLine: (kind: string, count: number, action: string) => string;
    readonly allTimeLine: (allows: number, denies: number, fallbacks: number, rejections: number, avg: number) => string;
    readonly memoryStatsLine: (allows: number, denies: number, fallbacks: number, rejections: number, avg: number) => string;
    readonly recentLine: (labels: string) => string;
    readonly unknownArg: (arg: string) => string;
    readonly already: (state: string) => string;
    readonly switchedNotice: (enabled: boolean) => string;
    readonly switchedResult: (state: string) => string;
    readonly approveResult: (toolName: string, reviewId: string, minutes: number) => string;
    readonly approveNone: (index: number, count: number) => string;
    readonly approveInvalid: (arg: string) => string;
    readonly circuitNotice: (kind: string, count: number) => string;
    readonly auditDisabledNotice: string;
}
/** The message tables, keyed by {@link UiLanguage}. */
export declare const MESSAGES: Readonly<Record<UiLanguage, Messages>>;
/**
 * Pick one language's message table.
 * @param language - the resolved UI language.
 * @returns the table (English and Chinese are the shipped languages).
 */
export declare function messages(language: UiLanguage): Messages;
//# sourceMappingURL=messages.d.ts.map