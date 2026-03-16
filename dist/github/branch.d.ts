import { Octokit } from './api';
export declare function generateBranchName(issueNumber: number, title: string, attempt: number): string;
export declare function getNextAttemptNumber(octokit: Octokit, owner: string, repo: string, issueNumber: number): Promise<number>;
export declare function createBranch(octokit: Octokit, owner: string, repo: string, branchName: string, baseSha: string): Promise<void>;
export declare function getBaseSha(octokit: Octokit, owner: string, repo: string, defaultBranch: string): Promise<string>;
export declare function checkoutBranch(branchName: string): Promise<void>;
export declare function configureGit(): Promise<void>;
export declare function commitAndPush(message: string): Promise<void>;
export declare function pushBranch(): Promise<void>;
//# sourceMappingURL=branch.d.ts.map