import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'

const client = new SQSClient({ region: process.env.AWS_REGION })
const QUEUE_URL = process.env.SQS_CRAWLER_QUEUE_URL ?? ''

export interface CrawlerJobMessage {
  jobId: string
  botId: string
  clientId: string
  urls: string[]
  useAICleaning: boolean
  botName: string
  // Discriminates which table the consumer should track progress on and
  // update on completion. Absent/omitted means 'bot' — existing bot
  // enqueue call sites are unchanged and don't need to set this.
  type?: 'bot' | 'voice_agent'
}

export async function enqueueCrawlerJob(job: CrawlerJobMessage): Promise<void> {
  await client.send(
    new SendMessageCommand({
      QueueUrl: QUEUE_URL,
      MessageBody: JSON.stringify(job),
    })
  )
}
