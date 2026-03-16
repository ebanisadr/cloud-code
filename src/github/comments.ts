import { Octokit, hasWriteAccess } from './api';

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

export async function fetchFilteredIssueComments(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  allowedUsers: string[]
): Promise<string> {
  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  });

  // Determine which users are allowed — cache write-access lookups
  const userAllowedCache = new Map<string, boolean>();

  async function isAllowed(username: string): Promise<boolean> {
    if (userAllowedCache.has(username)) {
      return userAllowedCache.get(username)!;
    }
    let allowed: boolean;
    if (allowedUsers.length > 0) {
      allowed = allowedUsers.includes(username);
    } else {
      allowed = await hasWriteAccess(octokit, owner, repo, username);
    }
    userAllowedCache.set(username, allowed);
    return allowed;
  }

  const lines: string[] = [];

  for (const comment of comments) {
    const login = comment.user?.login;
    if (!login) continue;
    // Skip bot comments
    if (login === 'github-actions[bot]' || login === 'cloud-code[bot]') continue;
    if (!(await isAllowed(login))) continue;

    const time = comment.created_at;
    lines.push(`${login}: ${time}\n${comment.body}`);
  }

  return lines.join('\n\n');
}
