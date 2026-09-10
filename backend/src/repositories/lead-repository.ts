import { v4 as uuidv4 } from 'uuid'
import { GetCommand, PutCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from './dynamo-client.js'
import type { Lead } from '../types/index.js'

const TABLE_NAME = (): string => getTableName('leads')

export async function createLead(data: Omit<Lead, 'leadId' | 'createdAt'>): Promise<Lead> {
  const record: Lead = { ...data, leadId: uuidv4(), createdAt: new Date().toISOString() }

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
      `Failed to create lead for bot ${data.botId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getLeadsByBotId(botId: string, limit = 50): Promise<Lead[]> {
  try {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME(),
        KeyConditionExpression: 'botId = :botId',
        ExpressionAttributeValues: { ':botId': botId },
        ScanIndexForward: false,
        Limit: limit,
      })
    )
    return (result.Items as Lead[] | undefined) ?? []
  } catch (error) {
    throw new Error(
      `Failed to get leads for bot ${botId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getLeadById(botId: string, leadId: string): Promise<Lead | null> {
  try {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME(),
        IndexName: 'leadId-index',
        KeyConditionExpression: 'leadId = :leadId',
        FilterExpression: 'botId = :botId',
        ExpressionAttributeValues: { ':botId': botId, ':leadId': leadId },
      })
    )
    const items = (result.Items as Lead[] | undefined) ?? []
    return items[0] ?? null
  } catch (error) {
    throw new Error(
      `Failed to get lead ${leadId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

// A hard stop on how many pages this will walk. Not a correctness limit -- a
// runaway guard, so a pathological client cannot turn one inbound message into
// an unbounded read. At 1MB per page this is 50MB of leads, far beyond anything
// the ordering rule below could meaningfully choose between.
const MAX_CLIENT_LEAD_PAGES = 50

// Follows LastEvaluatedKey, which it did not before.
//
// DynamoDB caps a Query response at 1MB and stops, handing back a cursor. This
// function ignored the cursor and returned the first page as though it were the
// whole answer -- so past 1MB a client's lead list was a truncated,
// non-deterministic subset with nothing to say so.
//
// That matters most where it is least visible. lead-identity-service asks this
// "is this phone number someone we know?" on every inbound WhatsApp message and
// every phone call. A truncated list answers "no" for someone whose lead is
// sitting in the part that was not read, and the caller becomes a stranger: a
// second lead, a second history, no error anywhere.
//
// Not reachable in production today (the largest lead table is ~20KB), which is
// why this is worth fixing now rather than after it starts happening.
export async function getLeadsByClientId(clientId: string): Promise<Lead[]> {
  const leads: Lead[] = []
  let cursor: Record<string, unknown> | undefined
  let pages = 0

  try {
    do {
      const result = await dynamoClient.send(
        new QueryCommand({
          TableName: TABLE_NAME(),
          IndexName: 'clientId-index',
          KeyConditionExpression: 'clientId = :clientId',
          ExpressionAttributeValues: { ':clientId': clientId },
          ScanIndexForward: false,
          ExclusiveStartKey: cursor,
        })
      )

      leads.push(...((result.Items as Lead[] | undefined) ?? []))
      cursor = result.LastEvaluatedKey
      pages += 1
    } while (cursor && pages < MAX_CLIENT_LEAD_PAGES)

    // If the guard stopped us, the list IS incomplete -- say so. Silent
    // truncation is the failure this function just stopped having; swapping it
    // for a quieter one at a higher threshold would miss the point.
    if (cursor) {
      console.error(
        `[lead-repository] client ${clientId} has more than ${MAX_CLIENT_LEAD_PAGES} pages of leads; ` +
          `returning ${leads.length} and stopping. Any phone-number match over this client is now unreliable.`
      )
    }

    return leads
  } catch (error) {
    throw new Error(
      `Failed to get leads for client ${clientId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

// Erasure only.
//
// The awkward one of the three lead tables: `leads` is keyed by
// (botId, createdAt), NOT by leadId, so a leadId alone cannot address a row.
// The leadId-index gives us the createdAt, and only then is a delete possible.
// Returns false when the lead is already gone, so a retried erasure after a
// partial failure is a no-op rather than an error.
export async function deleteLead(botId: string, leadId: string): Promise<boolean> {
  const lead = await getLeadById(botId, leadId)
  if (!lead) return false

  try {
    await dynamoClient.send(
      new DeleteCommand({ TableName: TABLE_NAME(), Key: { botId: lead.botId, createdAt: lead.createdAt } })
    )
    return true
  } catch (error) {
    throw new Error(
      `Failed to delete lead ${leadId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
