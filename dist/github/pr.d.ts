import { Octokit } from './api';
export interface CreatePROptions {
    owner: string;
    repo: string;
    title: string;
    body: string;
    head: string;
    base: string;
    draft: boolean;
}
export declare function createDraftPR(octokit: Octokit, options: CreatePROptions): Promise<number>;
export declare function updatePRDescription(octokit: Octokit, owner: string, repo: string, prNumber: number, body: string): Promise<void>;
export declare function markPRReady(octokit: Octokit, owner: string, repo: string, prNumber: number): Promise<void>;
export declare function getPRBranch(octokit: Octokit, owner: string, repo: string, prNumber: number): Promise<string>;
export declare function buildFinishPRBody(issueNumber: number, summary: string, changes: string, testing: string, sessionLog: string): string;
//# sourceMappingURL=pr.d.ts.map