import { Octokit } from './api';
export declare function postPRComment(octokit: Octokit, owner: string, repo: string, prNumber: number, body: string): Promise<void>;
export declare function postIssueComment(octokit: Octokit, owner: string, repo: string, issueNumber: number, body: string): Promise<void>;
export declare function fetchFilteredIssueComments(octokit: Octokit, owner: string, repo: string, issueNumber: number, allowedUsers: string[]): Promise<string>;
//# sourceMappingURL=comments.d.ts.map