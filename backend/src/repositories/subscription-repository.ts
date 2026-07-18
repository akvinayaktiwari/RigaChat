import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from './dynamo-client.js'
import type { Subscription } from '../types/index.js'

const TABLE_NAME = getTableName('subscriptions')

export async function getByAccountId(accountId: string): Promise<Subscription | null> {
  try {
    const result = await dynamoClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { accountId },
      })
    )
    return (result.Item as Subscription | undefined) ?? null
  } catch (error) {
    throw new Error(
      `Failed to get subscription ${accountId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function create(data: Omit<Subscription, 'createdAt' | 'updatedAt'>): Promise<Subscription> {
  const now = new Date().toISOString()
  const record: Subscription = { ...data, createdAt: now, updatedAt: now }

  try {
    await dynamoClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: record,
      })
    )
    return record
  } catch (error) {
    throw new Error(
      `Failed to create subscription ${data.accountId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function updatePartial(
  accountId: string,
  updates: Partial<Omit<Subscription, 'accountId' | 'createdAt'>>
): Promise<Subscription> {
  const now = new Date().toISOString()
  const fields: Record<string, unknown> = { ...updates, updatedAt: now }

  const updateExpressionParts: string[] = []
  const expressionAttributeNames: Record<string, string> = {}
  const expressionAttributeValues: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(fields)) {
    updateExpressionParts.push(`#${key} = :${key}`)
    expressionAttributeNames[`#${key}`] = key
    expressionAttributeValues[`:${key}`] = value
  }

  try {
    const result = await dynamoClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { accountId },
        UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      })
    )
    return result.Attributes as Subscription
  } catch (error) {
    throw new Error(
      `Failed to update subscription ${accountId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function setInternal(accountId: string, isInternal: boolean): Promise<Subscription> {
  return updatePartial(accountId, { isInternal })
}
