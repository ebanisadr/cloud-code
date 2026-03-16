import * as core from '@actions/core';
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

export async function createDraftPR(
  octokit: Octokit,
  options: CreatePROptions
): Promise<number> {
  const { data: pr } = await octokit.rest.pulls.create({
    owner: options.owner,
    repo: options.repo,
    title: options.title,
    body: options.body,
    head: options.head,
    base: options.base,
    draft: options.draft,
  });
  core.info(`Created draft PR #${pr.number}: ${pr.title}`);
  return pr.number;
}

export async function updatePRDescription(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  body: string
): Promise<void> {
  await octokit.rest.pulls.update({
    owner,
    repo,
    pull_number: prNumber,
    body,
  });
}

export async function markPRReady(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<void> {
  // The REST API doesn't support removing draft status directly.
  // Use the GraphQL API instead.
  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  if (!pr.draft) return;

  await octokit.graphql(
    `mutation($id: ID!) {
      markPullRequestReadyForReview(input: { pullRequestId: $id }) {
        pullRequest { id }
      }
    }`,
    { id: pr.node_id }
  );
  core.info(`Marked PR #${prNumber} as ready for review`);
}

export async function getPRBranch(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<string> {
  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });
  return pr.head.ref;
}

export function buildFinishPRBody(
  issueNumber: number,
  summary: string,
  changes: string,
  testing: string,
  sessionLog: string
): string {
  return [
    '## Summary',
    summary,
    '',
    '## Changes',
    changes,
    '',
    '## Testing',
    testing,
    '',
    `Fixes #${issueNumber}`,
    '',
    '<details>',
    '<summary>Full session log</summary>',
    '',
    sessionLog,
    '',
    '</details>',
  ].join('\n');
}
