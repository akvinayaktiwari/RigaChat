import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from './dynamo-client.js'
import type { BotConfig } from '../types/index.js'

const TABLE_NAME = getTableName('bots')

export async function createBot(data: Omit<BotConfig, 'createdAt' | 'updatedAt'>): Promise<BotConfig> {
  const now = new Date().toISOString()
  const record: BotConfig = { ...data, createdAt: now, updatedAt: now }

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
      `Failed to create bot ${data.botId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getBotById(botId: string, clientId: string): Promise<BotConfig | null> {
  try {
    const result = await dynamoClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { clientId, botId },
      })
    )
    return (result.Item as BotConfig | undefined) ?? null
  } catch (error) {
    throw new Error(
      `Failed to get bot ${botId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getBotsByClientId(clientId: string): Promise<BotConfig[]> {
  try {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'clientId = :clientId',
        ExpressionAttributeValues: { ':clientId': clientId },
      })
    )
    return (result.Items as BotConfig[] | undefined) ?? []
  } catch (error) {
    throw new Error(
      `Failed to get bots for client ${clientId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function updateBot(
  botId: string,
  clientId: string,
  updates: Partial<Omit<BotConfig, 'botId' | 'clientId' | 'createdAt'>>
): Promise<BotConfig> {
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
        Key: { clientId, botId },
        UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      })
    )
    return result.Attributes as BotConfig
  } catch (error) {
    throw new Error(
      `Failed to update bot ${botId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function deleteBot(botId: string, clientId: string): Promise<void> {
  try {
    await dynamoClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { clientId, botId },
      })
    )
  } catch (error) {
    throw new Error(
      `Failed to delete bot ${botId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getPublicBotConfig(botId: string): Promise<BotConfig | null> {
  try {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'botId-index',
        KeyConditionExpression: 'botId = :botId',
        ExpressionAttributeValues: { ':botId': botId },
        Limit: 1,
      })
    )
    const items = (result.Items as BotConfig[] | undefined) ?? []
    return items[0] ?? null
  } catch (error) {
    throw new Error(
      `Failed to get public bot config ${botId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
