import * as core from '@actions/core';
import { Octokit } from './api';

const LABEL_PREFIX = 'cloud-code:';

export const LABELS = {
  active: `${LABEL_PREFIX}active`,
  waiting: `${LABEL_PREFIX}waiting`,
  needsQA: `${LABEL_PREFIX}needs-qa`,
  error: `${LABEL_PREFIX}error`,
} as const;

const LABEL_COLORS: Record<string, string> = {
  [LABELS.active]: '1d76db',
  [LABELS.waiting]: 'fbca04',
  [LABELS.needsQA]: '0e8a16',
  [LABELS.error]: 'd93f0b',
};

const LABEL_DESCRIPTIONS: Record<string, string> = {
  [LABELS.active]: 'Cloud Code session in progress',
  [LABELS.waiting]: 'Awaiting user response',
  [LABELS.needsQA]: 'Agent done; PR ready for review',
  [LABELS.error]: 'Unrecoverable error in Cloud Code session',
};

export async function ensureLabelsExist(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<void> {
  for (const label of Object.values(LABELS)) {
    try {
      await octokit.rest.issues.getLabel({ owner, repo, name: label });
    } catch {
      await octokit.rest.issues.createLabel({
        owner,
        repo,
        name: label,
        color: LABEL_COLORS[label] ?? 'ededed',
        description: LABEL_DESCRIPTIONS[label] ?? '',
      });
      core.info(`Created label: ${label}`);
    }
  }
}

export async function setLabel(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  label: string
): Promise<void> {
  // Remove any existing cloud-code labels first
  await removeAllCloudCodeLabels(octokit, owner, repo, issueNumber);
  await octokit.rest.issues.addLabels({
    owner,
    repo,
    issue_number: issueNumber,
    labels: [label],
  });
}

export async function removeAllCloudCodeLabels(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<void> {
  const { data: labels } = await octokit.rest.issues.listLabelsOnIssue({
    owner,
    repo,
    issue_number: issueNumber,
  });
  for (const label of labels) {
    if (label.name.startsWith(LABEL_PREFIX)) {
      try {
        await octokit.rest.issues.removeLabel({
          owner,
          repo,
          issue_number: issueNumber,
          name: label.name,
        });
      } catch {
        // Label may already be removed
      }
    }
  }
}
