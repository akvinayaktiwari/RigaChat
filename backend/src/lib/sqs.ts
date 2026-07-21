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

export type CrawlerJobMessage = WebsiteCrawlerJobMessage | KBFileCrawlerJobMessage

export async function enqueueCrawlerJob(job: CrawlerJobMessage): Promise<void> {
  await client.send(
    new SendMessageCommand({
      QueueUrl: QUEUE_URL,
      MessageBody: JSON.stringify(job),
    })
  )
}
