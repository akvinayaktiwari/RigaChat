import { v4 as uuidv4 } from 'uuid'
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient } from './dynamo-client.js'
import type {
  CreateVoiceAgentInput,
  IndexingJob,
  VoiceAgent,
  VoiceCallLog,
  VoiceKnowledgeBaseEntry,
} from '../types/index.js'

const TABLE_NAME_ENV_VAR = 'DYNAMODB_TABLE_VOICE_AGENTS'
const CALL_LOGS_TABLE_NAME_ENV_VAR = 'DYNAMODB_TABLE_VOICE_CALL_LOGS'
const VOICE_KB_TABLE_NAME_ENV_VAR = 'DYNAMODB_TABLE_VOICE_KB'

function getVoiceAgentsTableName(): string {
  const tableName = process.env[TABLE_NAME_ENV_VAR]

  if (!tableName) {
    throw new Error(
      `Missing required environment variable ${TABLE_NAME_ENV_VAR}. Set it in your .env file before starting the server.`
    )
  }

  return tableName
}

function getVoiceCallLogsTableName(): string {
  const tableName = process.env[CALL_LOGS_TABLE_NAME_ENV_VAR]

  if (!tableName) {
    throw new Error(
      `Missing required environment variable ${CALL_LOGS_TABLE_NAME_ENV_VAR}. Set it in your .env file before starting the server.`
    )
  }

  return tableName
}

function getVoiceKBTableName(): string {
  const tableName = process.env[VOICE_KB_TABLE_NAME_ENV_VAR]

  if (!tableName) {
    throw new Error(
      `Missing required environment variable ${VOICE_KB_TABLE_NAME_ENV_VAR}. Set it in your .env file before starting the server.`
    )
  }

  return tableName
}

export async function createVoiceAgent(input: CreateVoiceAgentInput): Promise<VoiceAgent> {
  const now = new Date().toISOString()
  const record: VoiceAgent = {
    ...input,
    agentId: uuidv4(),
    isEnabled: false,
    isIndexed: false,
    createdAt: now,
    updatedAt: now,
  }

  try {
    await dynamoClient.send(
      new PutCommand({
        TableName: getVoiceAgentsTableName(),
        Item: record,
      })
    )
    return record
  } catch (error) {
    throw new Error(
      `Failed to create voice agent for client ${input.clientId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getVoiceAgentsByClient(clientId: string): Promise<VoiceAgent[]> {
  try {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: getVoiceAgentsTableName(),
        KeyConditionExpression: 'clientId = :clientId',
        ExpressionAttributeValues: { ':clientId': clientId },
      })
    )
    return (result.Items as VoiceAgent[] | undefined) ?? []
  } catch (error) {
    throw new Error(
      `Failed to get voice agents for client ${clientId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getVoiceAgentById(agentId: string): Promise<VoiceAgent | null> {
  try {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: getVoiceAgentsTableName(),
        IndexName: 'agentId-index',
        KeyConditionExpression: 'agentId = :agentId',
        ExpressionAttributeValues: { ':agentId': agentId },
        Limit: 1,
      })
    )
    const items = (result.Items as VoiceAgent[] | undefined) ?? []
    return items[0] ?? null
  } catch (error) {
    throw new Error(
      `Failed to get voice agent ${agentId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function updateVoiceAgent(
  agentId: string,
  clientId: string,
  updates: Partial<VoiceAgent>
): Promise<VoiceAgent> {
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
        TableName: getVoiceAgentsTableName(),
        Key: { clientId, agentId },
        UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      })
    )
    return result.Attributes as VoiceAgent
  } catch (error) {
    throw new Error(
      `Failed to update voice agent ${agentId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

// Atomic claim to guard against SQS at-least-once delivery causing two
// concurrent Lambda invocations to both crawl and upsert the same job.
// Mirrors bot-repository.ts's claimCrawlerJob, against the voice_agents table.
export async function claimVoiceCrawlerJob(agentId: string, clientId: string, jobId: string): Promise<boolean> {
  try {
    await dynamoClient.send(
      new UpdateCommand({
        TableName: getVoiceAgentsTableName(),
        Key: { clientId, agentId },
        UpdateExpression: 'SET indexingJob.#status = :processing, indexingJob.startedAt = :now',
        ConditionExpression: 'indexingJob.jobId = :jobId AND indexingJob.#status = :queued',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':processing': 'processing',
          ':queued': 'queued',
          ':jobId': jobId,
          ':now': new Date().toISOString(),
        },
      })
    )
    return true
  } catch (error) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
      return false
    }
    console.error(`Failed to claim crawler job ${jobId} for voice agent ${agentId}:`, error)
    return false
  }
}

export async function updateVoiceIndexingJob(
  agentId: string,
  clientId: string,
  updates: Partial<IndexingJob>
): Promise<void> {
  try {
    const agent = await getVoiceAgentById(agentId)
    const merged: IndexingJob = {
      ...(agent?.indexingJob as IndexingJob | undefined),
      ...updates,
    } as IndexingJob
    await updateVoiceAgent(agentId, clientId, { indexingJob: merged })
  } catch (error) {
    throw new Error(
      `Failed to update indexing job for voice agent ${agentId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function writeVoiceCallLog(log: VoiceCallLog): Promise<void> {
  try {
    await dynamoClient.send(
      new PutCommand({
        TableName: getVoiceCallLogsTableName(),
        Item: log,
      })
    )
  } catch (error) {
    throw new Error(
      `Failed to write voice call log ${log.callId} for agent ${log.agentId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getVoiceCallLogsForAgent(agentId: string): Promise<VoiceCallLog[]> {
  try {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: getVoiceCallLogsTableName(),
        KeyConditionExpression: 'agentId = :agentId',
        ExpressionAttributeValues: { ':agentId': agentId },
      })
    )
    return (result.Items as VoiceCallLog[] | undefined) ?? []
  } catch (error) {
    throw new Error(
      `Failed to get voice call logs for agent ${agentId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function deleteVoiceAgent(agentId: string, clientId: string): Promise<void> {
  try {
    await dynamoClient.send(
      new DeleteCommand({
        TableName: getVoiceAgentsTableName(),
        Key: { clientId, agentId },
      })
    )
  } catch (error) {
    throw new Error(
      `Failed to delete voice agent ${agentId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function createVoiceKBEntry(entry: VoiceKnowledgeBaseEntry): Promise<VoiceKnowledgeBaseEntry> {
  try {
    await dynamoClient.send(
      new PutCommand({
        TableName: getVoiceKBTableName(),
        Item: entry,
      })
    )
    return entry
  } catch (error) {
    throw new Error(
      `Failed to create knowledge base entry for voice agent ${entry.agentId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getVoiceKBEntriesByAgent(agentId: string): Promise<VoiceKnowledgeBaseEntry[]> {
  try {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: getVoiceKBTableName(),
        KeyConditionExpression: 'agentId = :agentId',
        ExpressionAttributeValues: { ':agentId': agentId },
      })
    )
    return (result.Items as VoiceKnowledgeBaseEntry[] | undefined) ?? []
  } catch (error) {
    throw new Error(
      `Failed to get knowledge base entries for voice agent ${agentId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getVoiceKBEntry(agentId: string, entryId: string): Promise<VoiceKnowledgeBaseEntry | null> {
  try {
    const result = await dynamoClient.send(
      new GetCommand({
        TableName: getVoiceKBTableName(),
        Key: { agentId, entryId },
      })
    )
    return (result.Item as VoiceKnowledgeBaseEntry | undefined) ?? null
  } catch (error) {
    throw new Error(
      `Failed to get knowledge base entry ${entryId} for voice agent ${agentId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function updateVoiceKBEntry(
  agentId: string,
  entryId: string,
  updates: Pick<VoiceKnowledgeBaseEntry, 'title' | 'content'>
): Promise<VoiceKnowledgeBaseEntry> {
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
        TableName: getVoiceKBTableName(),
        Key: { agentId, entryId },
        UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      })
    )
    return result.Attributes as VoiceKnowledgeBaseEntry
  } catch (error) {
    throw new Error(
      `Failed to update knowledge base entry ${entryId} for voice agent ${agentId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function deleteVoiceKBEntry(agentId: string, entryId: string): Promise<void> {
  try {
    await dynamoClient.send(
      new DeleteCommand({
        TableName: getVoiceKBTableName(),
        Key: { agentId, entryId },
      })
    )
  } catch (error) {
    throw new Error(
      `Failed to delete knowledge base entry ${entryId} for voice agent ${agentId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
