// One row per mobile install, so a lead alert can reach a phone.
//
// PK clientId, SK deviceId. No GSI, because there is exactly one access
// pattern: "every device belonging to this client", which is a Query on the
// partition key. Same reasoning as meta-deletion-requests-repository -- an
// index with no reader is a cost and a second thing to keep consistent.
//
// clientId is the partition key rather than an attribute on purpose: it makes
// cross-tenant reads structurally impossible here, not merely conventional.
// Every function below takes clientId first and it always comes from the JWT.

import { DeleteCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from './dynamo-client.js'
import type { DevicePlatform, DeviceToken } from '../types/index.js'

const TABLE_NAME = (): string => getTableName('device_tokens')

export interface RegisterDeviceInput {
  clientId: string
  deviceId: string
  expoPushToken: string
  platform: DevicePlatform
  appVersion: string
}

// UPDATE, not Put. The app calls this on every login AND on every token
// rotation, so it must be idempotent: a Put would reset registeredAt on each
// call and lose the original registration date. if_not_exists keeps the first
// value for the fields this module owns and overwrites only what the caller
// actually sent.
export async function upsertDeviceToken(input: RegisterDeviceInput): Promise<DeviceToken> {
  const now = new Date().toISOString()

  const result = await dynamoClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME(),
      Key: { clientId: input.clientId, deviceId: input.deviceId },
      UpdateExpression: [
        'SET #expoPushToken = :expoPushToken',
        '#platform = :platform',
        '#appVersion = :appVersion',
        '#lastSeenAt = :now',
        '#registeredAt = if_not_exists(#registeredAt, :now)',
        // Reset rather than if_not_exists: a re-register is the app telling us
        // this install is alive again, which retires whatever failure count a
        // previous token on the same device accumulated.
        '#failureCount = :zero',
      ].join(', '),
      ExpressionAttributeNames: {
        '#expoPushToken': 'expoPushToken',
        '#platform': 'platform',
        '#appVersion': 'appVersion',
        '#lastSeenAt': 'lastSeenAt',
        '#registeredAt': 'registeredAt',
        '#failureCount': 'failureCount',
      },
      ExpressionAttributeValues: {
        ':expoPushToken': input.expoPushToken,
        ':platform': input.platform,
        ':appVersion': input.appVersion,
        ':now': now,
        ':zero': 0,
      },
      ReturnValues: 'ALL_NEW',
    })
  )

  return result.Attributes as DeviceToken
}

export async function getDeviceTokensForClient(clientId: string): Promise<DeviceToken[]> {
  const result = await dynamoClient.send(
    new QueryCommand({
      TableName: TABLE_NAME(),
      KeyConditionExpression: 'clientId = :clientId',
      ExpressionAttributeValues: { ':clientId': clientId },
    })
  )

  return (result.Items ?? []) as DeviceToken[]
}

// Idempotent by DynamoDB's own semantics: deleting a row that is not there
// succeeds. That is what lets the route answer 200 on a second sign-out
// without a read-before-delete.
export async function deleteDeviceToken(clientId: string, deviceId: string): Promise<void> {
  await dynamoClient.send(
    new DeleteCommand({
      TableName: TABLE_NAME(),
      Key: { clientId, deviceId },
    })
  )
}

// Called when Expo reports a token permanently dead (DeviceNotRegistered),
// which means the app was uninstalled or the token was revoked. Deleting on
// the first such report rather than counting up: Expo only returns this code
// once it is certain, and a dead token that stays in the table is a wasted
// send on every future lead, forever.
export async function retireDeviceToken(clientId: string, deviceId: string): Promise<void> {
  await deleteDeviceToken(clientId, deviceId)
}
