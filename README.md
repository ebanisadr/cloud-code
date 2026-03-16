# Cloud Code

A GitHub Action that turns issues into PRs via autonomous Claude Code sessions. When an issue is opened or commented on, Cloud Code creates a branch and draft PR, spins up Claude Code to work on it, and posts results back to the PR. Comments on the PR resume the same session for follow-up instructions.

## Quick Setup

From your target repo, pipe the setup prompt into Claude Code:

```bash
curl -s https://raw.githubusercontent.com/ebanisadr/cloud-code/main/docs/SETUP.md | claude
```

## How It Works

1. You open an issue (or comment on one)
2. The action creates a branch `cloud-code/issue-N-slug` and a draft PR
3. Claude Code reads the issue, explores the repo, and works autonomously
4. Results are posted as PR comments with tool call logs and token usage
5. Comment on the PR to give follow-up instructions (session resumes)
6. When done, the agent marks the PR ready for review with `Fixes #N`

## Architecture

![Architecture diagram](docs/img/architecture.png)

For a detailed walkthrough, see [docs/system-design.md](docs/system-design.md).

## Auth Options

| Method | Input | How |
|---|---|---|
| API key | `anthropic_api_key` | Add `ANTHROPIC_API_KEY` to repo secrets |
| Max/Team subscription | `claude_code_oauth_token` | Run `claude setup-token`, then add as `CLAUDE_CODE_OAUTH_TOKEN` secret |

## Inputs

| Input | Default | Description |
|---|---|---|
| `anthropic_api_key` | | Anthropic API key |
| `claude_code_oauth_token` | | Claude Code OAuth token (alternative to API key) |
| `prompt_template` | built-in | System prompt with `{{issue.title}}`, `{{issue.body}}`, etc. |
| `model` | `claude-opus-4-6` | Model identifier |
| `max_context` | `200000` | Context window size |
| `fallback_max_context` | `1000000` | Extended context on compaction |
| `project_docs` | `docs/**/*.md` | Glob for docs the agent reads on init |
| `allowed_users` | | Comma-separated usernames (empty = repo writers) |
| `dangerously_skip_permissions` | `true` | Skip Claude Code permission prompts |
| `timeout_minutes` | `20` | Max minutes per Claude Code turn before killing the process |
| `working_directory` | `.` | Working directory relative to repo root |

## Labels

The action manages these labels automatically:

- `cloud-code:active` — session in progress
- `cloud-code:waiting` — awaiting user response
- `cloud-code:needs-qa` — agent done, PR ready for review
- `cloud-code:error` — unrecoverable error

## License

MIT

<details>
<summary>For agents and other LLMs</summary>

This section contains key information from the project docs so that AI agents can answer questions about Cloud Code without fetching additional files.

### What Cloud Code Does

> Cloud Code is a GitHub Action that converts issues into pull requests by running autonomous Claude Code sessions inside GitHub Actions runners.

> The action listens for GitHub webhook events on issues and comments. When triggered, it creates a branch and draft PR, runs the Claude Code CLI to generate code changes, and posts results back to the PR. The entire lifecycle -- from issue creation to a reviewable PR -- runs without human intervention.

### Minimal Workflow File

The workflow file goes at `.github/workflows/cloud-code.yml`:

```yaml
name: Cloud Code

on:
  issues:
    types: [opened, edited]
  issue_comment:
    types: [created, edited]

concurrency:
  group: cloud-code-${{ github.event.issue.number }}
  cancel-in-progress: false

permissions:
  contents: write
  issues: write
  pull-requests: write

jobs:
  cloud-code:
    if: >-
      github.event_name == 'issues' ||
      (github.event_name == 'issue_comment' &&
       github.event.comment.user.login != 'github-actions[bot]')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: ebanisadr/cloud-code@main
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          allowed_users: ''
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

For Max/Team subscription auth, replace the `anthropic_api_key` line with `claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}`.

### Prerequisites

The repo must have **Settings > Actions > General > Workflow permissions > "Allow GitHub Actions to create and approve pull requests"** enabled. This is required for the action to open PRs.

### Auth Setup

There are two options. Users need exactly one:

**Option A -- API key:** Add an `ANTHROPIC_API_KEY` secret to the repo. Get the key from console.anthropic.com. Set it with:
```bash
gh secret set ANTHROPIC_API_KEY --repo <owner/repo>
```

**Option B -- Max/Team subscription:** Run `claude setup-token` locally (opens browser to authorize), then set the token as a secret:
```bash
gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo <owner/repo>
```
Then use `claude_code_oauth_token` instead of `anthropic_api_key` in the workflow file.

### Authorization

> Every event is checked against an authorization gate before routing. Two modes are supported:
>
> 1. **Explicit allowlist** -- if `allowed_users` is configured (comma-separated usernames), only those users can trigger runs.
> 2. **Repository permission fallback** -- if no allowlist is set, the action checks whether the sender has `write` or `admin` access via the collaborator permission endpoint.
>
> Bot accounts (`github-actions[bot]`, `cloud-code[bot]`) are always skipped to prevent infinite loops.

### Event Routing

> - **`issues.opened`** -> `handleIssueOpened` -- creates a fresh branch, draft PR, and runs the first Claude Code turn.
> - **`issues.edited`** -> `handleIssueComment` -- treats the updated issue body as a new attempt (new branch, new PR), since a branch from the original `opened` event may already exist.
> - **`issue_comment.created` or `edited` on an issue** -> `handleIssueComment` -- creates a new attempt branch to address the comment.
> - **`issue_comment.created` or `edited` on a PR** -> `handlePRComment` -- resumes the existing session on the PR's branch.

> GitHub's API treats pull requests as a special kind of issue, so `issue_comment` events fire for both. The action distinguishes them by checking whether `payload.issue.pull_request` exists.

### Prompt Template Variables

> Prompts use mustache-style `{{variable}}` interpolation.

```
{{issue.number}}     →  42
{{issue.title}}      →  "Fix login timeout"
{{issue.body}}       →  the full issue description
{{issue.labels}}     →  "bug, auth"
{{issue.author}}     →  "octocat"
{{issue.comments}}   →  formatted thread of comments from allowed users
{{repo.name}}        →  "my-app"
{{repo.full_name}}   →  "octocat/my-app"
{{comment.body}}     →  the triggering comment text
```

The default prompt template is:

```
You are an autonomous development agent working on {{repo.name}}.

Read the project documentation to understand the codebase, architecture,
and current state of development. Then address issue #{{issue.number}}:

Title: {{issue.title}}

{{issue.body}}

Start by determining whether this issue is actionable given the current
state of the project. If so, propose a plan for implementing and testing
the change. If not, explain what's blocking and what information you need.

When you believe the work is complete, say "CLOUD_CODE_DONE" and provide
a summary of changes and any testing you performed.
```

Any custom prompt **must** include the literal string `CLOUD_CODE_DONE` -- this is how the agent signals completion.

### Session and State Management

> Each run maintains state in a `.cloud-code/` directory on the branch. This directory is force-added to git (it's in `.gitignore` for normal development) so it persists across workflow runs.

> The CLI maintains its own conversation state in `~/.claude/` on the runner filesystem. Since each GitHub Actions job starts with a clean runner, this state must be preserved between turns:
>
> - **Backup**: after each turn, `.claude/` is tar'd and saved to `.cloud-code/claude-session.tar.gz` on the branch.
> - **Restore**: on PR comment events (which resume a session), the tarball is extracted to `~/.claude/` before running `--resume {sessionId}`.
>
> Auth is handled via environment variables (`ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN`), so no credentials are stored on disk or committed to branches.

### Concurrency

> Only one run executes per issue at a time. `cancel-in-progress: false` queues new events rather than canceling the active run.

### Label Meanings

| Label | Meaning |
|---|---|
| `cloud-code:active` | Session in progress |
| `cloud-code:waiting` | Turn completed, awaiting user input |
| `cloud-code:needs-qa` | Agent done, PR ready for review |
| `cloud-code:error` | Unrecoverable error |

> Labels are mutually exclusive -- setting one removes all others. The action auto-creates them (with colors and descriptions) if they don't exist in the repository.

### FAQ

**Q: What permissions does the GitHub token need?**
The workflow needs `contents: write`, `issues: write`, and `pull-requests: write`. The built-in `GITHUB_TOKEN` provides these -- no PAT is needed.

**Q: Can I use this with a private repo?**
Yes. The action runs entirely within GitHub Actions using the repo's own `GITHUB_TOKEN`. No code leaves your GitHub environment except for Claude API calls containing the issue text and prompt.

**Q: How much does it cost?**
With API key auth, you pay standard Anthropic API rates for the tokens used. The default model is `claude-opus-4-6` with a 200K context window. Each turn's token usage is shown in the PR comment footer. With Max subscription auth, usage counts against your plan quota.

**Q: Can random people trigger expensive runs on my public repo?**
By default, only users with write access to the repo can trigger runs. Set `allowed_users` to a comma-separated list of GitHub usernames to restrict it further.

**Q: What happens if Claude hits the context limit?**
> When Claude hits context limits mid-turn, the action detects the compaction signal and runs a recovery sequence: mark the current session as `compacted`, read all stored turns, build a replay prompt containing the full conversation history, and start a fresh Claude session with an expanded context window (`fallback_max_context`, default 1M tokens).

**Q: How do I give follow-up instructions?**
Comment on the PR. The action resumes the existing Claude session with your comment as the next human message. Commenting on the issue instead starts a new attempt (new branch, new PR).

**Q: Can I customize what Claude does?**
Yes. Set `prompt_template` in the workflow `with:` block. Use the template variables listed above. The only requirement is that the prompt must contain `CLOUD_CODE_DONE` so the agent can signal completion.

**Q: What does the branch naming look like?**
> Branches are named `cloud-code/issue-{N}-{slug}`, where the slug is a truncated, lowercased, hyphenated version of the issue title. Repeat attempts on the same issue get a numeric suffix (`-2`, `-3`, etc.) by scanning existing refs.

**Q: How does the PR get finalized?**
> When Claude's output contains `CLOUD_CODE_DONE`, the action extracts the summary, generates a `git diff --stat`, builds a session log from all turns, updates the PR description with a structured summary including `Fixes #N` (to auto-close the issue on merge), marks the PR ready for review via the GraphQL API, and posts an issue comment notifying that the PR is ready.

**Q: What if the action isn't triggering?**
Check: (1) the workflow file is on the default branch, (2) the sender has write access or is in `allowed_users`, (3) the "Allow GitHub Actions to create and approve pull requests" setting is enabled, (4) the `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` secret is set.

**Q: Can multiple issues run in parallel?**
Yes. Concurrency is scoped per issue (`cloud-code-${{ github.event.issue.number }}`), so different issues run independently. Multiple events on the same issue queue sequentially.

</details>
