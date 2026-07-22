import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'

const client = new SQSClient({ region: process.env.AWS_REGION })
const QUEUE_URL = process.env.SQS_CRAWLER_QUEUE_URL ?? ''

interface CrawlerJobMessageBase {
  jobId: string
  botId: string
  clientId: string
}

// Discriminates which table the consumer should track progress on and
// update on completion. Absent/omitted means 'bot' — existing bot
// enqueue call sites are unchanged and don't need to set this.
export interface WebsiteCrawlerJobMessage extends CrawlerJobMessageBase {
  type?: 'bot' | 'voice_agent'
  urls: string[]
  useAICleaning: boolean
  botName: string
}

// No crawl, no chunking -- extraction happens straight from the S3 object.
// See crawler-worker-service.ts's processKBFileJob().
export interface KBFileCrawlerJobMessage extends CrawlerJobMessageBase {
  type: 'kb_file'
  entryId: string
  s3Key: string
  fileType: 'pdf' | 'docx' | 'text'
}

// Deliberately not extending CrawlerJobMessageBase -- its botId field
// doesn't apply to a voice agent's own KB file job, and reusing it to carry
// an agentId would be misleading. See crawler-worker-service.ts's
// processVoiceKBFileJob().
export interface VoiceKBFileCrawlerJobMessage {
  type: 'voice_kb_file'
  jobId: string
  agentId: string
  clientId: string
  entryId: string
  s3Key: string
  fileType: 'pdf' | 'docx' | 'text'
}

export type CrawlerJobMessage = WebsiteCrawlerJobMessage | KBFileCrawlerJobMessage | VoiceKBFileCrawlerJobMessage

export async function enqueueCrawlerJob(job: CrawlerJobMessage): Promise<void> {
  await client.send(
    new SendMessageCommand({
      QueueUrl: QUEUE_URL,
      MessageBody: JSON.stringify(job),
    })
  )
}
