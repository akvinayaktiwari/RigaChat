import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from './dynamo-client.js'

const TABLE_NAME = getTableName('usage')

type UsageMetric = 'chatConversations' | 'voiceMinutes'

interface UsageItem {
  accountId: string
  periodKey: string
  chatConversations?: number
  voiceMinutes?: number
  createdAt?: string
  updatedAt?: string
}

export async function getUsage(accountId: string, periodKey: string, metric: UsageMetric): Promise<number> {
  try {
    const result = await dynamoClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { accountId, periodKey },
      })
    )
    const item = result.Item as UsageItem | undefined
    return item?.[metric] ?? 0
  } catch (error) {
    throw new Error(
      `Failed to get usage for ${accountId}/${periodKey}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function incrementUsage(
  accountId: string,
  periodKey: string,
  metric: UsageMetric,
  amount = 1
): Promise<number> {
  const now = new Date().toISOString()

  try {
    const result = await dynamoClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { accountId, periodKey },
        UpdateExpression: 'ADD #metric :amt SET updatedAt = :now, createdAt = if_not_exists(createdAt, :now)',
        ExpressionAttributeNames: { '#metric': metric },
        ExpressionAttributeValues: { ':amt': amount, ':now': now },
        ReturnValues: 'UPDATED_NEW',
      })
    )
    const updated = result.Attributes as Partial<UsageItem> | undefined
    return updated?.[metric] ?? amount
  } catch (error) {
    throw new Error(
      `Failed to increment ${metric} for ${accountId}/${periodKey}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function incrementIfUnderLimit(
  accountId: string,
  periodKey: string,
  metric: 'chatConversations',
  limit: number,
  amount = 1
): Promise<{ allowed: boolean; newValue?: number }> {
  const now = new Date().toISOString()
  // Condition checks the PRE-increment value against (limit - amount), since
  // DynamoDB can't reference "value after this same update" in a condition —
  // pre-value <= (limit - amount) is equivalent to post-value <= limit.
  const threshold = limit - amount

  try {
    const result = await dynamoClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { accountId, periodKey },
        UpdateExpression: 'ADD #metric :amt SET updatedAt = :now, createdAt = if_not_exists(createdAt, :now)',
        ConditionExpression: 'attribute_not_exists(#metric) OR #metric <= :threshold',
        ExpressionAttributeNames: { '#metric': metric },
        ExpressionAttributeValues: { ':amt': amount, ':now': now, ':threshold': threshold },
        ReturnValues: 'UPDATED_NEW',
      })
    )
    const updated = result.Attributes as Partial<UsageItem> | undefined
    return { allowed: true, newValue: updated?.[metric] }
  } catch (error) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
      return { allowed: false }
    }
    throw new Error(
      `Failed to increment ${metric} for ${accountId}/${periodKey}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getAllUsageForPeriod(
  accountId: string,
  periodKey: string
): Promise<{ chatConversations: number; voiceMinutes: number }> {
  try {
    const result = await dynamoClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { accountId, periodKey },
      })
    )
    const item = result.Item as UsageItem | undefined
    return {
      chatConversations: item?.chatConversations ?? 0,
      voiceMinutes: item?.voiceMinutes ?? 0,
    }
  } catch (error) {
    throw new Error(
      `Failed to get usage for ${accountId}/${periodKey}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
