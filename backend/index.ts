import { serve } from '@hono/node-server'
import { handle, streamHandle } from 'hono/aws-lambda'
import type { LambdaEvent } from 'hono/aws-lambda'
import { app } from './src/routes/index.js'
import { sendWeeklyReportsForAllClients } from './src/services/whatsapp-service.js'
import { processCrawlerJob } from './src/services/crawler-worker-service.js'
import { handler as voiceWsHandler } from './src/handlers/voice-ws-handler.js'
import type { CrawlerJobMessage } from './src/lib/sqs.js'

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

// EventBridge Scheduler invokes this Lambda directly (no Function URL event
// shape) with `source: 'aws.events'` and a custom detail-type identifying the
// job. Function URL invocations never carry that shape, so branching on it
// here lets one Lambda serve both the HTTP app and the weekly-report cron
// without a new function or new deploy pipeline entry.
interface ScheduledEvent {
  source?: string
  'detail-type'?: string
}

// The crawler worker Lambda (rigachat-crawler) shares this same bundle and
// entry point, triggered by the SQS event source mapping instead of a
// Function URL. batch-size is 1, so a single record is expected per invoke.
interface SQSTriggerEvent {
  Records?: Array<{ eventSource?: string; body: string }>
}

const bufferedHandler = handle(app)

export const handler = async (
  event: LambdaEvent | ScheduledEvent | SQSTriggerEvent,
  lambdaContext?: Parameters<typeof bufferedHandler>[1]
) => {
  if ('Records' in event && event.Records?.[0]?.eventSource === 'aws:sqs') {
    const job = JSON.parse(event.Records[0].body) as CrawlerJobMessage
    await processCrawlerJob(job)
    return { statusCode: 200 }
  }

  if ('source' in event && event.source === 'aws.events' && event['detail-type'] === 'whatsapp-weekly-report') {
    await sendWeeklyReportsForAllClients()
    return
  }

  return bufferedHandler(event as LambdaEvent, lambdaContext)
}

const hasStreamingRuntime =
  typeof (globalThis as LambdaStreamingGlobal).awslambda?.streamifyResponse === 'function'

export const streamingHandler = hasStreamingRuntime ? streamHandle(app) : undefined

export { voiceWsHandler }

if (process.env.NODE_ENV !== 'production') {
  const port = Number(process.env.PORT) || 3000

  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Server is running on http://localhost:${info.port}`)
  })
}
