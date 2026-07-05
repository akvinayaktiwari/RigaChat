import { v4 as uuidv4 } from 'uuid'
import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from './dynamo-client.js'
import type { Lead } from '../types/index.js'

const TABLE_NAME = getTableName('leads')

export async function createLead(data: Omit<Lead, 'leadId' | 'createdAt'>): Promise<Lead> {
  const record: Lead = { ...data, leadId: uuidv4(), createdAt: new Date().toISOString() }

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
      `Failed to create lead for bot ${data.botId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getLeadsByBotId(botId: string, limit = 50): Promise<Lead[]> {
  try {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'botId = :botId',
        ExpressionAttributeValues: { ':botId': botId },
        ScanIndexForward: false,
        Limit: limit,
      })
    )
    return (result.Items as Lead[] | undefined) ?? []
  } catch (error) {
    throw new Error(
      `Failed to get leads for bot ${botId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getLeadById(botId: string, leadId: string): Promise<Lead | null> {
  try {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'leadId-index',
        KeyConditionExpression: 'leadId = :leadId',
        FilterExpression: 'botId = :botId',
        ExpressionAttributeValues: { ':botId': botId, ':leadId': leadId },
      })
    )
    const items = (result.Items as Lead[] | undefined) ?? []
    return items[0] ?? null
  } catch (error) {
    throw new Error(
      `Failed to get lead ${leadId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getLeadsByClientId(clientId: string): Promise<Lead[]> {
  try {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'clientId-index',
        KeyConditionExpression: 'clientId = :clientId',
        ExpressionAttributeValues: { ':clientId': clientId },
        ScanIndexForward: false,
      })
    )
    return (result.Items as Lead[] | undefined) ?? []
  } catch (error) {
    throw new Error(
      `Failed to get leads for client ${clientId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
