import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from './dynamo-client.js'
import type { ScheduledAction } from '../types/index.js'

const TABLE_NAME = (): string => getTableName('scheduled_actions')

// scheduleId is NOT minted here (unlike most other create*() repository
// functions) -- it must exist before this is called, because
// scheduler-service.ts uses it as the EventBridge Scheduler schedule's
// Name, and that external resource has to be created with the same ID this
// DynamoDB row uses. Mirrors kb-repository.ts's createKBFileEntry(), which
// reuses an ID minted earlier for the same reason (matching an S3 key).
export async function createScheduledAction(
  data: Omit<ScheduledAction, 'createdAt' | 'updatedAt'>
): Promise<ScheduledAction> {
  const now = new Date().toISOString()
  const record: ScheduledAction = { ...data, createdAt: now, updatedAt: now }

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
      `Failed to create scheduled action for client ${data.clientId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getScheduledActionsByClientId(clientId: string): Promise<ScheduledAction[]> {
  try {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME(),
        KeyConditionExpression: 'clientId = :clientId',
        ExpressionAttributeValues: { ':clientId': clientId },
      })
    )
    return (result.Items as ScheduledAction[] | undefined) ?? []
  } catch (error) {
    throw new Error(
      `Failed to get scheduled actions for client ${clientId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getScheduledActionById(clientId: string, scheduleId: string): Promise<ScheduledAction | null> {
  try {
    const result = await dynamoClient.send(
      new GetCommand({
        TableName: TABLE_NAME(),
        Key: { clientId, scheduleId },
      })
    )
    return (result.Item as ScheduledAction | undefined) ?? null
  } catch (error) {
    throw new Error(
      `Failed to get scheduled action ${scheduleId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function updateScheduledAction(
  clientId: string,
  scheduleId: string,
  updates: Partial<Pick<ScheduledAction, 'cadence' | 'enabled'>>
): Promise<ScheduledAction> {
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
        TableName: TABLE_NAME(),
        Key: { clientId, scheduleId },
        UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      })
    )
    return result.Attributes as ScheduledAction
  } catch (error) {
    throw new Error(
      `Failed to update scheduled action ${scheduleId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function deleteScheduledAction(clientId: string, scheduleId: string): Promise<void> {
  try {
    await dynamoClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME(),
        Key: { clientId, scheduleId },
      })
    )
  } catch (error) {
    throw new Error(
      `Failed to delete scheduled action ${scheduleId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
