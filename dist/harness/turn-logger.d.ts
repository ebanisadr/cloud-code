import { ToolCall } from '../utils/format-comment';
export declare function writeTurn(turnNumber: number, role: 'human' | 'assistant', content: string, toolCalls?: ToolCall[]): void;
export declare function getNextTurnNumber(): number;
export declare function readAllTurns(): Array<{
    turnNumber: number;
    role: string;
    content: string;
}>;
export declare function buildSessionLog(): string;
//# sourceMappingURL=turn-logger.d.ts.map