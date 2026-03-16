import * as exec from '@actions/exec';
import * as core from '@actions/core';
import { Octokit } from './api';
import { slugify } from '../utils/slugify';

export function generateBranchName(issueNumber: number, title: string, attempt: number): string {
  const slug = slugify(title);
  const suffix = attempt > 1 ? `-${attempt}` : '';
  return `cloud-code/issue-${issueNumber}-${slug}${suffix}`;
}

export async function getNextAttemptNumber(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<number> {
  const prefix = `cloud-code/issue-${issueNumber}-`;
  try {
    const { data: refs } = await octokit.rest.git.listMatchingRefs({
      owner,
      repo,
      ref: `heads/${prefix}`,
    });
    if (refs.length === 0) return 1;
    // Find the highest attempt number
    let maxAttempt = 1;
    for (const ref of refs) {
      const branchName = ref.ref.replace('refs/heads/', '');
      const match = branchName.match(/-(\d+)$/);
      if (match) {
        maxAttempt = Math.max(maxAttempt, parseInt(match[1], 10));
      }
    }
    return maxAttempt + 1;
  } catch {
    return 1;
  }
}

export async function createBranch(
  octokit: Octokit,
  owner: string,
  repo: string,
  branchName: string,
  baseSha: string
): Promise<void> {
  await octokit.rest.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha: baseSha,
  });
  core.info(`Created branch: ${branchName}`);
}

export async function getBaseSha(
  octokit: Octokit,
  owner: string,
  repo: string,
  defaultBranch: string
): Promise<string> {
  const { data: ref } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${defaultBranch}`,
  });
  return ref.object.sha;
}

export async function checkoutBranch(branchName: string): Promise<void> {
  await exec.exec('git', ['fetch', 'origin', branchName]);
  await exec.exec('git', ['checkout', branchName]);
}

export async function configureGit(): Promise<void> {
  await exec.exec('git', ['config', 'user.name', 'cloud-code[bot]']);
  await exec.exec('git', ['config', 'user.email', 'cloud-code[bot]@users.noreply.github.com']);
}

export async function commitAndPush(message: string): Promise<void> {
  // Stage normal changes (respects .gitignore) — picks up agent edits
  await exec.exec('git', ['add', '.']);
  // Force-add .cloud-code/ which is in .gitignore
  await exec.exec('git', ['add', '-f', '.cloud-code/']);

  const hasChanges = await exec.exec('git', ['diff', '--cached', '--quiet'], {
    ignoreReturnCode: true,
  });
  if (hasChanges !== 0) {
    await exec.exec('git', ['commit', '-m', message]);
    await exec.exec('git', ['push', 'origin', 'HEAD']);
  }
}

export async function pushBranch(): Promise<void> {
  await exec.exec('git', ['push', 'origin', 'HEAD']);
}
