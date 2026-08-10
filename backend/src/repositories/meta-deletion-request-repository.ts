import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from './dynamo-client.js'
import type { MetaDeletionRequest } from '../types/index.js'

const TABLE_NAME = (): string => getTableName('meta_deletion_requests')

export async function createMetaDeletionRequest(
  record: MetaDeletionRequest
): Promise<MetaDeletionRequest> {
  try {
    await dynamoClient.send(
      new PutCommand({
        TableName: TABLE_NAME(),
        Item: record,
        // The code is 128 bits of randomness, so a collision is not a real
        // scenario -- but overwriting an existing request would silently erase
        // someone's deletion record, which is the one failure this endpoint
        // must never have. Cheap guard, so it stays.
        ConditionExpression: 'attribute_not_exists(confirmationCode)',
      })
    )
    return record
  } catch (error) {
    throw new Error(
      `Failed to create Meta deletion request: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getMetaDeletionRequest(
  confirmationCode: string
): Promise<MetaDeletionRequest | null> {
  try {
    const result = await dynamoClient.send(
      new GetCommand({
        TableName: TABLE_NAME(),
        Key: { confirmationCode },
      })
    )

    return (result.Item as MetaDeletionRequest | undefined) ?? null
  } catch (error) {
    throw new Error(
      `Failed to fetch Meta deletion request ${confirmationCode}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function markMetaDeletionRequestNotified(confirmationCode: string): Promise<void> {
  try {
    await dynamoClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME(),
        Key: { confirmationCode },
        UpdateExpression: 'SET notified = :notified',
        ExpressionAttributeValues: { ':notified': true },
      })
    )
  } catch (error) {
    throw new Error(
      `Failed to mark Meta deletion request ${confirmationCode} as notified: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
