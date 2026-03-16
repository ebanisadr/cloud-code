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
} from '../github/branch';
import { createDraftPR } from '../github/pr';
import { ensureLabelsExist, setLabel, LABELS } from '../github/labels';
import { initCloudCodeDir } from '../harness/session';
import { commitAndPush } from '../github/branch';
import { installClaude } from '../harness/runner';
import { renderTemplate, TemplateVars } from '../prompt/template';
import { DEFAULT_PROMPT_TEMPLATE } from '../prompt/defaults';
import { fetchFilteredIssueComments } from '../github/comments';
import { ActionConfig, executeTurn } from './common';

export async function handleIssueOpened(
  octokit: Octokit,
  config: ActionConfig
): Promise<void> {
  const { owner, repo } = github.context.repo;
  const issue = github.context.payload.issue!;
  const issueNumber = issue.number;

  core.info(`Handling new issue #${issueNumber}: ${issue.title}`);

  // Ensure labels exist
  await ensureLabelsExist(octokit, owner, repo);

  // Get default branch and its SHA
  const defaultBranch = await getDefaultBranch(octokit, owner, repo);
  const baseSha = await getBaseSha(octokit, owner, repo, defaultBranch);

  // Generate branch name
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

  // Render prompt
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
    comment: { body: '' },
  };

  const template = config.promptTemplate || DEFAULT_PROMPT_TEMPLATE;
  const renderedPrompt = renderTemplate(template, templateVars);

  // Initialize .cloud-code/ directory
  const session = initCloudCodeDir(issueNumber, branchName, config.model, config.maxContext, renderedPrompt, {
    model: config.model,
    maxContext: config.maxContext,
    dangerouslySkipPermissions: config.dangerouslySkipPermissions,
  });

  // Commit and push .cloud-code/
  await commitAndPush('cloud-code: initialize session');

  // Create draft PR
  const prNumber = await createDraftPR(octokit, {
    owner,
    repo,
    title: `[Cloud Code] #${issueNumber}: ${issue.title}`,
    body: `Addressing #${issueNumber}.\n\nThis PR was created by Cloud Code. Work in progress.`,
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
