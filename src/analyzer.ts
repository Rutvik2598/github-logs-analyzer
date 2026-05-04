import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'
import OpenAI from 'openai'
import Groq from 'groq-sdk'
import type { FailedJob, WorkflowContext } from './github'

export type Provider = 'anthropic' | 'gemini' | 'openai' | 'groq'

export interface ProviderConfig {
  provider: Provider
  apiKey: string
}

export interface Analysis {
  summary: string
  rootCause: string
  failedSteps: string[]
  fixSuggestion: string
}

const SYSTEM_PROMPT = `You are an expert CI/CD engineer analyzing GitHub Actions failures.
Your job is to identify the root cause and provide concrete, actionable fixes.
Focus on the actual error — not generic advice.

Respond with a JSON object (no markdown fences) with exactly these fields:
- summary: one-line description of the failure (max 120 chars)
- rootCause: 2-3 sentences explaining why it failed
- failedSteps: array of the specific step names or commands that failed
- fixSuggestion: numbered list of concrete steps to fix the issue, specific to the actual error`

export async function analyzeFailure(
  config: ProviderConfig,
  context: WorkflowContext,
  failedJobs: FailedJob[]
): Promise<Analysis> {
  const userPrompt = buildUserPrompt(context, failedJobs)

  const handlers: Record<Provider, () => Promise<string>> = {
    anthropic: () => analyzeWithAnthropic(config.apiKey, userPrompt),
    gemini:    () => analyzeWithGemini(config.apiKey, userPrompt),
    openai:    () => analyzeWithOpenAI(config.apiKey, userPrompt),
    groq:      () => analyzeWithGroq(config.apiKey, userPrompt),
  }

  const text = await handlers[config.provider]()
  return parseAnalysis(text)
}

function buildUserPrompt(context: WorkflowContext, failedJobs: FailedJob[]): string {
  const logsSection = failedJobs
    .map(job => {
      const failedStepNames = job.steps
        .filter(s => s.conclusion === 'failure')
        .map(s => `  - Step ${s.number}: ${s.name}`)
        .join('\n')

      return `### Job: ${job.name}\nFailed steps:\n${failedStepNames || '  - unknown'}\n\nLogs:\n\`\`\`\n${job.logs}\n\`\`\``
    })
    .join('\n\n---\n\n')

  return `Analyze this GitHub Actions failure and return JSON only.

**Repository:** ${context.owner}/${context.repo}
**Workflow:** ${context.workflowName}
**Branch:** ${context.branch}
**Commit:** ${context.sha}

${logsSection}`
}

async function analyzeWithAnthropic(apiKey: string, userPrompt: string): Promise<string> {
  const client = new Anthropic({ apiKey })
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  })
  return message.content[0].type === 'text' ? message.content[0].text : ''
}

async function analyzeWithGemini(apiKey: string, userPrompt: string): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: SYSTEM_PROMPT,
  })
  const result = await model.generateContent(userPrompt)
  return result.response.text()
}

async function analyzeWithOpenAI(apiKey: string, userPrompt: string): Promise<string> {
  const client = new OpenAI({ apiKey })
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 1024,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  })
  return response.choices[0].message.content ?? ''
}

async function analyzeWithGroq(apiKey: string, userPrompt: string): Promise<string> {
  const client = new Groq({ apiKey })
  const response = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 1024,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  })
  return response.choices[0].message.content ?? ''
}

function parseAnalysis(text: string): Analysis {
  const fallback: Analysis = {
    summary: 'Workflow failure — check logs for details',
    rootCause: text || 'Could not determine root cause.',
    failedSteps: [],
    fixSuggestion: 'Review the full logs linked below.',
  }

  try {
    const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    const parsed = JSON.parse(cleaned)

    return {
      summary:      typeof parsed.summary === 'string'      ? parsed.summary      : fallback.summary,
      rootCause:    typeof parsed.rootCause === 'string'    ? parsed.rootCause    : fallback.rootCause,
      failedSteps:  Array.isArray(parsed.failedSteps)       ? parsed.failedSteps  : [],
      fixSuggestion: typeof parsed.fixSuggestion === 'string' ? parsed.fixSuggestion : fallback.fixSuggestion,
    }
  } catch {
    return fallback
  }
}
