import * as github from '@actions/github';

export type Octokit = ReturnType<typeof github.getOctokit>;

export function getOctokit(): Octokit {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN environment variable is required');
  }
  return github.getOctokit(token);
}

export async function getDefaultBranch(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<string> {
  const { data } = await octokit.rest.repos.get({ owner, repo });
  return data.default_branch;
}

export async function hasWriteAccess(
  octokit: Octokit,
  owner: string,
  repo: string,
  username: string
): Promise<boolean> {
  try {
    const { data } = await octokit.rest.repos.getCollaboratorPermissionLevel({
      owner,
      repo,
      username,
    });
    return ['admin', 'write'].includes(data.permission);
  } catch {
    return false;
  }
}
