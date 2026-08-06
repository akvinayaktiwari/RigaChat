import { v4 as uuidv4 } from 'uuid'
import { PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from './dynamo-client.js'
import type { ContactMessage } from '../types/index.js'

const TABLE_NAME = (): string => getTableName('contact_messages')

export async function createContactMessage(
  data: Omit<ContactMessage, 'messageId' | 'recordType' | 'createdAt'>
): Promise<ContactMessage> {
  const record: ContactMessage = {
    ...data,
    messageId: uuidv4(),
    recordType: 'contact_message',
    createdAt: new Date().toISOString(),
  }

  try {
    await dynamoClient.send(
      new PutCommand({
        TableName: TABLE_NAME(),
        Item: record,
      })
    )
    return record
  } catch (error) {
    throw new Error(
      `Failed to create contact message: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function markContactMessageNotified(messageId: string): Promise<void> {
  try {
    await dynamoClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME(),
        Key: { messageId },
        UpdateExpression: 'SET notified = :notified',
        ExpressionAttributeValues: { ':notified': true },
      })
    )
  } catch (error) {
    throw new Error(
      `Failed to mark contact message ${messageId} as notified: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getContactMessages(limit = 50): Promise<ContactMessage[]> {
  try {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME(),
        IndexName: 'recordType-createdAt-index',
        KeyConditionExpression: 'recordType = :recordType',
        ExpressionAttributeValues: { ':recordType': 'contact_message' },
        ScanIndexForward: false,
        Limit: limit,
      })
    )
    return (result.Items as ContactMessage[] | undefined) ?? []
  } catch (error) {
    throw new Error(
      `Failed to list contact messages: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
