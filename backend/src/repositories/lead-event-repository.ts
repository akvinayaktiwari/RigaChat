import { v4 as uuidv4 } from 'uuid'
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from './dynamo-client.js'
import type { AppendLeadEventInput, LeadEvent } from '../types/index.js'

const TABLE_NAME = (): string => getTableName('lead_events')

// Sparse GSI: only message_out rows carry a wamid, so only they appear here.
// Exists because a Meta delivery-status webhook gives you a wamid and a
// recipient and NO leadId -- without this index a status can never be attached
// to the message it is about, and "delivered" ticks in the timeline are
// impossible. Written by the send path, read by the status path.
const WAMID_INDEX = 'wamid-index'

const CLIENT_INDEX = 'clientId-ts-index'

// `${iso}#${uuid}`: the ISO prefix gives chronological ordering straight from a
// Query with no client-side sort, and the uuid suffix stops two events written
// in the same millisecond from overwriting each other on the key. Both halves
// are load-bearing; dropping the suffix silently loses events under
// concurrency, which is exactly what a burst of delivery statuses looks like.
function sortKey(occurredAt: string): string {
  return `${occurredAt}#${uuidv4()}`
}

// -------------------------------------------------------------------------
// NEVER THROWS. Every caller is on a path where the event is the least valuable
// thing in flight: a lead being captured, a message being sent, a webhook being
// answered. Failing a real send because an audit row could not be written would
// trade the thing of value for the record of it. Failures are logged loudly and
// swallowed.
//
// The cost of that choice is that the log can have holes, so it must never be
// treated as a transactional source of truth (e.g. do not compute billing from
// it). It is a record for humans and the timeline UI.
// -------------------------------------------------------------------------
export async function appendLeadEvent(input: AppendLeadEventInput): Promise<void> {
  const occurredAt = input.occurredAt ?? new Date().toISOString()
  const { occurredAt: _ignored, ...rest } = input

  const record: LeadEvent = { ...rest, ts: sortKey(occurredAt) }

  // DynamoDB rejects undefined attribute values, and this shape is mostly
  // optional fields, so strip them rather than making every caller do it.
  const item = Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined)
  )

  try {
    await dynamoClient.send(new PutCommand({ TableName: TABLE_NAME(), Item: item }))
  } catch (error) {
    console.error(
      `[lead-events] failed to append ${input.type} for lead ${input.leadId}:`,
      error instanceof Error ? error.message : error
    )
  }
}

// Chronological. Returns [] rather than throwing when a lead has no events,
// because "nothing happened yet" is the normal state for a fresh lead and the
// timeline UI must render an empty state, not an error.
export async function getLeadEvents(leadId: string, limit?: number): Promise<LeadEvent[]> {
  try {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME(),
        KeyConditionExpression: 'leadId = :leadId',
        ExpressionAttributeValues: { ':leadId': leadId },
        ScanIndexForward: true,
        ...(limit !== undefined ? { Limit: limit } : {}),
      })
    )
    return (result.Items as LeadEvent[] | undefined) ?? []
  } catch (error) {
    throw new Error(
      `Failed to read events for lead ${leadId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

// Resolves a Meta wamid back to the message_out event that produced it, which
// is how a status webhook finds its lead. Returns null when the wamid is not
// ours -- a status for the client-notification template or a manual smoke-test
// send has no lead behind it, and that is normal, not an error.
export async function getEventByWamid(wamid: string): Promise<LeadEvent | null> {
  try {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME(),
        IndexName: WAMID_INDEX,
        KeyConditionExpression: 'wamid = :wamid',
        ExpressionAttributeValues: { ':wamid': wamid },
        Limit: 1,
      })
    )
    const items = (result.Items as LeadEvent[] | undefined) ?? []
    return items[0] ?? null
  } catch (error) {
    console.error(
      `[lead-events] wamid lookup failed for ${wamid}:`,
      error instanceof Error ? error.message : error
    )
    return null
  }
}

// Cross-lead feed for a client, newest first. Powers the digest and any
// client-level activity view. Paginated by the caller via `limit` rather than
// returning everything, unlike getLeadsByClientId, whose unbounded read is a
// known problem on the inbound hot path.
export async function getClientEvents(clientId: string, limit = 100): Promise<LeadEvent[]> {
  try {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME(),
        IndexName: CLIENT_INDEX,
        KeyConditionExpression: 'clientId = :clientId',
        ExpressionAttributeValues: { ':clientId': clientId },
        ScanIndexForward: false,
        Limit: limit,
      })
    )
    return (result.Items as LeadEvent[] | undefined) ?? []
  } catch (error) {
    throw new Error(
      `Failed to read events for client ${clientId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

// Counts inbound-created leads for a client since a timestamp, for #10's spam
// guard. Reuses the client index rather than adding a counter table: the
// lead_captured events are already there, already partitioned by client, and
// already sorted by time, so the cap is a bounded Query rather than new state to
// keep consistent.
//
// Counts only WhatsApp-channel captures. A client running a busy web widget must
// not have their widget traffic starve the WhatsApp path.
export async function countInboundLeadsSince(clientId: string, sinceIso: string): Promise<number> {
  try {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME(),
        IndexName: CLIENT_INDEX,
        KeyConditionExpression: 'clientId = :clientId AND ts > :since',
        FilterExpression: '#type = :type AND channel = :channel',
        ExpressionAttributeNames: { '#type': 'type' },
        ExpressionAttributeValues: {
          ':clientId': clientId,
          ':since': sinceIso,
          ':type': 'lead_captured',
          ':channel': 'whatsapp',
        },
        Select: 'COUNT',
      })
    )
    return result.Count ?? 0
  } catch (error) {
    // Fail OPEN with a loud log. A broken counter must not stop a real lead
    // reaching a client; the cap exists to blunt abuse, not to gate the product.
    console.error(
      `[lead-events] inbound lead count failed for client ${clientId}:`,
      error instanceof Error ? error.message : error
    )
    return 0
  }
}
