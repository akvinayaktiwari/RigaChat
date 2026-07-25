import { v4 as uuidv4 } from 'uuid'
import { DeleteCommand, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from './dynamo-client.js'
import { updatePartialFields } from '../lib/dynamo-update.js'
import type { MetaLead } from '../types/index.js'

const LEADS_TABLE_NAME = getTableName('meta_leads')
const PAGE_LOOKUP_TABLE_NAME = getTableName('meta_page_lookup')

export async function createMetaLead(data: Omit<MetaLead, 'leadId' | 'createdAt'>): Promise<MetaLead> {
  const record: MetaLead = { ...data, leadId: uuidv4(), createdAt: new Date().toISOString() }

  try {
    await dynamoClient.send(
      new PutCommand({
        TableName: LEADS_TABLE_NAME,
        Item: record,
      })
    )
    return record
  } catch (error) {
    throw new Error(
      `Failed to create Meta lead for client ${data.clientId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getMetaLeadsByClientId(clientId: string, limit = 50): Promise<MetaLead[]> {
  try {
    // Queries the clientId-createdAt-index GSI, not the base table --
    // the base table's range key is leadId (a UUID, for collision-safety),
    // which doesn't sort chronologically. This GSI does.
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: LEADS_TABLE_NAME,
        IndexName: 'clientId-createdAt-index',
        KeyConditionExpression: 'clientId = :clientId',
        ExpressionAttributeValues: { ':clientId': clientId },
        ScanIndexForward: false,
        Limit: limit,
      })
    )
    return (result.Items as MetaLead[] | undefined) ?? []
  } catch (error) {
    throw new Error(
      `Failed to get Meta leads for client ${clientId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export interface MetaLeadSyncStatus {
  crmSynced?: boolean
  crmSyncedAt?: string
  crmExternalId?: string
  crmSyncError?: string
  crmSyncAttempts?: number
}

export async function updateMetaLeadSyncStatus(
  clientId: string,
  leadId: string,
  status: MetaLeadSyncStatus
): Promise<void> {
  try {
    await updatePartialFields(LEADS_TABLE_NAME, { clientId, leadId }, status as Record<string, unknown>)
  } catch (error) {
    throw new Error(
      `Failed to update sync status for Meta lead (client ${clientId}, ${leadId}): ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

// Thrown when the atomic claim below loses a race to another client
// connecting the same Page concurrently. Distinct from a generic failure so
// callers (meta-lead-service.ts) can translate it into a clear connect error
// instead of a 500.
export class MetaPageConflictError extends Error {
  constructor(pageId: string) {
    super(`Meta page ${pageId} is already claimed by another client`)
    this.name = 'MetaPageConflictError'
  }
}

// pageId -> clientId lookup, used to route the shared app-level Meta
// webhook. Its own table (not a field on ClientRecord) so a client
// connecting a second Page later is an additive new row, not a schema
// change -- see design doc Premise 4.
//
// The ConditionExpression makes this an ATOMIC claim, not a check-then-act:
// a plain read-then-write (getClientIdForPage, then this Put) has a race
// window where two clients completing OAuth for the same Page concurrently
// could both pass the read check before either writes. This condition lets
// DynamoDB itself reject the losing write instead.
export async function setPageClientMapping(pageId: string, clientId: string): Promise<void> {
  try {
    await dynamoClient.send(
      new PutCommand({
        TableName: PAGE_LOOKUP_TABLE_NAME,
        Item: { pageId, clientId, connectedAt: new Date().toISOString() },
        ConditionExpression: 'attribute_not_exists(pageId) OR clientId = :clientId',
        ExpressionAttributeValues: { ':clientId': clientId },
      })
    )
  } catch (error) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
      throw new MetaPageConflictError(pageId)
    }
    throw new Error(
      `Failed to map Meta page ${pageId} to client ${clientId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getClientIdForPage(pageId: string): Promise<string | null> {
  try {
    const result = await dynamoClient.send(
      new GetCommand({
        TableName: PAGE_LOOKUP_TABLE_NAME,
        Key: { pageId },
      })
    )
    return (result.Item?.clientId as string | undefined) ?? null
  } catch (error) {
    throw new Error(
      `Failed to look up client for Meta page ${pageId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function removePageClientMapping(pageId: string): Promise<void> {
  try {
    await dynamoClient.send(
      new DeleteCommand({
        TableName: PAGE_LOOKUP_TABLE_NAME,
        Key: { pageId },
      })
    )
  } catch (error) {
    throw new Error(
      `Failed to remove Meta page mapping ${pageId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
