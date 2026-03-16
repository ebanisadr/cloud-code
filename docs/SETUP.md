You are helping the user set up Cloud Code — a GitHub Action that turns issues into PRs via autonomous Claude Code sessions. When someone opens or comments on an issue, the action creates a branch and draft PR, spins up Claude Code to work on it, and posts results back to the PR.

Your job is to configure this for the user's current repository. Follow these steps in order.

---

## Step 1: Verify prerequisites

Check that we're in a git repository with a GitHub remote:

```bash
git remote get-url origin
```

Confirm the repo name with the user before proceeding.

Then tell the user they need to enable PR creation for GitHub Actions:

> Go to your repo's **Settings > Actions > General**, scroll to **Workflow permissions**, and check **"Allow GitHub Actions to create and approve pull requests"**. This is required for Cloud Code to open PRs on your behalf.

## Step 2: Create the workflow file

Create `.github/workflows/cloud-code.yml` with this content:

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

Make sure to create the `.github/workflows/` directory if it doesn't exist.

## Step 3: Set the auth secret

The user needs to add ONE of these secrets to their GitHub repo. Ask which they prefer:

### Option A: Anthropic API key (pay-per-use)

Ask the user for their API key (from console.anthropic.com), then offer to set it directly via the `gh` CLI:

```bash
gh secret set ANTHROPIC_API_KEY --repo <owner/repo>
```

(This will prompt for the value interactively.) The workflow file from Step 2 is already configured for this option.

### Option B: Claude Max/Team subscription (uses plan quota)

If the user wants to use their subscription instead:

1. Run `claude setup-token` locally — this opens a browser to authorize and prints a long-lived OAuth token.

2. Set the token as a secret:
   ```bash
   gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo <owner/repo>
   ```
   (This will prompt for the value interactively — paste the token from step 1.)

3. Then update the workflow file — replace the `anthropic_api_key` line with `claude_code_oauth_token`:

```yaml
      - uses: ebanisadr/cloud-code@main
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          allowed_users: ''
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Step 4: Configure allowed users

Ask the user for their GitHub username (and any other usernames they want to allow). Update the `allowed_users` field in the workflow file with a comma-separated list. By default (empty string), anyone with write access to the repo can trigger it — explain this and ask if they'd like to restrict it.

This step **must** be completed before committing the workflow file in Step 7.

## Step 5: Optional — custom prompt template

Show the user the default prompt that will be used if they don't customize it:

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

Then list the available interpolation variables:

| Variable | Description |
|---|---|
| `{{issue.number}}` | Issue number |
| `{{issue.title}}` | Issue title |
| `{{issue.body}}` | Full issue body/description |
| `{{issue.labels}}` | Comma-separated issue labels |
| `{{issue.author}}` | GitHub username of the issue author |
| `{{repo.name}}` | Repository name (e.g. `cloud-code`) |
| `{{repo.full_name}}` | Full repository name (e.g. `ebanisadr/cloud-code`) |
| `{{comment.body}}` | Comment body (for follow-up instructions) |

Ask if the user wants to customize the prompt. If so, help them write one. Any custom prompt **must** include the string `CLOUD_CODE_DONE` somewhere — this is how the agent signals completion.

If they provide a custom prompt, add it to the workflow file:

```yaml
      - uses: ebanisadr/cloud-code@main
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt_template: |
            <their custom prompt here>
```

## Step 6: Optional — other settings

Other inputs that can be added to the `with:` block:

| Input | Default | What it does |
|---|---|---|
| `model` | `claude-opus-4-6` | Which Claude model to use |
| `max_context` | `200000` | Context window size (tokens) |
| `fallback_max_context` | `1000000` | Extended context window used on compaction |
| `project_docs` | `docs/**/*.md` | Glob pattern for docs the agent reads at startup |
| `working_directory` | `.` | Subdirectory to run Claude Code in |
| `dangerously_skip_permissions` | `true` | Skip Claude Code permission prompts (needed for CI) |

## Step 7: Commit

Commit the workflow file:

```bash
git add .github/workflows/cloud-code.yml
git commit -m "Add Cloud Code workflow"
```

Do **not** push. Let the user push when they're ready.

## Step 8: Test it

Tell the user to open an issue in their repo. They should see:

1. A `cloud-code:active` label added to the issue
2. A new branch `cloud-code/issue-N-...` created
3. A draft PR opened
4. Claude Code working on the issue
5. A comment posted on the PR with the results

If something goes wrong, a `cloud-code:error` label will be added with an error message comment.

---

## How the action works (reference)

**Triggers:** issue opened, issue commented, PR commented (on cloud-code branches)

**Flow:**
- Issue opened → creates branch + draft PR → runs Claude Code → posts results to PR
- Issue comment → creates a new branch/attempt → same flow
- PR comment (on a cloud-code PR) → resumes the existing session with the comment as a follow-up instruction

**Session state** is stored in `.cloud-code/` on the branch (session.json, prompt.md, turn logs). The Claude session itself is backed up/restored between turns so conversations persist across workflow runs.

**Completion:** The agent says `CLOUD_CODE_DONE` → the PR is marked ready for review with a `Fixes #N` link that auto-closes the issue on merge.

**Labels managed automatically:**
- `cloud-code:active` — session in progress
- `cloud-code:waiting` — waiting for user input
- `cloud-code:needs-qa` — done, PR ready for review
- `cloud-code:error` — something went wrong
