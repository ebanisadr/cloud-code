export interface SessionState {
    id: string;
    issueNumber: number;
    prNumber: number;
    branchName: string;
    model: string;
    maxContext: number;
    status: 'starting' | 'active' | 'waiting' | 'done' | 'error' | 'compacted';
    turnCount: number;
    contextUsage: {
        used: number;
        available: number;
    };
    createdAt: string;
    updatedAt: string;
}
export interface SessionConfig {
    model: string;
    maxContext: number;
    dangerouslySkipPermissions: boolean;
}
export declare function cloudCodeDir(): string;
export declare function sessionJsonPath(): string;
export declare function configJsonPath(): string;
export declare function promptMdPath(): string;
export declare function turnsDir(): string;
export declare function initCloudCodeDir(issueNumber: number, branchName: string, model: string, maxContext: number, renderedPrompt: string, config: SessionConfig): SessionState;
export declare function readSession(): SessionState;
export declare function writeSession(session: SessionState): void;
export declare function updateSessionAfterTurn(session: SessionState, sessionId: string, contextUsed: number, isDone: boolean, isError: boolean): SessionState;
export declare function sessionBackupPath(): string;
//# sourceMappingURL=session.d.ts.map