import { Octokit } from './api';

export async function postPRComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  body: string
): Promise<void> {
  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body,
  });
}

export async function postIssueComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string
): Promise<void> {
  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body,
  });
}
