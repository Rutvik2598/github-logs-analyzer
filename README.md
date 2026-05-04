# GitHub Logs Analyzer

AI-powered GitHub Actions failure analyzer. When your CI fails, it automatically reads the logs, identifies the root cause, and posts a detailed fix suggestion as a PR comment.

## What it does

- Triggers automatically when a job in your workflow fails
- Fetches the raw logs of every failed job via the GitHub API
- Sends them to your chosen AI provider for structured analysis
- Posts a **PR comment** with root cause, failed steps, and a concrete fix
- Also writes to the **GitHub Actions job summary** (visible even without a PR)

**Example PR comment:**

> **Root Cause:** The `npm ci` step failed because `package-lock.json` is out of sync with `package.json`. A dependency was likely added manually without running `npm install`.
>
> **Suggested Fix:**
> 1. Run `npm install` locally
> 2. Commit the updated `package-lock.json`
> 3. Push and re-run the workflow

---

## Setup

### Step 1 — Get an API key

Pick one provider and get an API key from their platform:

| Provider | Model used | Get a key |
|---|---|---|
| **Anthropic** | `claude-sonnet-4-6` | [console.anthropic.com](https://console.anthropic.com) |
| **Google Gemini** | `gemini-2.5-flash` | [aistudio.google.com](https://aistudio.google.com) |
| **OpenAI** | `gpt-4o-mini` | [platform.openai.com](https://platform.openai.com) |
| **Groq** | `llama-3.3-70b-versatile` | [console.groq.com](https://console.groq.com) |

### Step 2 — Add the key as a repo secret

1. Go to your repo → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Add the secret for your chosen provider:

| Provider | Secret name |
|---|---|
| Anthropic | `ANTHROPIC_API_KEY` |
| Gemini | `GEMINI_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| Groq | `GROQ_API_KEY` |

### Step 3 — Add the analyzer to your workflow

```yaml
name: CI

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test

  analyze-failure:
    runs-on: ubuntu-latest
    needs: [build]
    if: failure()
    permissions:
      actions: read
      pull-requests: write
    steps:
      - uses: Rutvik2598/github-logs-analyzer@v1.0.0
        with:
          provider: gemini                                    # or anthropic, openai, groq
          gemini-api-key: ${{ secrets.GEMINI_API_KEY }}      # match the secret to your provider
```

The `github-token` is set automatically — no extra setup needed.

---

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `provider` | No | `anthropic` | AI provider: `anthropic`, `gemini`, `openai`, or `groq` |
| `anthropic-api-key` | If using Anthropic | — | Your Anthropic API key |
| `gemini-api-key` | If using Gemini | — | Your Google Gemini API key |
| `openai-api-key` | If using OpenAI | — | Your OpenAI API key |
| `groq-api-key` | If using Groq | — | Your Groq API key |
| `github-token` | No | `${{ github.token }}` | GitHub token for reading logs and posting comments |

## Outputs

| Output | Description |
|---|---|
| `summary` | One-line summary of the failure |
| `root-cause` | Root cause explanation from the AI |

---

## Permissions

The action needs these permissions on the job:

```yaml
permissions:
  actions: read         # read workflow run logs
  pull-requests: write  # post the analysis as a PR comment
```

---

## Development

```bash
npm install         # install dependencies
npm run typecheck   # type check without building
npm run build       # compile + bundle to dist/index.js
```

After making changes to `src/`, always run `npm run build` and commit the updated `dist/index.js` — GitHub executes the bundled file directly.
