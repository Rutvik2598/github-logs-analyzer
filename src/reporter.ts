import * as core from '@actions/core'
import * as github from '@actions/github'
import type { Analysis } from './analyzer'
import type { WorkflowContext } from './github'

const COMMENT_MARKER = '<!-- github-logs-analyzer -->'

export async function postReport(
  token: string,
  context: WorkflowContext,
  analysis: Analysis,
  failedJobNames: string[]
): Promise<void> {
  await Promise.all([
    writeJobSummary(context, analysis, failedJobNames),
    context.prNumber ? postPrComment(token, context, analysis, failedJobNames) : Promise.resolve(),
  ])
}

async function writeJobSummary(
  context: WorkflowContext,
  analysis: Analysis,
  failedJobNames: string[]
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
    .addRaw(`<sub>[View full logs](${context.runUrl})</sub>`)
    .write()
}

async function postPrComment(
  token: string,
  context: WorkflowContext,
  analysis: Analysis,
  failedJobNames: string[]
): Promise<void> {
  const octokit = github.getOctokit(token)
  const body = formatComment(context, analysis, failedJobNames)

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
  failedJobNames: string[]
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

<sub>Analyzed by [GitHub Logs Analyzer](${context.runUrl}) • commit \`${context.sha.slice(0, 7)}\`</sub>`
}
