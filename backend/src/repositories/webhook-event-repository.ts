import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from './dynamo-client.js'
import type { WebhookEvent } from '../types/index.js'

const TABLE_NAME = (): string => getTableName('webhook_events')
const TTL_SECONDS = 90 * 24 * 60 * 60

export async function hasProcessed(eventId: string): Promise<boolean> {
  try {
    const result = await dynamoClient.send(
      new GetCommand({
        TableName: TABLE_NAME(),
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
        TableName: TABLE_NAME(),
        Item: record,
      })
    )
  } catch (error) {
    throw new Error(
      `Failed to mark webhook event ${eventId} processed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

// -------------------------------------------------------------------------
// Atomic claim, for paths where a duplicate costs real money or messages a real
// person twice.
//
// hasProcessed() + markProcessed() above is a read followed by an unconditional
// write. Two concurrent deliveries of the same event BOTH pass the read before
// either writes, so both proceed. That was survivable when processing an event
// meant a couple of DynamoDB writes. It stops being survivable when it means an
// OpenAI completion and a WhatsApp message to a customer.
//
// Returns true when THIS caller won the claim and should process, false when
// someone already has it. releaseWebhookEventClaim() exists so a caller that
// fails mid-processing can hand the work back rather than swallowing the event
// forever: claim-then-crash would otherwise lose a real customer message.
// -------------------------------------------------------------------------
export async function claimWebhookEvent(
  eventId: string,
  provider: string,
  eventType: string
): Promise<boolean> {
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
        TableName: TABLE_NAME(),
        Item: record,
        ConditionExpression: 'attribute_not_exists(eventId)',
      })
    )
    return true
  } catch (error) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
      return false
    }
    // Fail OPEN. A broken idempotency table must not stop a customer message
    // being answered; the cost of being wrong here is a duplicate reply, which
    // is strictly better than silence.
    console.error(
      `[webhook-events] claim failed for ${eventId}, proceeding without idempotency:`,
      error instanceof Error ? error.message : error
    )
    return true
  }
}

export async function releaseWebhookEventClaim(eventId: string): Promise<void> {
  try {
    await dynamoClient.send(new DeleteCommand({ TableName: TABLE_NAME(), Key: { eventId } }))
  } catch (error) {
    // The TTL will clear it eventually. Logged rather than thrown because the
    // caller is already handling a failure and this is cleanup.
    console.error(
      `[webhook-events] could not release claim ${eventId}:`,
      error instanceof Error ? error.message : error
    )
  }
}
