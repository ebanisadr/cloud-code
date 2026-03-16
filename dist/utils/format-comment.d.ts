import { ContextUsage } from './context-tracker';
export interface ToolCall {
    name: string;
    input: Record<string, unknown>;
    output?: string;
    durationMs?: number;
}
export declare function formatToolCallsSection(toolCalls: ToolCall[]): string;
export declare function formatComment(text: string, toolCalls: ToolCall[], usage: ContextUsage, model: string, sessionId: string): string;
//# sourceMappingURL=format-comment.d.ts.map