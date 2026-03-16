import * as github from '@actions/github';
export type Octokit = ReturnType<typeof github.getOctokit>;
export declare function getOctokit(): Octokit;
export declare function getDefaultBranch(octokit: Octokit, owner: string, repo: string): Promise<string>;
export declare function hasWriteAccess(octokit: Octokit, owner: string, repo: string, username: string): Promise<boolean>;
//# sourceMappingURL=api.d.ts.map