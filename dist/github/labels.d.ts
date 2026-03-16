import { Octokit } from './api';
export declare const LABELS: {
    readonly active: "cloud-code:active";
    readonly waiting: "cloud-code:waiting";
    readonly needsQA: "cloud-code:needs-qa";
    readonly error: "cloud-code:error";
};
export declare function ensureLabelsExist(octokit: Octokit, owner: string, repo: string): Promise<void>;
export declare function setLabel(octokit: Octokit, owner: string, repo: string, issueNumber: number, label: string): Promise<void>;
export declare function removeAllCloudCodeLabels(octokit: Octokit, owner: string, repo: string, issueNumber: number): Promise<void>;
//# sourceMappingURL=labels.d.ts.map