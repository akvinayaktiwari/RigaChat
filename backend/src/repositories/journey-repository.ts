import { v4 as uuidv4 } from 'uuid'
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from './dynamo-client.js'
import type { JourneyBundle } from '../types/index.js'

const TABLE_NAME = getTableName('journeys')

export async function createJourneyBundle(
  data: Omit<JourneyBundle, 'bundleId' | 'createdAt' | 'updatedAt'>
): Promise<JourneyBundle> {
  const now = new Date().toISOString()
  const record: JourneyBundle = { ...data, bundleId: uuidv4(), createdAt: now, updatedAt: now }

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
      `Failed to create Journey bundle for bot ${data.botId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getJourneyBundlesByBotId(botId: string): Promise<JourneyBundle[]> {
  try {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'botId = :botId',
        ExpressionAttributeValues: { ':botId': botId },
      })
    )
    return (result.Items as JourneyBundle[] | undefined) ?? []
  } catch (error) {
    throw new Error(
      `Failed to get Journey bundles for bot ${botId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getJourneyBundleById(botId: string, bundleId: string): Promise<JourneyBundle | null> {
  try {
    const result = await dynamoClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { botId, bundleId },
      })
    )
    return (result.Item as JourneyBundle | undefined) ?? null
  } catch (error) {
    throw new Error(`Failed to get Journey bundle ${bundleId}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export async function updateJourneyBundle(
  botId: string,
  bundleId: string,
  updates: Partial<
    Pick<
      JourneyBundle,
      | 'name'
      | 'description'
      | 'journey'
      | 'agent'
      | 'status'
      | 'compiledStateMachineArn'
      | 'compiledStateMachineVersionArn'
      | 'publishedVersion'
    >
  >
): Promise<JourneyBundle> {
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
        Key: { botId, bundleId },
        UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      })
    )
    return result.Attributes as JourneyBundle
  } catch (error) {
    throw new Error(`Failed to update Journey bundle ${bundleId}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export async function deleteJourneyBundle(botId: string, bundleId: string): Promise<void> {
  try {
    await dynamoClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { botId, bundleId },
      })
    )
  } catch (error) {
    throw new Error(`Failed to delete Journey bundle ${bundleId}: ${error instanceof Error ? error.message : String(error)}`)
  }
}
