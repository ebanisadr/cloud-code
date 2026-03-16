You are helping the user set up Cloud Code — a GitHub Action that turns issues into PRs via autonomous Claude Code sessions. When someone opens or comments on an issue, the action creates a branch and draft PR, spins up Claude Code to work on it, and posts results back to the PR.

Your job is to configure this for the user's current repository. Follow these steps in order.

---

## Step 1: Verify prerequisites

Check that we're in a git repository with a GitHub remote:

```bash
git remote get-url origin
```

Confirm the repo name with the user before proceeding.

## Step 2: Create the workflow file

Create `.github/workflows/cloud-code.yml` with this content:

```yaml
name: Cloud Code

on:
  issues:
    types: [opened]
  issue_comment:
    types: [created]

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

      - uses: ebanisadr/cloud-code@v1
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

Tell the user:

> Go to **Settings > Secrets and variables > Actions** in your GitHub repo and add a secret named `ANTHROPIC_API_KEY` with your API key from console.anthropic.com.

The workflow file above is already configured for this option.

### Option B: Claude Max subscription (uses plan quota)

If the user wants to use their Max subscription instead, they need to:

1. Generate the credentials locally:
   ```bash
   tar czf - -C ~ .claude/.credentials.json .claude/statsig/ .claude/config.json 2>/dev/null | base64
   ```

2. Add the output as a secret named `CLAUDE_CREDENTIALS` in **Settings > Secrets and variables > Actions**.

3. Then update the workflow file — comment out the `anthropic_api_key` line and uncomment `claude_credentials`:

```yaml
      - uses: ebanisadr/cloud-code@v1
        with:
          # claude_credentials instead of anthropic_api_key:
          claude_credentials: ${{ secrets.CLAUDE_CREDENTIALS }}
          allowed_users: ''
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Step 4: Optional — customize allowed users

If the user wants to restrict who can trigger Cloud Code, update the `allowed_users` field with a comma-separated list of GitHub usernames. By default (empty string), anyone with write access to the repo can trigger it.

## Step 5: Optional — custom prompt template

The action accepts a `prompt_template` input with `{{mustache}}` interpolation. Available variables:

- `{{issue.number}}`, `{{issue.title}}`, `{{issue.body}}`, `{{issue.labels}}`, `{{issue.author}}`
- `{{repo.name}}`, `{{repo.full_name}}`
- `{{comment.body}}`

Example:

```yaml
      - uses: ebanisadr/cloud-code@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt_template: |
            You are a senior engineer working on {{repo.name}}.
            Address issue #{{issue.number}}: {{issue.title}}

            {{issue.body}}

            Follow our style guide in docs/STYLE.md.
            When done, say "CLOUD_CODE_DONE" with a summary.
```

If a custom prompt is used, it **must** include the string `CLOUD_CODE_DONE` somewhere in the instructions — this is how the agent signals completion.

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

## Step 7: Commit and push

Commit the workflow file and push to the default branch:

```bash
git add .github/workflows/cloud-code.yml
git commit -m "Add Cloud Code workflow"
git push
```

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
