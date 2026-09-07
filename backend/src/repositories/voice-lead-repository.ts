import { v4 as uuidv4 } from 'uuid'
import { DeleteCommand, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from './dynamo-client.js'
import type { VoiceLead } from '../types/index.js'

const TABLE_NAME = (): string => getTableName('voice_leads')

// Partitioned by clientId with leadId as the range key, deliberately matching
// meta_leads rather than partitioning by agentId. LeadRef carries the agentId
// as a discriminator, never as an address -- the same distinction that made
// every Meta lead's detail page throw when it was keyed by pageId, because a
// Key built from a non-key attribute is rejected outright rather than simply
// returning nothing.
export async function createVoiceLead(
  data: Omit<VoiceLead, 'leadId' | 'createdAt' | 'source'>
): Promise<VoiceLead> {
  const record: VoiceLead = {
    ...data,
    source: 'voice',
    leadId: uuidv4(),
    createdAt: new Date().toISOString(),
  }

  try {
    await dynamoClient.send(new PutCommand({ TableName: TABLE_NAME(), Item: record }))
    return record
  } catch (error) {
    throw new Error(
      `Failed to create voice lead for client ${data.clientId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getVoiceLeadById(clientId: string, leadId: string): Promise<VoiceLead | null> {
  try {
    const result = await dynamoClient.send(
      new GetCommand({ TableName: TABLE_NAME(), Key: { clientId, leadId } })
    )
    return (result.Item as VoiceLead | undefined) ?? null
  } catch (error) {
    throw new Error(
      `Failed to get voice lead ${leadId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

// Newest first, off the clientId-createdAt GSI, mirroring
// getMetaLeadsByClientId. The inbox merges this with the other sources.
export async function getVoiceLeadsByClientId(clientId: string, limit = 50): Promise<VoiceLead[]> {
  try {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME(),
        IndexName: 'clientId-createdAt-index',
        KeyConditionExpression: 'clientId = :clientId',
        ExpressionAttributeValues: { ':clientId': clientId },
        ScanIndexForward: false,
        Limit: limit,
      })
    )
    return (result.Items as VoiceLead[] | undefined) ?? []
  } catch (error) {
    throw new Error(
      `Failed to list voice leads for client ${clientId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function deleteVoiceLead(clientId: string, leadId: string): Promise<void> {
  try {
    await dynamoClient.send(new DeleteCommand({ TableName: TABLE_NAME(), Key: { clientId, leadId } }))
  } catch (error) {
    throw new Error(
      `Failed to delete voice lead ${leadId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
