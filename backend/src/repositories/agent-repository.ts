import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from './dynamo-client.js'
import type { Agent } from '../types/index.js'

// Top-level cross-channel Agent entity. Key shape mirrors the bots table
// (partition clientId, sort agentId) so ownership queries look identical to
// bot-repository.ts. This is an identity layer over the existing per-channel
// records (botId / voice agentId); it does NOT touch their Pinecone namespaces.
const TABLE_NAME = getTableName('agents')

export async function createAgent(data: Omit<Agent, 'createdAt' | 'updatedAt'>): Promise<Agent> {
  const now = new Date().toISOString()
  const record: Agent = { ...data, createdAt: now, updatedAt: now }

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
      `Failed to create agent ${data.agentId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getAgentById(agentId: string, clientId: string): Promise<Agent | null> {
  try {
    const result = await dynamoClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { clientId, agentId },
      })
    )
    return (result.Item as Agent | undefined) ?? null
  } catch (error) {
    throw new Error(
      `Failed to get agent ${agentId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getAgentsByClientId(clientId: string): Promise<Agent[]> {
  try {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'clientId = :clientId',
        ExpressionAttributeValues: { ':clientId': clientId },
      })
    )
    return (result.Items as Agent[] | undefined) ?? []
  } catch (error) {
    throw new Error(
      `Failed to get agents for client ${clientId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function updateAgent(
  agentId: string,
  clientId: string,
  updates: Partial<Omit<Agent, 'agentId' | 'clientId' | 'createdAt'>>
): Promise<Agent> {
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
        Key: { clientId, agentId },
        UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      })
    )
    return result.Attributes as Agent
  } catch (error) {
    throw new Error(
      `Failed to update agent ${agentId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function deleteAgent(agentId: string, clientId: string): Promise<void> {
  try {
    await dynamoClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { clientId, agentId },
      })
    )
  } catch (error) {
    throw new Error(
      `Failed to delete agent ${agentId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
