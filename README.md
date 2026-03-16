# Cloud Code

A GitHub Action that turns issues into PRs via autonomous Claude Code sessions. When an issue is opened or commented on, Cloud Code creates a branch and draft PR, spins up Claude Code to work on it, and posts results back to the PR. Comments on the PR resume the same session for follow-up instructions.

## Quick Setup

From your target repo, pipe the setup prompt into Claude Code:

```bash
curl -s https://raw.githubusercontent.com/ebanisadr/cloud-code/main/SETUP.md | claude
```

## How It Works

1. You open an issue (or comment on one)
2. The action creates a branch `cloud-code/issue-N-slug` and a draft PR
3. Claude Code reads the issue, explores the repo, and works autonomously
4. Results are posted as PR comments with tool call logs and token usage
5. Comment on the PR to give follow-up instructions (session resumes)
6. When done, the agent marks the PR ready for review with `Fixes #N`

## Auth Options

| Method | Input | How |
|---|---|---|
| API key | `anthropic_api_key` | Add `ANTHROPIC_API_KEY` to repo secrets |
| Max subscription | `claude_credentials` | `tar czf - -C ~ .claude/.credentials.json .claude/statsig/ .claude/config.json 2>/dev/null \| base64` then add as `CLAUDE_CREDENTIALS` secret |

## Inputs

| Input | Default | Description |
|---|---|---|
| `anthropic_api_key` | | Anthropic API key |
| `claude_credentials` | | Base64-encoded Claude auth (alternative to API key) |
| `prompt_template` | built-in | System prompt with `{{issue.title}}`, `{{issue.body}}`, etc. |
| `model` | `claude-opus-4-6` | Model identifier |
| `max_context` | `200000` | Context window size |
| `fallback_max_context` | `1000000` | Extended context on compaction |
| `project_docs` | `docs/**/*.md` | Glob for docs the agent reads on init |
| `allowed_users` | | Comma-separated usernames (empty = repo writers) |
| `dangerously_skip_permissions` | `true` | Skip Claude Code permission prompts |
| `working_directory` | `.` | Working directory relative to repo root |

## Labels

The action manages these labels automatically:

- `cloud-code:active` — session in progress
- `cloud-code:waiting` — awaiting user response
- `cloud-code:needs-qa` — agent done, PR ready for review
- `cloud-code:error` — unrecoverable error

## License

MIT
