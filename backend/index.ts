import { serve } from '@hono/node-server'
import { handle, streamHandle } from 'hono/aws-lambda'
import { app } from './src/routes/index.js'

// Lambda Function URL only supports one invocation mode (BUFFERED or RESPONSE_STREAM)
// per function, so this same bundle is deployed to two separate Lambda functions:
//   - Main function      -> handler entry point: index.handler
//     BUFFERED invocation mode. Handles every route except /api/chat/message.
//   - Streaming function -> handler entry point: index.streamingHandler
//     RESPONSE_STREAM invocation mode. Handles only /api/chat/message, which
//     streams the chat completion back to the widget word-by-word.
//
// The real Lambda RESPONSE_STREAM runtime injects awslambda.streamifyResponse,
// which streamHandle() calls immediately. Calling it where that's absent would
// throw. Note the AWS SDK itself sets globalThis.awslambda = {} for its own
// unrelated request-tracing purposes (as a side effect of importing
// @aws-sdk/client-dynamodb), so checking for the global's mere existence is
// not enough — this checks specifically for the streaming method the real
// runtime provides, which is absent in local dev and in the main (buffered)
// Lambda when it loads this same bundle.

interface LambdaStreamingGlobal {
  awslambda?: { streamifyResponse?: unknown }
}

export const handler = handle(app)

const hasStreamingRuntime =
  typeof (globalThis as LambdaStreamingGlobal).awslambda?.streamifyResponse === 'function'

export const streamingHandler = hasStreamingRuntime ? streamHandle(app) : undefined

if (process.env.NODE_ENV !== 'production') {
  const port = Number(process.env.PORT) || 3000

  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Server is running on http://localhost:${info.port}`)
  })
}
