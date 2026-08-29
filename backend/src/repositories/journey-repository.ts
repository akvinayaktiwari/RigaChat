import { v4 as uuidv4 } from 'uuid'
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from './dynamo-client.js'
import type { JourneyBundle, JourneyBundleStatus } from '../types/index.js'

const TABLE_NAME = (): string => getTableName('journeys')

// A state transition lost the race: the bundle was deleted, or another request
// already moved it out of the status this caller read. Its own error type so
// the service layer can turn it into the same 400 the up-front status guard
// produces, rather than surfacing a raw DynamoDB condition failure as a 500.
export class JourneyBundleStateConflictError extends Error {
  constructor(
    readonly bundleId: string,
    readonly expectedStatus: JourneyBundleStatus
  ) {
    super(`Journey bundle ${bundleId} is no longer ${expectedStatus}`)
    this.name = 'JourneyBundleStateConflictError'
  }
}

export async function createJourneyBundle(
  data: Omit<JourneyBundle, 'bundleId' | 'createdAt' | 'updatedAt'>
): Promise<JourneyBundle> {
  const now = new Date().toISOString()
  const record: JourneyBundle = { ...data, bundleId: uuidv4(), createdAt: now, updatedAt: now }

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
      `Failed to create Journey bundle for bot ${data.botId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getJourneyBundlesByBotId(botId: string): Promise<JourneyBundle[]> {
  try {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME(),
        KeyConditionExpression: 'botId = :botId',
        ExpressionAttributeValues: { ':botId': botId },
      })
    )
    return (result.Items as JourneyBundle[] | undefined) ?? []
  } catch (error) {
    throw new Error(
      `Failed to get Journey bundles for bot ${botId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getJourneyBundleById(botId: string, bundleId: string): Promise<JourneyBundle | null> {
  try {
    const result = await dynamoClient.send(
      new GetCommand({
        TableName: TABLE_NAME(),
        Key: { botId, bundleId },
      })
    )
    return (result.Item as JourneyBundle | undefined) ?? null
  } catch (error) {
    throw new Error(`Failed to get Journey bundle ${bundleId}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export async function updateJourneyBundle(
  botId: string,
  bundleId: string,
  updates: Partial<
    Pick<
      JourneyBundle,
      | 'name'
      | 'description'
      | 'journey'
      | 'agent'
      | 'plan'
      | 'status'
      | 'compiledStateMachineArn'
      | 'compiledStateMachineVersionArn'
      | 'publishedVersion'
    >
  >,
  // Optional guard for status TRANSITIONS, as opposed to plain field edits.
  // Without it this is an UpdateCommand with no condition, which in DynamoDB is
  // an upsert: a caller racing a delete resurrects a ghost row carrying only the
  // keys it wrote. Callers that are moving a bundle from one state to another
  // pass the state they read, so losing the race fails loudly instead of
  // writing a status that contradicts what the rest of the record says.
  expectedStatus?: JourneyBundleStatus
): Promise<JourneyBundle> {
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
        Key: { botId, bundleId },
        UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ...(expectedStatus
          ? {
              // attribute_exists(bundleId) is what stops the upsert; the status
              // equality is what stops a stale transition landing on a bundle
              // someone else already moved.
              ConditionExpression: 'attribute_exists(bundleId) AND #expectedStatusAttr = :expectedStatus',
              ExpressionAttributeNames: { ...expressionAttributeNames, '#expectedStatusAttr': 'status' },
              ExpressionAttributeValues: {
                ...expressionAttributeValues,
                ':expectedStatus': expectedStatus,
              },
            }
          : {}),
        ReturnValues: 'ALL_NEW',
      })
    )
    return result.Attributes as JourneyBundle
  } catch (error) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
      throw new JourneyBundleStateConflictError(bundleId, expectedStatus as JourneyBundleStatus)
    }
    throw new Error(`Failed to update Journey bundle ${bundleId}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export async function deleteJourneyBundle(botId: string, bundleId: string): Promise<void> {
  try {
    await dynamoClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME(),
        Key: { botId, bundleId },
      })
    )
  } catch (error) {
    throw new Error(`Failed to delete Journey bundle ${bundleId}: ${error instanceof Error ? error.message : String(error)}`)
  }
}
