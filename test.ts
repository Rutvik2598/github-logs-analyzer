import { analyzeFailure } from './src/analyzer'

const mockContext = {
  owner: 'test-org',
  repo: 'test-repo',
  runId: 123,
  runUrl: 'https://github.com/test-org/test-repo/actions/runs/123',
  workflowName: 'CI',
  branch: 'main',
  sha: 'abc1234',
  prNumber: 42,
}

const mockFailedJobs = [
  {
    id: 1,
    name: 'build',
    steps: [
      { name: 'Install dependencies', conclusion: 'success', number: 1 },
      { name: 'Run tests', conclusion: 'failure', number: 2 },
    ],
    logs: `
2024-01-01T00:00:01Z [command] npm test
2024-01-01T00:00:02Z > jest
2024-01-01T00:00:05Z FAIL src/utils.test.ts
2024-01-01T00:00:05Z   ● calculateTotal › should return correct sum
2024-01-01T00:00:05Z     Expected: 100
2024-01-01T00:00:05Z     Received: undefined
2024-01-01T00:00:05Z     TypeError: Cannot read properties of undefined (reading 'total')
2024-01-01T00:00:05Z       at calculateTotal (src/utils.ts:12:18)
2024-01-01T00:00:05Z Tests: 1 failed, 5 passed
2024-01-01T00:00:05Z ##[error]Process completed with exit code 1.
    `,
  },
]

const provider = (process.argv[2] as any) || 'gemini'
const apiKey = process.env.API_KEY

if (!apiKey) {
  console.error('Set API_KEY env var before running')
  process.exit(1)
}

console.log(`Testing with provider: ${provider}\n`)

analyzeFailure({ provider, apiKey }, mockContext, mockFailedJobs)
  .then(result => {
    console.log(JSON.stringify(result, null, 2))
  })
  .catch(err => {
    console.error('Error:', err.message)
    process.exit(1)
  })
