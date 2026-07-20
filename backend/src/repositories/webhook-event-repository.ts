import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from './dynamo-client.js'
import type { WebhookEvent } from '../types/index.js'

const TABLE_NAME = getTableName('webhook_events')
const TTL_SECONDS = 90 * 24 * 60 * 60

export async function hasProcessed(eventId: string): Promise<boolean> {
  try {
    const result = await dynamoClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { eventId },
      })
    )
    return result.Item !== undefined
  } catch (error) {
    throw new Error(
      `Failed to check webhook event ${eventId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function markProcessed(eventId: string, provider: string, eventType: string): Promise<void> {
  const now = new Date()
  const record: WebhookEvent = {
    eventId,
    provider,
    eventType,
    processedAt: now.toISOString(),
    expiresAt: Math.floor(now.getTime() / 1000) + TTL_SECONDS,
  }

  try {
    await dynamoClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: record,
      })
    )
  } catch (error) {
    throw new Error(
      `Failed to mark webhook event ${eventId} processed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
