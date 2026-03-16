export interface ContextUsage {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    available: number;
}
export declare function parseContextUsage(resultMessage: Record<string, unknown>, maxContext: number): ContextUsage;
export declare function formatContextFooter(usage: ContextUsage, model: string, sessionId: string): string;
//# sourceMappingURL=context-tracker.d.ts.map