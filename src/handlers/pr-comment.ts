import * as core from '@actions/core';
import * as github from '@actions/github';
import { Octokit } from '../github/api';
import { checkoutBranch, configureGit } from '../github/branch';
import { getPRBranch } from '../github/pr';
import { setLabel, LABELS } from '../github/labels';
import { readSession } from '../harness/session';
import { installClaude } from '../harness/runner';
import { ActionConfig, executeTurn } from './common';

export async function handlePRComment(
  octokit: Octokit,
  config: ActionConfig
): Promise<void> {
  const { owner, repo } = github.context.repo;
  const payload = github.context.payload;
  const comment = payload.comment!;
  const issue = payload.issue!;
  const prNumber = issue.number;

  core.info(`Handling PR comment on #${prNumber}`);

  // Get the branch for this PR
  const branchName = await getPRBranch(octokit, owner, repo, prNumber);

  // Verify this is a Cloud Code branch
  if (!branchName.startsWith('cloud-code/')) {
    core.info(`PR #${prNumber} is not a Cloud Code PR (branch: ${branchName}), skipping`);
    return;
  }

  // Configure git and checkout the branch
  await configureGit();
  await checkoutBranch(branchName);

  // Read session state
  let session;
  try {
    session = readSession();
  } catch (err) {
    core.warning(`Cannot read session state for PR #${prNumber}: ${err}`);
    return;
  }

  // Set active label
  await setLabel(octokit, owner, repo, session.issueNumber, LABELS.active);

  // Install Claude Code CLI
  await installClaude();

  // Execute the turn with the comment as the human message
  await executeTurn(
    octokit, owner, repo, session.issueNumber, prNumber,
    comment.body, config, true // isResume = true
  );
}
