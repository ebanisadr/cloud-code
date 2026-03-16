import * as core from '@actions/core';
import * as exec from '@actions/exec';
import { Octokit } from '../github/api';
import { commitAndPush } from '../github/branch';
import { postPRComment, postIssueComment } from '../github/comments';
import { setLabel, LABELS } from '../github/labels';
import { updatePRDescription, markPRReady } from '../github/pr';
import { RunResult, runClaude, backupClaudeSession, restoreClaudeSession, restoreAuthCredentials } from '../harness/runner';
import { SessionState, readSession, writeSession, updateSessionAfterTurn } from '../harness/session';
import { writeTurn, getNextTurnNumber, buildSessionLog } from '../harness/turn-logger';
import { handleCompaction } from '../harness/compaction';
import { formatComment } from '../utils/format-comment';
import { parseContextUsage } from '../utils/context-tracker';
import { DONE_SIGNAL } from '../prompt/defaults';
import { buildFinishPRBody } from '../github/pr';

export interface ActionConfig {
  anthropicApiKey: string;
  claudeCredentials: string;
  promptTemplate: string;
  workingDirectory: string;
  model: string;
  maxContext: number;
  fallbackMaxContext: number;
  projectDocs: string;
  dangerouslySkipPermissions: boolean;
  allowedUsers: string[];
  timeoutMs: number;
}

export function getActionConfig(): ActionConfig {
  const allowedUsersRaw = core.getInput('allowed_users');
  const anthropicApiKey = core.getInput('anthropic_api_key');
  const claudeCredentials = core.getInput('claude_credentials');

  if (!anthropicApiKey && !claudeCredentials) {
    throw new Error(
      'Either anthropic_api_key or claude_credentials must be provided. ' +
      'Use anthropic_api_key for API billing, or claude_credentials for Max subscription auth.'
    );
  }

  return {
    anthropicApiKey,
    claudeCredentials,
    promptTemplate: core.getInput('prompt_template'),
    workingDirectory: core.getInput('working_directory') || '.',
    model: core.getInput('model') || 'claude-opus-4-6',
    maxContext: parseInt(core.getInput('max_context') || '200000', 10),
    fallbackMaxContext: parseInt(core.getInput('fallback_max_context') || '1000000', 10),
    projectDocs: core.getInput('project_docs') || 'docs/**/*.md',
    dangerouslySkipPermissions: core.getBooleanInput('dangerously_skip_permissions'),
    allowedUsers: allowedUsersRaw
      ? allowedUsersRaw.split(',').map(u => u.trim()).filter(Boolean)
      : [],
    timeoutMs: parseInt(core.getInput('timeout_minutes') || '20', 10) * 60_000,
  };
}

export async function executeTurn(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  prNumber: number,
  prompt: string,
  config: ActionConfig,
  isResume: boolean
): Promise<RunResult> {
  // Write the human turn
  const humanTurnNumber = getNextTurnNumber();
  writeTurn(humanTurnNumber, 'human', prompt);

  // Restore auth credentials (from secret) — always first, before session restore
  if (config.claudeCredentials) {
    await restoreAuthCredentials(config.claudeCredentials);
  }

  // Restore Claude session if resuming (layered on top of auth)
  if (isResume) {
    await restoreClaudeSession();
  }

  // Read session to get session ID for resume
  let session: SessionState;
  try {
    session = readSession();
  } catch {
    throw new Error('Cannot read session.json — state may be corrupted');
  }

  // Run Claude Code
  let result = await runClaude({
    prompt,
    model: config.model,
    maxContext: config.maxContext,
    sessionId: isResume && session.id ? session.id : undefined,
    workingDirectory: config.workingDirectory,
    apiKey: config.anthropicApiKey,
    dangerouslySkipPermissions: config.dangerouslySkipPermissions,
    timeoutMs: config.timeoutMs,
  });

  // Handle compaction
  if (result.isCompacted) {
    result = await handleCompaction(session, config.fallbackMaxContext, {
      model: config.model,
      workingDirectory: config.workingDirectory,
      apiKey: config.anthropicApiKey,
      dangerouslySkipPermissions: config.dangerouslySkipPermissions,
      timeoutMs: config.timeoutMs,
    });
  }

  // Write the assistant turn
  const assistantTurnNumber = humanTurnNumber + 1;
  writeTurn(assistantTurnNumber, 'assistant', result.text, result.toolCalls);

  // Update session state
  const totalTokens = result.inputTokens + result.outputTokens;
  updateSessionAfterTurn(session, result.sessionId, totalTokens, result.isDone, result.isError);
  session.prNumber = prNumber;
  writeSession(session);

  // Backup Claude session for future resume
  await backupClaudeSession();

  // Push any changes the agent may have made, plus .cloud-code/
  await commitAndPush(`cloud-code: update session after turn ${assistantTurnNumber}`);

  // Format and post PR comment
  const usage = parseContextUsage({
    usage: { input_tokens: result.inputTokens, output_tokens: result.outputTokens },
  }, config.maxContext);

  const comment = formatComment(
    result.text,
    result.toolCalls,
    usage,
    config.model,
    result.sessionId
  );
  await postPRComment(octokit, owner, repo, prNumber, comment);

  // Handle finish-up if done
  if (result.isDone) {
    await handleFinishUp(octokit, owner, repo, issueNumber, prNumber, result, session);
  }

  // Update labels
  if (result.isError) {
    await setLabel(octokit, owner, repo, issueNumber, LABELS.error);
  } else if (result.isDone) {
    await setLabel(octokit, owner, repo, issueNumber, LABELS.needsQA);
  } else {
    await setLabel(octokit, owner, repo, issueNumber, LABELS.waiting);
  }

  return result;
}

async function handleFinishUp(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  prNumber: number,
  result: RunResult,
  _session: SessionState
): Promise<void> {
  core.info('Agent signaled completion — running finish-up');

  // Extract summary from agent's final text (everything after CLOUD_CODE_DONE)
  const doneIndex = result.text.indexOf(DONE_SIGNAL);
  const summaryText = doneIndex >= 0
    ? result.text.slice(doneIndex + DONE_SIGNAL.length).trim()
    : result.text;

  // Get the PR's base branch for the diff
  const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });
  const baseBranch = pr.base.ref;

  // Get diff summary
  let diffSummary = '';
  try {
    await exec.exec('git', ['fetch', 'origin', baseBranch], { ignoreReturnCode: true });
    const diffResult = await exec.getExecOutput(
      'git', ['diff', '--stat', `origin/${baseBranch}...HEAD`],
      { ignoreReturnCode: true }
    );
    diffSummary = diffResult.stdout || 'No file changes detected.';
  } catch {
    diffSummary = 'Unable to generate diff summary.';
  }

  // Build session log
  const sessionLog = buildSessionLog();

  // Update PR description
  const prBody = buildFinishPRBody(
    issueNumber,
    summaryText,
    diffSummary,
    'See session log for testing details.',
    sessionLog
  );
  await updatePRDescription(octokit, owner, repo, prNumber, prBody);

  // Mark PR as ready for review
  await markPRReady(octokit, owner, repo, prNumber);

  // Post comment on the issue
  await postIssueComment(
    octokit, owner, repo, issueNumber,
    `PR #${prNumber} is ready for review.`
  );
}
