/** A real wall-clock bound even when a provider or probe ignores AbortSignal. */
export declare function withDeadline<T>(timeoutMs: number, parent: AbortSignal | undefined, work: (signal: AbortSignal) => Promise<T>, interrupted: (kind: 'timeout' | 'cancelled') => T): Promise<T>;
//# sourceMappingURL=deadline.d.ts.map