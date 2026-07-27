import { GetCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from './dynamo-client.js'
import type { ClientRecord } from '../types/index.js'

const TABLE_NAME = getTableName('clients')

export async function createClient(
  data: Omit<ClientRecord, 'createdAt' | 'updatedAt'>
): Promise<ClientRecord> {
  const now = new Date().toISOString()
  const record: ClientRecord = { ...data, createdAt: now, updatedAt: now }

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
      `Failed to create client ${data.clientId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getClientById(clientId: string): Promise<ClientRecord | null> {
  try {
    const result = await dynamoClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { clientId },
      })
    )
    return (result.Item as ClientRecord | undefined) ?? null
  } catch (error) {
    throw new Error(
      `Failed to get client ${clientId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getClientByEmail(email: string): Promise<ClientRecord | null> {
  try {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'email-index',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': email },
        Limit: 1,
      })
    )
    const items = (result.Items as ClientRecord[] | undefined) ?? []
    return items[0] ?? null
  } catch (error) {
    throw new Error(
      `Failed to get client by email ${email}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function updateClient(
  clientId: string,
  updates: Partial<Omit<ClientRecord, 'clientId' | 'createdAt'>>
): Promise<ClientRecord> {
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
        Key: { clientId },
        UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      })
    )
    return result.Attributes as ClientRecord
  } catch (error) {
    throw new Error(
      `Failed to update client ${clientId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function removeClientCRMConnection(clientId: string): Promise<void> {
  try {
    await dynamoClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { clientId },
        UpdateExpression: 'REMOVE crmConnection SET updatedAt = :updatedAt',
        ExpressionAttributeValues: { ':updatedAt': new Date().toISOString() },
      })
    )
  } catch (error) {
    throw new Error(
      `Failed to remove CRM connection for client ${clientId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function removeClientWhatsAppConnection(clientId: string): Promise<void> {
  try {
    await dynamoClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { clientId },
        UpdateExpression: 'REMOVE whatsappConnection SET updatedAt = :updatedAt',
        ExpressionAttributeValues: { ':updatedAt': new Date().toISOString() },
      })
    )
  } catch (error) {
    throw new Error(
      `Failed to remove WhatsApp connection for client ${clientId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function removeClientMetaDirectWhatsAppConnection(clientId: string): Promise<void> {
  try {
    await dynamoClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { clientId },
        UpdateExpression: 'REMOVE metaDirectWhatsAppConnection SET updatedAt = :updatedAt',
        ExpressionAttributeValues: { ':updatedAt': new Date().toISOString() },
      })
    )
  } catch (error) {
    throw new Error(
      `Failed to remove Meta Direct WhatsApp connection for client ${clientId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function clearActiveWhatsappProvider(clientId: string): Promise<void> {
  try {
    await dynamoClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { clientId },
        UpdateExpression: 'REMOVE activeWhatsappProvider SET updatedAt = :updatedAt',
        ExpressionAttributeValues: { ':updatedAt': new Date().toISOString() },
      })
    )
  } catch (error) {
    throw new Error(
      `Failed to clear active WhatsApp provider for client ${clientId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function removeClientMetaConnection(clientId: string): Promise<void> {
  try {
    await dynamoClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { clientId },
        UpdateExpression: 'REMOVE metaConnection SET updatedAt = :updatedAt',
        ExpressionAttributeValues: { ':updatedAt': new Date().toISOString() },
      })
    )
  } catch (error) {
    throw new Error(
      `Failed to remove Meta connection for client ${clientId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getAllClients(): Promise<ClientRecord[]> {
  try {
    const clients: ClientRecord[] = []
    let exclusiveStartKey: Record<string, unknown> | undefined

    do {
      const result = await dynamoClient.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          ExclusiveStartKey: exclusiveStartKey,
        })
      )
      clients.push(...((result.Items as ClientRecord[] | undefined) ?? []))
      exclusiveStartKey = result.LastEvaluatedKey
    } while (exclusiveStartKey)

    return clients
  } catch (error) {
    throw new Error(
      `Failed to scan clients: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getConnectedWhatsAppClients(): Promise<ClientRecord[]> {
  try {
    const clients: ClientRecord[] = []
    let exclusiveStartKey: Record<string, unknown> | undefined

    do {
      const result = await dynamoClient.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          // OR'd across both connection shapes so a client connected ONLY via
          // Meta Direct (no Gupshup connection at all) still gets picked up -
          // this scan used to check whatsappConnection alone, which silently
          // excluded Meta-only clients from weekly reports.
          FilterExpression: 'whatsappConnection.connected = :connected OR metaDirectWhatsAppConnection.connected = :connected',
          ExpressionAttributeValues: { ':connected': true },
          ExclusiveStartKey: exclusiveStartKey,
        })
      )
      clients.push(...((result.Items as ClientRecord[] | undefined) ?? []))
      exclusiveStartKey = result.LastEvaluatedKey
    } while (exclusiveStartKey)

    return clients
  } catch (error) {
    throw new Error(
      `Failed to scan for WhatsApp-connected clients: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
