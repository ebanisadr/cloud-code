import { ToolCall } from '../utils/format-comment';
export interface RunResult {
    sessionId: string;
    text: string;
    toolCalls: ToolCall[];
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    durationMs: number;
    isDone: boolean;
    isCompacted: boolean;
    isError: boolean;
}
export interface RunOptions {
    prompt: string;
    model: string;
    maxContext: number;
    sessionId?: string;
    workingDirectory: string;
    apiKey: string;
    oauthToken?: string;
    dangerouslySkipPermissions: boolean;
    timeoutMs: number;
}
export declare function installClaude(): Promise<void>;
export declare function backupClaudeSession(): Promise<void>;
export declare function restoreClaudeSession(): Promise<void>;
export declare function runClaude(options: RunOptions): Promise<RunResult>;
//# sourceMappingURL=runner.d.ts.map