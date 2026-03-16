import { RunResult, RunOptions } from './runner';
import { SessionState } from './session';
export declare function handleCompaction(session: SessionState, fallbackMaxContext: number, runOptions: Omit<RunOptions, 'sessionId' | 'prompt' | 'maxContext'>): Promise<RunResult>;
//# sourceMappingURL=compaction.d.ts.map