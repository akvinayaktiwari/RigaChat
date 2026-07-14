import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from './dynamo-client.js'
import type { BotConfig, BotStatus, IndexingJob } from '../types/index.js'

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
  if (fields.supportEmail === '') {
    delete fields.supportEmail
  }

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

export async function updateIndexingJob(
  botId: string,
  clientId: string,
  updates: Partial<IndexingJob>
): Promise<void> {
  try {
    const bot = await getBotById(botId, clientId)
    const merged: IndexingJob = {
      ...(bot?.indexingJob as IndexingJob | undefined),
      ...updates,
    } as IndexingJob
    await updateBot(botId, clientId, { indexingJob: merged })
  } catch (error) {
    throw new Error(
      `Failed to update indexing job for bot ${botId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

// Atomic claim to guard against SQS at-least-once delivery causing two
// concurrent Lambda invocations to both crawl and upsert the same job.
// Only one invocation's conditional write can succeed in transitioning
// status 'queued' -> 'processing'; the loser gets ConditionalCheckFailedException
// and must skip, not throw (a thrown error would make SQS retry, which is
// the same duplicate-processing problem this exists to prevent).
export async function claimCrawlerJob(botId: string, clientId: string, jobId: string): Promise<boolean> {
  try {
    await dynamoClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { clientId, botId },
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
    console.error(`Failed to claim crawler job ${jobId} for bot ${botId}:`, error)
    return false
  }
}

// Sparse update — crawlError is only included in the expression when provided,
// so a status-only transition (e.g. back to 'active') doesn't overwrite it with undefined.
export async function updateBotCrawlStatus(
  botId: string,
  clientId: string,
  status: BotStatus,
  crawlError?: string
): Promise<void> {
  const expressionAttributeNames: Record<string, string> = { '#status': 'status' }
  const expressionAttributeValues: Record<string, unknown> = {
    ':status': status,
    ':now': new Date().toISOString(),
  }
  let updateExpression = 'SET #status = :status, updatedAt = :now'

  if (crawlError !== undefined) {
    updateExpression += ', crawlError = :crawlError'
    expressionAttributeValues[':crawlError'] = crawlError
  }

  try {
    await dynamoClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { clientId, botId },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      })
    )
  } catch (error) {
    throw new Error(
      `Failed to update crawl status for bot ${botId}: ${error instanceof Error ? error.message : String(error)}`
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
