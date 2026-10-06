// Developer API keys.
//
// PK keyHash, GSI clientId-createdAt-index. The partition key is the hash
// because a /v1 request arrives carrying a key and nothing else -- no clientId
// to address a row by -- and authenticating it has to be a point read. Same
// shape as voice_phone_lookup and meta_page_lookup, for the same reason.
//
// The GSI serves the dashboard only ("which keys does this account have?") and
// is never on the request path.

import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from './dynamo-client.js'
import type { ApiKeyRecord } from '../types/index.js'

const TABLE_NAME = (): string => getTableName('api_keys')

function isConditionalCheckFailure(error: unknown): boolean {
  return error instanceof Error && error.name === 'ConditionalCheckFailedException'
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function putApiKey(record: ApiKeyRecord): Promise<void> {
  try {
    await dynamoClient.send(
      new PutCommand({
        TableName: TABLE_NAME(),
        Item: record,
        // A collision on 192 random bits will not happen, but if it ever did an
        // unconditional Put would hand one account's key to another.
        ConditionExpression: 'attribute_not_exists(keyHash)',
      })
    )
  } catch (error) {
    throw new Error(`Failed to store API key ${record.keyId} for ${record.clientId}: ${describe(error)}`)
  }
}

// The read on every /v1 request. Strongly consistent so a revoked key stops
// working on the next request rather than whenever replication catches up.
export async function getApiKeyByHash(keyHash: string): Promise<ApiKeyRecord | null> {
  try {
    const result = await dynamoClient.send(
      new GetCommand({ TableName: TABLE_NAME(), Key: { keyHash }, ConsistentRead: true })
    )
    return (result.Item as ApiKeyRecord | undefined) ?? null
  } catch (error) {
    throw new Error(`Failed to look up API key: ${describe(error)}`)
  }
}

// Newest first. Eventually consistent, like every GSI read: a caller that has
// just created a key should use what it wrote rather than reading it back here.
export async function getApiKeysForClient(clientId: string): Promise<ApiKeyRecord[]> {
  try {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME(),
        IndexName: 'clientId-createdAt-index',
        KeyConditionExpression: 'clientId = :clientId',
        ExpressionAttributeValues: { ':clientId': clientId },
        ScanIndexForward: false,
      })
    )
    return (result.Items as ApiKeyRecord[] | undefined) ?? []
  } catch (error) {
    throw new Error(`Failed to list API keys for ${clientId}: ${describe(error)}`)
  }
}

// Returns false when the row is missing or belongs to another client. The
// ownership check is in the condition, not in a read before the delete, so
// there is no window in which it can be true and then stop being true.
export async function deleteApiKey(keyHash: string, clientId: string): Promise<boolean> {
  try {
    await dynamoClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME(),
        Key: { keyHash },
        ConditionExpression: 'clientId = :clientId',
        ExpressionAttributeValues: { ':clientId': clientId },
      })
    )
    return true
  } catch (error) {
    if (isConditionalCheckFailure(error)) return false
    throw new Error(`Failed to delete API key for ${clientId}: ${describe(error)}`)
  }
}

// Changes what a key may do without changing the key. Returns null when the row
// is missing or belongs to another client: as in deleteApiKey the ownership
// check is the condition itself, and a missing row fails it too, so this can
// never create a row for a key that was revoked a moment ago.
export async function updateApiKeyScopes(
  keyHash: string,
  clientId: string,
  scopes: ApiKeyRecord['scopes'],
  updatedAt: string
): Promise<ApiKeyRecord | null> {
  try {
    const result = await dynamoClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME(),
        Key: { keyHash },
        UpdateExpression: 'SET scopes = :scopes, scopesUpdatedAt = :updatedAt',
        ConditionExpression: 'clientId = :clientId',
        ExpressionAttributeValues: { ':scopes': scopes, ':updatedAt': updatedAt, ':clientId': clientId },
        ReturnValues: 'ALL_NEW',
      })
    )
    return (result.Attributes as ApiKeyRecord | undefined) ?? null
  } catch (error) {
    if (isConditionalCheckFailure(error)) return null
    throw new Error(`Failed to update API key scopes for ${clientId}: ${describe(error)}`)
  }
}

// attribute_exists is load-bearing. UpdateItem CREATES a missing item, so
// without the condition a request that raced a revocation would write back a
// row holding only keyHash and lastUsedAt -- a revoked key resurrected with no
// clientId on it.
export async function touchApiKeyLastUsed(keyHash: string, usedAt: string): Promise<void> {
  try {
    await dynamoClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME(),
        Key: { keyHash },
        UpdateExpression: 'SET lastUsedAt = :usedAt',
        ConditionExpression: 'attribute_exists(keyHash)',
        ExpressionAttributeValues: { ':usedAt': usedAt },
      })
    )
  } catch (error) {
    if (isConditionalCheckFailure(error)) return
    throw new Error(`Failed to record API key use: ${describe(error)}`)
  }
}
