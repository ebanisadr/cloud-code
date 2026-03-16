import * as core from '@actions/core';
import * as github from '@actions/github';
import { Octokit, getDefaultBranch } from '../github/api';
import {
  generateBranchName,
  getNextAttemptNumber,
  createBranch,
  getBaseSha,
  checkoutBranch,
  configureGit,
  commitAndPush,
} from '../github/branch';
import { createDraftPR } from '../github/pr';
import { ensureLabelsExist, setLabel, LABELS } from '../github/labels';
import { initCloudCodeDir } from '../harness/session';
import { installClaude } from '../harness/runner';
import { renderTemplate, TemplateVars } from '../prompt/template';
import { DEFAULT_PROMPT_TEMPLATE } from '../prompt/defaults';
import { fetchFilteredIssueComments } from '../github/comments';
import { ActionConfig, executeTurn } from './common';

export async function handleIssueComment(
  octokit: Octokit,
  config: ActionConfig
): Promise<void> {
  const { owner, repo } = github.context.repo;
  const payload = github.context.payload;
  const issue = payload.issue!;
  const comment = payload.comment;
  const issueNumber = issue.number;

  core.info(`Handling issue comment on #${issueNumber} — creating new attempt`);

  // Ensure labels exist
  await ensureLabelsExist(octokit, owner, repo);

  // Get default branch and its SHA
  const defaultBranch = await getDefaultBranch(octokit, owner, repo);
  const baseSha = await getBaseSha(octokit, owner, repo, defaultBranch);

  // Generate branch name with incremented suffix
  const attempt = await getNextAttemptNumber(octokit, owner, repo, issueNumber);
  const branchName = generateBranchName(issueNumber, issue.title, attempt);

  // Create branch
  await createBranch(octokit, owner, repo, branchName, baseSha);

  // Configure git and checkout the branch
  await configureGit();
  await checkoutBranch(branchName);

  // Fetch issue comments from allowed users
  const issueComments = await fetchFilteredIssueComments(
    octokit, owner, repo, issueNumber, config.allowedUsers
  );

  // Render prompt with the comment as additional context
  const templateVars: TemplateVars = {
    issue: {
      number: issueNumber,
      title: issue.title,
      body: issue.body || '',
      labels: (issue.labels || []).map((l: { name: string }) => l.name).join(', '),
      author: issue.user?.login || '',
      comments: issueComments,
    },
    repo: {
      name: repo,
      full_name: `${owner}/${repo}`,
    },
    comment: { body: comment?.body ?? '' },
  };

  const template = config.promptTemplate || DEFAULT_PROMPT_TEMPLATE;
  let renderedPrompt = renderTemplate(template, templateVars);

  // Append the comment as additional context (not present for issues.edited events)
  if (comment?.body) {
    renderedPrompt += `\n\n---\n\nAdditional context from @${comment.user?.login || 'unknown'}:\n\n${comment.body}`;
  }

  // Initialize .cloud-code/ directory
  initCloudCodeDir(issueNumber, branchName, config.model, config.maxContext, renderedPrompt, {
    model: config.model,
    maxContext: config.maxContext,
    dangerouslySkipPermissions: config.dangerouslySkipPermissions,
  });

  // Commit and push .cloud-code/
  await commitAndPush('cloud-code: initialize session (new attempt)');

  // Create draft PR
  const prNumber = await createDraftPR(octokit, {
    owner,
    repo,
    title: `[Cloud Code] #${issueNumber}: ${issue.title}`,
    body: `Addressing #${issueNumber}.\n\nThis PR was created by Cloud Code (attempt ${attempt}). Work in progress.`,
    head: branchName,
    base: defaultBranch,
    draft: true,
  });

  // Set active label
  await setLabel(octokit, owner, repo, issueNumber, LABELS.active);

  // Install Claude Code CLI
  await installClaude();

  // Execute the first turn
  await executeTurn(
    octokit, owner, repo, issueNumber, prNumber,
    renderedPrompt, config, false
  );
}
