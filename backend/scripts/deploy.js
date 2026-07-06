import { execSync } from 'node:child_process'

function run(command) {
  console.log(`$ ${command}`)
  execSync(command, { stdio: 'inherit' })
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

  console.log(`Deploy succeeded at ${new Date().toISOString()}`)
}

try {
  main()
} catch (error) {
  console.error('Deploy failed:', error instanceof Error ? error.message : error)
  process.exit(1)
}
