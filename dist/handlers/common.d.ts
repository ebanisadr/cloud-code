import { Octokit } from '../github/api';
import { RunResult } from '../harness/runner';
export interface ActionConfig {
    anthropicApiKey: string;
    claudeOAuthToken: string;
    promptTemplate: string;
    workingDirectory: string;
    model: string;
    maxContext: number;
    fallbackMaxContext: number;
    projectDocs: string;
    dangerouslySkipPermissions: boolean;
    allowedUsers: string[];
    timeoutMs: number;
}
export declare function getActionConfig(): ActionConfig;
export declare function executeTurn(octokit: Octokit, owner: string, repo: string, issueNumber: number, prNumber: number, prompt: string, config: ActionConfig, isResume: boolean): Promise<RunResult>;
//# sourceMappingURL=common.d.ts.map