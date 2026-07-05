import { v4 as uuidv4 } from 'uuid'
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from './dynamo-client.js'
import type { KnowledgeBaseEntry } from '../types/index.js'

const TABLE_NAME = getTableName('kb')

export async function createKBEntry(
  data: Omit<KnowledgeBaseEntry, 'entryId' | 'createdAt' | 'updatedAt'>
): Promise<KnowledgeBaseEntry> {
  const now = new Date().toISOString()
  const record: KnowledgeBaseEntry = { ...data, entryId: uuidv4(), createdAt: now, updatedAt: now }

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
      `Failed to create knowledge base entry for bot ${data.botId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getKBEntriesByBotId(botId: string): Promise<KnowledgeBaseEntry[]> {
  try {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'botId = :botId',
        ExpressionAttributeValues: { ':botId': botId },
      })
    )
    return (result.Items as KnowledgeBaseEntry[] | undefined) ?? []
  } catch (error) {
    throw new Error(
      `Failed to get knowledge base entries for bot ${botId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getKBEntryById(botId: string, entryId: string): Promise<KnowledgeBaseEntry | null> {
  try {
    const result = await dynamoClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { botId, entryId },
      })
    )
    return (result.Item as KnowledgeBaseEntry | undefined) ?? null
  } catch (error) {
    throw new Error(
      `Failed to get knowledge base entry ${entryId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function updateKBEntry(
  botId: string,
  entryId: string,
  updates: Partial<Pick<KnowledgeBaseEntry, 'title' | 'content'>>
): Promise<KnowledgeBaseEntry> {
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
        Key: { botId, entryId },
        UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      })
    )
    return result.Attributes as KnowledgeBaseEntry
  } catch (error) {
    throw new Error(
      `Failed to update knowledge base entry ${entryId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function deleteKBEntry(botId: string, entryId: string): Promise<void> {
  try {
    await dynamoClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { botId, entryId },
      })
    )
  } catch (error) {
    throw new Error(
      `Failed to delete knowledge base entry ${entryId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
