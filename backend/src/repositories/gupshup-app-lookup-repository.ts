import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from './dynamo-client.js'

const TABLE_NAME = getTableName('gupshup_app_lookup')

export class GupshupAppConflictError extends Error {
  constructor(appName: string) {
    super(`Gupshup app "${appName}" is already mapped to a different client`)
    this.name = 'GupshupAppConflictError'
  }
}

// appName -> clientId lookup, used to route the single shared /webhooks/gupshup
// endpoint to the right client -- Gupshup's inbound webhook payload carries a
// top-level "app" field naming the Gupshup app the event is for (confirmed
// against their docs), which matches client.whatsappConnection.appName at
// connect time. Own table, not a GSI on the clients table, mirroring
// meta-lead-repository.ts's meta_page_lookup exactly -- same reasoning
// (design doc Premise 4): a client reconnecting is an additive row, not a
// schema change.
//
// Atomic claim via ConditionExpression, not a plain read-then-write: two
// clients racing to connect an app with the same name (however unlikely --
// appName uniqueness is only guaranteed within one Gupshup account, not
// globally across every client's own account) would otherwise have a race
// window where both pass a read check before either writes.
export async function setGupshupAppClientMapping(appName: string, clientId: string): Promise<void> {
  try {
    await dynamoClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: { appName, clientId, connectedAt: new Date().toISOString() },
        ConditionExpression: 'attribute_not_exists(appName) OR clientId = :clientId',
        ExpressionAttributeValues: { ':clientId': clientId },
      })
    )
  } catch (error) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
      throw new GupshupAppConflictError(appName)
    }
    throw new Error(
      `Failed to map Gupshup app ${appName} to client ${clientId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getClientIdForGupshupApp(appName: string): Promise<string | null> {
  try {
    const result = await dynamoClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { appName },
      })
    )
    return (result.Item?.clientId as string | undefined) ?? null
  } catch (error) {
    throw new Error(
      `Failed to look up client for Gupshup app ${appName}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function removeGupshupAppClientMapping(appName: string): Promise<void> {
  try {
    await dynamoClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { appName },
      })
    )
  } catch (error) {
    throw new Error(
      `Failed to remove Gupshup app mapping ${appName}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
