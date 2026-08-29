import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from './dynamo-client.js'
import type { PendingJourneyReply } from '../types/index.js'

const TABLE_NAME = (): string => getTableName('journey_pending_replies')

export class PendingReplyConflictError extends Error {
  constructor(leadId: string) {
    super(`Lead ${leadId} is already awaiting a reply in another journey`)
    this.name = 'PendingReplyConflictError'
  }
}

// Conditional rather than a plain put. An overwrite would silently strand the
// first journey: its task token would be lost, so nothing could ever resume it
// and it would sit paused until its 24h timeout. Phase 1 cannot actually reach
// this (one active bundle per trigger, one trigger), so the condition exists to
// make a future regression loud instead of invisible.
export async function claimPendingReply(record: PendingJourneyReply): Promise<void> {
  try {
    await dynamoClient.send(
      new PutCommand({
        TableName: TABLE_NAME(),
        Item: record,
        ConditionExpression: 'attribute_not_exists(leadId)',
      })
    )
  } catch (error) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
      throw new PendingReplyConflictError(record.leadId)
    }
    throw new Error(
      `Failed to record pending reply for lead ${record.leadId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getPendingReply(leadId: string): Promise<PendingJourneyReply | null> {
  try {
    const result = await dynamoClient.send(
      new GetCommand({
        TableName: TABLE_NAME(),
        Key: { leadId },
      })
    )
    const item = result.Item as PendingJourneyReply | undefined
    if (!item) return null

    // DynamoDB TTL deletion is best-effort and can lag by hours, so a row can
    // outlive the execution it points at. Treating an expired row as absent
    // stops us from resuming an execution Step Functions has already timed out
    // (which would fail with TaskTimedOut) and reporting it as a live resume.
    if (item.expiresAt * 1000 <= Date.now()) return null

    return item
  } catch (error) {
    throw new Error(
      `Failed to read pending reply for lead ${leadId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

// Conditional on the token matching, so a resume racing a timeout-and-requeue
// cannot delete a newer pending reply than the one it consumed. A missing row
// is success -- the desired end state is "no pending reply", not "I deleted it".
export async function clearPendingReply(leadId: string, taskToken: string): Promise<void> {
  try {
    await dynamoClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME(),
        Key: { leadId },
        ConditionExpression: 'attribute_not_exists(leadId) OR taskToken = :token',
        ExpressionAttributeValues: { ':token': taskToken },
      })
    )
  } catch (error) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') return
    throw new Error(
      `Failed to clear pending reply for lead ${leadId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

// Erasure only. clearPendingReply is conditional on the task token, because a
// stale resume must never clear a newer one -- but erasure has no token and
// wants the row gone regardless of which execution parked it.
export async function deletePendingReply(leadId: string): Promise<void> {
  try {
    await dynamoClient.send(new DeleteCommand({ TableName: TABLE_NAME(), Key: { leadId } }))
  } catch (error) {
    throw new Error(
      `Failed to delete pending reply for lead ${leadId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
