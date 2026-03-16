import * as core from '@actions/core';
import * as github from '@actions/github';
import { getOctokit, hasWriteAccess } from './github/api';
import { handleIssueOpened } from './handlers/issue-opened';
import { handlePRComment } from './handlers/pr-comment';
import { handleIssueComment } from './handlers/issue-comment';
import { getActionConfig } from './handlers/common';
import { setLabel, LABELS, ensureLabelsExist } from './github/labels';
import { postIssueComment } from './github/comments';

async function run(): Promise<void> {
  try {
    const config = getActionConfig();
    const octokit = getOctokit();
    const { owner, repo } = github.context.repo;

    const eventName = github.context.eventName;
    const action = github.context.payload.action;
    const sender = github.context.payload.sender?.login;

    core.info(`Event: ${eventName}.${action} by ${sender}`);

    // Check allowlist
    if (!(await isUserAllowed(octokit, owner, repo, sender, config.allowedUsers))) {
      core.info(`User ${sender} is not authorized to trigger Cloud Code. Skipping.`);
      return;
    }

    // Ignore bot comments to prevent loops
    if (sender === 'github-actions[bot]' || sender === 'cloud-code[bot]') {
      core.info('Ignoring bot comment');
      return;
    }

    if (eventName === 'issues' && action === 'opened') {
      await handleIssueOpened(octokit, config);
    } else if (eventName === 'issue_comment' && action === 'created') {
      const issue = github.context.payload.issue!;

      if (issue.pull_request) {
        // Comment on a PR → resume session
        await handlePRComment(octokit, config);
      } else {
        // Comment on an issue → new attempt
        await handleIssueComment(octokit, config);
      }
    } else {
      core.info(`Unhandled event: ${eventName}.${action}`);
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    core.error(err);
    core.setFailed(err.message);

    // Try to set error label and post error comment
    try {
      const octokit = getOctokit();
      const { owner, repo } = github.context.repo;
      const issueNumber = github.context.payload.issue?.number;
      if (issueNumber) {
        await ensureLabelsExist(octokit, owner, repo);
        await setLabel(octokit, owner, repo, issueNumber, LABELS.error);
        await postIssueComment(
          octokit, owner, repo, issueNumber,
          `Cloud Code encountered an error:\n\n\`\`\`\n${err.message}\n\`\`\``
        );
      }
    } catch {
      // Best effort error reporting
    }
  }
}

async function isUserAllowed(
  octokit: ReturnType<typeof getOctokit>,
  owner: string,
  repo: string,
  username: string | undefined,
  allowedUsers: string[]
): Promise<boolean> {
  if (!username) return false;

  // If an explicit allowlist is configured, use it
  if (allowedUsers.length > 0) {
    return allowedUsers.includes(username);
  }

  // Otherwise, check for repo write access
  return hasWriteAccess(octokit, owner, repo, username);
}

run();
