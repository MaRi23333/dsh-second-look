/**
 * Modified for dsh-second-look, 2026-10-31 (T01 migration; see THIRD-PARTY-SOURCES.md).
 * One `tool/result` event read in whichever shape the host wrote it.
 *
 * The `0.1.6-alpha.2` line (format V3) wrapped the model-facing result in a
 * single `tool-result` content block of a `role: 'user'` message. Host
 * `dsh-v0.1.7-alpha.1` (format V4) deleted that block type: the result is a
 * first-class `role: 'tool'` message carrying `toolCallId` and the result
 * blocks at the TOP level (`session-format-v3-to-v4/src/tool-role.ts`), and
 * the V4 admission path refuses any content that still contains a released
 * `tool-result` wrapper.
 *
 * READ side. The upgrade is one-way: this module never constructs the retired
 * V3 shape, and everything this plugin WRITES is V4 (`tool/result` events are
 * produced by the host, and `dsh-tools`/the agent loop own that write). What
 * it does do is READ both shapes, because:
 *
 * - `fixtures/sessions/*.json` are replayable logs authored on the V3 line and
 *   must keep proving the invariant companion (a fixture rewritten to V4 would
 *   stop testing the upgrade path a real user's log actually takes);
 * - a session log written by an older harness can still be replayed/restored
 *   under this host, and the reviewer's compact transcript must keep showing
 *   those results instead of silently dropping the evidence.
 *
 * @module dsh-auto-review/session-message
 */
/** One tool result normalized across the two durable shapes. */
export interface ToolResultView {
    /** The call id pairing `tool/call` and `tool/result` (top level in V4, wrapper field in V3). */
    readonly callId: string;
    /** The raw result blocks, whichever field carried them. */
    readonly content: readonly {
        readonly type: string;
    }[];
    /** Whether the invocation failed: the message's flag, else the wrapper's. */
    readonly isError: boolean | undefined;
}
/**
 * Normalize one `tool/result` event message into a {@link ToolResultView},
 * accepting the V4 first-class tool message and the retired V3 wrapper block.
 * @param message - the event's `message`, as stored (structurally, not typed).
 * @returns the normalized view, or undefined when the row carries no tool result.
 */
export declare function readToolResult(message: unknown): ToolResultView | undefined;
/**
 * Join the text blocks of a normalized tool result.
 * @param view - the normalized result.
 * @returns the concatenated text, '' when the result carried none.
 */
export declare function toolResultText(view: ToolResultView): string;
/**
 * Whether one `tool/result` event marks a failure, reading BOTH the event's
 * own `error` identity and the result message's `isError` flag.
 * @param error - the event's optional error identity.
 * @param view - the normalized result.
 * @returns true when either source says the invocation failed.
 */
export declare function toolResultIsError(error: unknown, view: ToolResultView): boolean;
//# sourceMappingURL=session-message.d.ts.map