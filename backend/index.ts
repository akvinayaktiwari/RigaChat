import { serve } from '@hono/node-server'
import { handle, streamHandle } from 'hono/aws-lambda'
import type { LambdaEvent } from 'hono/aws-lambda'
import { app } from './src/routes/index.js'
import { sendWeeklyReportsForAllClients } from './src/services/weekly-report-service.js'
import { executeScheduledAction } from './src/services/scheduler-service.js'
import { executeJourneyStep } from './src/services/journey-executor-service.js'
import { processCrawlerJob } from './src/services/crawler-worker-service.js'
import type { CrawlerJobMessage } from './src/lib/sqs.js'
import type { JourneyExecutorEvent, ScheduledActionType } from './src/types/index.js'
import { applyCustomMessage, type CognitoCustomMessageEvent } from './src/services/cognito-custom-message-service.js'

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
// here lets one Lambda serve both the HTTP app and every scheduled job
// without a new function or new deploy pipeline entry.
//
// 'whatsapp-weekly-report' is the original hardcoded global rule (fires
// sendWeeklyReportsForAllClients() for every connected client on one fixed
// cadence) -- left running as-is, not migrated here. 'scheduled-action' is
// the new per-client primitive scheduler-service.ts creates one schedule
// object per ScheduledAction for, each carrying its own clientId/actionType
// in `detail` (see lib/eventbridge-scheduler.ts's buildTarget()). Migrating
// existing weekly-report clients off the old global rule onto individual
// scheduled-action schedules, then deleting the old rule, is a deploy-time
// cutover -- see TODOS.md.
interface ScheduledEvent {
  source?: string
  'detail-type'?: string
  detail?: { clientId?: string; actionType?: ScheduledActionType; leadId?: string; botId?: string }
}

// The crawler worker Lambda (rigachat-crawler) shares this same bundle and
// entry point, triggered by the SQS event source mapping instead of a
// Function URL. batch-size is 1, so a single record is expected per invoke.
interface SQSTriggerEvent {
  Records?: Array<{ eventSource?: string; body: string }>
}

const bufferedHandler = handle(app)

export const handler = async (
  event: LambdaEvent | ScheduledEvent | SQSTriggerEvent | JourneyExecutorEvent | CognitoCustomMessageEvent,
  lambdaContext?: Parameters<typeof bufferedHandler>[1]
) => {
  if ('Records' in event && event.Records?.[0]?.eventSource === 'aws:sqs') {
    const job = JSON.parse(event.Records[0].body) as CrawlerJobMessage
    await processCrawlerJob(job)
    return { statusCode: 200 }
  }

  // journey-compiler-service.ts's compiled Task states set Resource
  // directly to JOURNEY_EXECUTOR_LAMBDA_ARN (this Lambda's own ARN) rather
  // than the arn:aws:states:::lambda:invoke integration, so Step Functions
  // invokes this handler with the Task's Parameters AS the raw event --
  // no wrapping. 'operation' only appears on that shape; nothing else this
  // handler receives has it.
  if ('operation' in event) {
    return executeJourneyStep(event)
  }

  if ('source' in event && event.source === 'aws.events' && event['detail-type'] === 'whatsapp-weekly-report') {
    await sendWeeklyReportsForAllClients()
    return
  }

  if ('source' in event && event.source === 'aws.events' && event['detail-type'] === 'scheduled-action') {
    const { clientId, actionType, leadId, botId, leadSource, leadParentId } = event.detail ?? {}
    if (!clientId || !actionType) {
      console.error('scheduled-action event missing clientId or actionType:', event.detail)
      return
    }
    await executeScheduledAction(clientId, actionType, { leadId, botId, leadSource, leadParentId })
    return
  }

  // Cognito invokes this directly (no Function URL event shape) as the
  // User Pool's "Custom message" Lambda trigger -- see
  // services/cognito-custom-message-service.ts for why this exists and
  // which triggerSource values it handles.
  if ('triggerSource' in event && typeof event.triggerSource === 'string' && event.triggerSource.startsWith('CustomMessage_')) {
    return applyCustomMessage(event)
  }

  return bufferedHandler(event as LambdaEvent, lambdaContext)
}

const hasStreamingRuntime =
  typeof (globalThis as LambdaStreamingGlobal).awslambda?.streamifyResponse === 'function'

export const streamingHandler = hasStreamingRuntime ? streamHandle(app) : undefined

if (process.env.NODE_ENV !== 'production') {
  const port = Number(process.env.PORT) || 3000

  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Server is running on http://localhost:${info.port}`)
  })
}
