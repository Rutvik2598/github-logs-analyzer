import * as core from '@actions/core'
import * as github from '@actions/github'
import type { Analysis } from './analyzer'
import type { WorkflowContext } from './github'
import type { Provider } from './analyzer'

const COMMENT_MARKER = '<!-- github-logs-analyzer -->'

const PROVIDER_LABEL: Record<Provider, string> = {
  anthropic: 'Claude (Anthropic)',
  gemini:    'Gemini (Google)',
  openai:    'GPT-4o mini (OpenAI)',
  groq:      'Llama 3.3 (Groq)',
}

export async function postReport(
  token: string,
  context: WorkflowContext,
  analysis: Analysis,
  failedJobNames: string[],
  provider: Provider
): Promise<void> {
  await Promise.all([
    writeJobSummary(context, analysis, failedJobNames, provider),
    context.prNumber
      ? postPrComment(token, context, analysis, failedJobNames, provider)
      : Promise.resolve(),
  ])
}

async function writeJobSummary(
  context: WorkflowContext,
  analysis: Analysis,
  failedJobNames: string[],
  provider: Provider
): Promise<void> {
  await core.summary
    .addHeading('CI Failure Analysis', 2)
    .addRaw(`> ${analysis.summary}\n\n`)
    .addRaw(`**Workflow:** [\`${context.workflowName}\`](${context.runUrl}) on \`${context.branch}\`\n\n`)
    .addHeading('Failed Jobs', 3)
    .addList(failedJobNames.map(j => `\`${j}\``))
    .addHeading('Root Cause', 3)
    .addRaw(`${analysis.rootCause}\n\n`)
    .addHeading('Failed Steps', 3)
    .addList(analysis.failedSteps.length > 0 ? analysis.failedSteps.map(s => `\`${s}\``) : ['See logs for details'])
    .addHeading('Suggested Fix', 3)
    .addRaw(`${analysis.fixSuggestion}\n\n`)
    .addRaw(`<sub>Analyzed by ${PROVIDER_LABEL[provider]} • [View full logs](${context.runUrl})</sub>`)
    .write()
}

async function postPrComment(
  token: string,
  context: WorkflowContext,
  analysis: Analysis,
  failedJobNames: string[],
  provider: Provider
): Promise<void> {
  const octokit = github.getOctokit(token)
  const body = formatComment(context, analysis, failedJobNames, provider)

  const { data: comments } = await octokit.rest.issues.listComments({
    owner: context.owner,
    repo: context.repo,
    issue_number: context.prNumber!,
  })

  const existing = comments.find(c => c.body?.includes(COMMENT_MARKER))

  if (existing) {
    await octokit.rest.issues.updateComment({
      owner: context.owner,
      repo: context.repo,
      comment_id: existing.id,
      body,
    })
  } else {
    await octokit.rest.issues.createComment({
      owner: context.owner,
      repo: context.repo,
      issue_number: context.prNumber!,
      body,
    })
  }
}

function formatComment(
  context: WorkflowContext,
  analysis: Analysis,
  failedJobNames: string[],
  provider: Provider
): string {
  const steps =
    analysis.failedSteps.length > 0
      ? analysis.failedSteps.map(s => `- \`${s}\``).join('\n')
      : '- See logs for details'

  return `${COMMENT_MARKER}
## CI Failure Analysis

> **${analysis.summary}**
> Workflow: [\`${context.workflowName}\`](${context.runUrl}) on \`${context.branch}\`

### Failed Jobs
${failedJobNames.map(j => `- \`${j}\``).join('\n')}

### Root Cause
${analysis.rootCause}

### Failed Steps
${steps}

### Suggested Fix
${analysis.fixSuggestion}

<sub>Analyzed by ${PROVIDER_LABEL[provider]} • commit \`${context.sha.slice(0, 7)}\` • [View full logs](${context.runUrl})</sub>`
}
