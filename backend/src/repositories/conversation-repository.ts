import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from './dynamo-client.js'
import type { ConversationMessage, ConversationRecord } from '../types/index.js'

const TABLE_NAME = getTableName('conversations')

export async function createConversation(
  data: Omit<ConversationRecord, 'createdAt' | 'updatedAt'>
): Promise<ConversationRecord> {
  const now = new Date().toISOString()
  const record: ConversationRecord = { ...data, createdAt: now, updatedAt: now }

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
      `Failed to create conversation ${data.conversationId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getConversation(
  botId: string,
  conversationId: string
): Promise<ConversationRecord | null> {
  try {
    const result = await dynamoClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { botId, conversationId },
      })
    )
    return (result.Item as ConversationRecord | undefined) ?? null
  } catch (error) {
    throw new Error(
      `Failed to get conversation ${conversationId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function appendMessage(
  botId: string,
  conversationId: string,
  message: ConversationMessage
): Promise<ConversationRecord> {
  const now = new Date().toISOString()

  try {
    const result = await dynamoClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { botId, conversationId },
        UpdateExpression:
          'SET messages = list_append(if_not_exists(messages, :emptyList), :newMessage), updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':newMessage': [message],
          ':emptyList': [],
          ':updatedAt': now,
        },
        ReturnValues: 'ALL_NEW',
      })
    )
    return result.Attributes as ConversationRecord
  } catch (error) {
    throw new Error(
      `Failed to append message to conversation ${conversationId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function markLeadCaptured(botId: string, conversationId: string): Promise<void> {
  const now = new Date().toISOString()

  try {
    await dynamoClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { botId, conversationId },
        UpdateExpression: 'SET leadCaptured = :leadCaptured, updatedAt = :updatedAt',
        ExpressionAttributeValues: { ':leadCaptured': true, ':updatedAt': now },
      })
    )
  } catch (error) {
    throw new Error(
      `Failed to mark lead captured for conversation ${conversationId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
