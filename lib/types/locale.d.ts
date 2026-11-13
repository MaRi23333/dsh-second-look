import type { UiLanguage } from './messages.js';
/** Product copy only. Protocol ids, paths and model/provider names stay unchanged. */
export declare function text(language: UiLanguage, zh: string, en: string): string;
export declare function brand(language: UiLanguage): string;
export declare function languageOf(value: unknown): UiLanguage | undefined;
/** The client publishes its effective locale (including browser auto-detection).
 * Before it connects, use the host's explicit preference, then plugin fallback.
 * This never writes a preference or affects permission/settlement state. */
export declare class HostLanguage {
    private readonly hostPreference;
    private readonly fallback;
    private active;
    constructor(hostPreference: () => unknown, fallback: UiLanguage);
    set(value: unknown): boolean;
    get(): UiLanguage;
}
/** Stable failure categories get translated; external diagnostic text is retained
 * as a separate detail so provider-specific causes are not hidden or invented. */
export declare function failureText(language: UiLanguage, kind: string): string;
//# sourceMappingURL=locale.d.ts.map