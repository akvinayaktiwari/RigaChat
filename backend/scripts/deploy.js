import { execSync } from 'node:child_process'

function run(command) {
  console.log(`$ ${command}`)
  execSync(command, { stdio: 'inherit' })
}

// Kept in step with LAMBDA_MEMORY_MB in scripts/deploy.sh. Set here too because
// this is the command CLAUDE.md tells people to run, so a deploy through this
// path must not leave a function on Lambda's 128 MB default -- which is where
// rigachat-api sat until 2026-08-26, clamped against its ceiling on every
// invocation (true working set: 185 MB).
const MEMORY_MB = Number(process.env.LAMBDA_MEMORY_MB || 256)

// Written only when it differs. An update-function-configuration call puts the
// function in Pending and costs another wait, and a repeat deploy should not
// pay for a no-op.
function ensureMemory(functionName) {
  const current = Number(
    execSync(
      `aws lambda get-function-configuration --function-name "${functionName}" --query MemorySize --output text`,
      { encoding: 'utf8' }
    ).trim()
  )

  if (current === MEMORY_MB) {
    console.log(`  ${functionName}: memory already ${MEMORY_MB} MB`)
    return
  }

  console.log(`  ${functionName}: memory ${current} MB -> ${MEMORY_MB} MB`)
  run(
    `aws lambda update-function-configuration --function-name "${functionName}" --memory-size ${MEMORY_MB}`
  )
  run(`aws lambda wait function-updated --function-name "${functionName}"`)
}

function main() {
  const mainFunctionName = process.env.LAMBDA_FUNCTION_NAME
  const streamingFunctionName = process.env.LAMBDA_STREAMING_FUNCTION_NAME

  if (!mainFunctionName || !streamingFunctionName) {
    throw new Error(
      'Missing required environment variables LAMBDA_FUNCTION_NAME and/or LAMBDA_STREAMING_FUNCTION_NAME.'
    )
  }

  console.log('Zipping build output...')
  run('cd dist && zip -r ../function.zip index.js')

  console.log(`Deploying to main Lambda (${mainFunctionName})...`)
  run(`aws lambda update-function-code --function-name "${mainFunctionName}" --zip-file fileb://function.zip`)

  console.log(`Deploying to streaming Lambda (${streamingFunctionName})...`)
  run(
    `aws lambda update-function-code --function-name "${streamingFunctionName}" --zip-file fileb://function.zip`
  )

  console.log('Waiting for main Lambda update to complete...')
  run(`aws lambda wait function-updated --function-name "${mainFunctionName}"`)

  console.log('Waiting for streaming Lambda update to complete...')
  run(`aws lambda wait function-updated --function-name "${streamingFunctionName}"`)

  // After both code updates, never between: Lambda rejects a configuration
  // change while a code update is still Pending, and the waits above are what
  // guarantee it is not.
  console.log('Enforcing Lambda memory sizes...')
  ensureMemory(mainFunctionName)
  ensureMemory(streamingFunctionName)

  console.log(`Deploy succeeded at ${new Date().toISOString()}`)
}

try {
  main()
} catch (error) {
  console.error('Deploy failed:', error instanceof Error ? error.message : error)
  process.exit(1)
}
