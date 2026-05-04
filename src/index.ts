import * as core from '@actions/core'
import { getWorkflowContext, getFailedJobs } from './github'
import { analyzeFailure, type Provider } from './analyzer'
import { postReport } from './reporter'

const API_KEY_INPUT: Record<Provider, string> = {
  anthropic: 'anthropic-api-key',
  gemini:    'gemini-api-key',
  openai:    'openai-api-key',
  groq:      'groq-api-key',
}

async function run(): Promise<void> {
  const provider = (core.getInput('provider') || 'anthropic') as Provider
  const githubToken = core.getInput('github-token', { required: true })
  const apiKey = core.getInput(API_KEY_INPUT[provider])

  if (!apiKey) {
    core.setFailed(`Missing API key for provider "${provider}". Set the "${API_KEY_INPUT[provider]}" input.`)
    return
  }

  const context = getWorkflowContext()
  core.info(`Analyzing run #${context.runId} for ${context.owner}/${context.repo} using ${provider}`)

  const failedJobs = await getFailedJobs(githubToken, context.owner, context.repo, context.runId)

  if (failedJobs.length === 0) {
    core.info('No failed jobs found — nothing to analyze')
    return
  }

  core.info(`Failed jobs: ${failedJobs.map(j => j.name).join(', ')}`)

  const analysis = await analyzeFailure({ provider, apiKey }, context, failedJobs)

  core.setOutput('summary', analysis.summary)
  core.setOutput('root-cause', analysis.rootCause)
  core.info(`Analysis complete: ${analysis.summary}`)

  await postReport(githubToken, context, analysis, failedJobs.map(j => j.name))
  core.info('Report posted')
}

run().catch(core.setFailed)
