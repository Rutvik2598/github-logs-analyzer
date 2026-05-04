import * as github from '@actions/github'

export interface FailedJob {
  id: number
  name: string
  steps: Array<{ name: string; conclusion: string | null; number: number }>
  logs: string
}

export interface WorkflowContext {
  owner: string
  repo: string
  runId: number
  runUrl: string
  workflowName: string
  branch: string
  sha: string
  prNumber: number | null
}

export function getWorkflowContext(): WorkflowContext {
  const ctx = github.context
  const prNumber =
    (ctx.payload.pull_request?.number as number | undefined) ??
    (ctx.payload.workflow_run?.pull_requests?.[0]?.number as number | undefined) ??
    null

  return {
    owner: ctx.repo.owner,
    repo: ctx.repo.repo,
    runId: ctx.runId,
    runUrl: `https://github.com/${ctx.repo.owner}/${ctx.repo.repo}/actions/runs/${ctx.runId}`,
    workflowName: ctx.workflow,
    branch: ctx.ref.replace('refs/heads/', ''),
    sha: ctx.sha,
    prNumber,
  }
}

export async function getFailedJobs(
  token: string,
  owner: string,
  repo: string,
  runId: number
): Promise<FailedJob[]> {
  const octokit = github.getOctokit(token)

  const { data } = await octokit.rest.actions.listJobsForWorkflowRun({
    owner,
    repo,
    run_id: runId,
  })

  const failedJobs = data.jobs.filter(j => j.conclusion === 'failure')

  return Promise.all(
    failedJobs.map(async job => ({
      id: job.id,
      name: job.name,
      steps: (job.steps ?? []).map(s => ({
        name: s.name,
        conclusion: s.conclusion ?? null,
        number: s.number,
      })),
      logs: await fetchJobLogs(token, owner, repo, job.id),
    }))
  )
}

async function fetchJobLogs(
  token: string,
  owner: string,
  repo: string,
  jobId: number
): Promise<string> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/jobs/${jobId}/logs`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
      redirect: 'follow',
    }
  )

  if (!response.ok) return '[Failed to fetch logs]'

  const text = await response.text()
  // Keep last 50k chars if logs are too large to fit in context
  return text.length > 50_000 ? `...[truncated]\n${text.slice(-50_000)}` : text
}
