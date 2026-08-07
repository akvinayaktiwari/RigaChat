import { v4 as uuidv4 } from 'uuid'
import { GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from './dynamo-client.js'
import type { LeadNote, LeadState } from '../types/index.js'

const TABLE_NAME = (): string => getTableName('lead_state')

// PK leadId. The GSI is keyed clientId + updatedAt rather than clientId +
// nextActionAt on purpose: a nextActionAt-keyed index would be SPARSE, so any
// lead without a scheduled follow-up would silently vanish from a
// "states for this client" query -- which is most of them. Queue ordering by
// nextActionAt happens in the service, after the merge with lead records.
const CLIENT_INDEX = 'clientId-updatedAt-index'

// Every field a caller may set. Deliberately not Partial<LeadState>: leadId,
// clientId, createdAt and notes are owned by this module, not by callers.
export interface LeadStatePatch {
  status?: LeadState['status']
  outcome?: LeadState['outcome']
  ownerId?: string
  nextActionAt?: string
  lastTouchedAt?: string
  leadScore?: number
  replied?: boolean
  appointmentBooked?: boolean
}

const PATCHABLE_FIELDS = [
  'status',
  'outcome',
  'ownerId',
  'nextActionAt',
  'lastTouchedAt',
  'leadScore',
  'replied',
  'appointmentBooked',
] as const

interface UpdateFragments {
  setClauses: string[]
  removeClauses: string[]
  names: Record<string, string>
  values: Record<string, unknown>
}

// UPDATE with only the caller's own attributes, never Put. Two writers touch
// this row -- an operator logging a call, and the journey executor recording
// replied/leadScore -- and a whole-item Put from either would erase the
// other's work. Same reasoning as whatsapp-inbound-activity-repository.
//
// An explicitly-undefined field is a REMOVE, not a no-op: that is how a
// reopened lead clears its outcome and how a completed follow-up clears
// nextActionAt.
function buildUpdateFragments(patch: LeadStatePatch): UpdateFragments {
  const fragments: UpdateFragments = { setClauses: [], removeClauses: [], names: {}, values: {} }

  for (const field of PATCHABLE_FIELDS) {
    if (!(field in patch)) continue

    fragments.names[`#${field}`] = field
    if (patch[field] === undefined) {
      fragments.removeClauses.push(`#${field}`)
      continue
    }
    fragments.setClauses.push(`#${field} = :${field}`)
    fragments.values[`:${field}`] = patch[field]
  }

  return fragments
}

function buildUpdateExpression(fragments: UpdateFragments): string {
  const sets = [
    ...fragments.setClauses,
    '#updatedAt = :now',
    '#createdAt = if_not_exists(#createdAt, :now)',
    '#notes = if_not_exists(#notes, :emptyNotes)',
  ]

  const expression = `SET ${sets.join(', ')}`
  return fragments.removeClauses.length > 0
    ? `${expression} REMOVE ${fragments.removeClauses.join(', ')}`
    : expression
}

export async function upsertLeadState(
  leadId: string,
  clientId: string,
  patch: LeadStatePatch
): Promise<LeadState> {
  const now = new Date().toISOString()
  const fragments = buildUpdateFragments(patch)

  // clientId is written on every upsert so the row is ownership-checkable and
  // appears in the client index even when created by the journey executor.
  fragments.setClauses.push('#clientId = :clientId')
  fragments.names['#clientId'] = 'clientId'
  fragments.values[':clientId'] = clientId

  try {
    const result = await dynamoClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME(),
        Key: { leadId },
        UpdateExpression: buildUpdateExpression(fragments),
        ExpressionAttributeNames: {
          ...fragments.names,
          '#updatedAt': 'updatedAt',
          '#createdAt': 'createdAt',
          '#notes': 'notes',
        },
        ExpressionAttributeValues: { ...fragments.values, ':now': now, ':emptyNotes': [] },
        ReturnValues: 'ALL_NEW',
      })
    )
    return result.Attributes as LeadState
  } catch (error) {
    throw new Error(
      `Failed to update state for lead ${leadId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function appendLeadNote(
  leadId: string,
  clientId: string,
  body: string,
  authorId: string
): Promise<LeadState> {
  const now = new Date().toISOString()
  const note: LeadNote = { noteId: uuidv4(), body, authorId, createdAt: now }

  try {
    const result = await dynamoClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME(),
        Key: { leadId },
        // list_append onto if_not_exists so the first note on an untouched
        // lead creates the row instead of failing on a missing list.
        UpdateExpression:
          'SET #notes = list_append(if_not_exists(#notes, :empty), :note), ' +
          '#clientId = :clientId, #updatedAt = :now, #lastTouchedAt = :now, ' +
          '#createdAt = if_not_exists(#createdAt, :now), ' +
          '#status = if_not_exists(#status, :new)',
        ExpressionAttributeNames: {
          '#notes': 'notes',
          '#clientId': 'clientId',
          '#updatedAt': 'updatedAt',
          '#lastTouchedAt': 'lastTouchedAt',
          '#createdAt': 'createdAt',
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':note': [note],
          ':empty': [],
          ':clientId': clientId,
          ':now': now,
          ':new': 'new',
        },
        ReturnValues: 'ALL_NEW',
      })
    )
    return result.Attributes as LeadState
  } catch (error) {
    throw new Error(
      `Failed to append note to lead ${leadId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getLeadState(leadId: string): Promise<LeadState | null> {
  try {
    const result = await dynamoClient.send(
      new GetCommand({ TableName: TABLE_NAME(), Key: { leadId } })
    )
    return (result.Item as LeadState | undefined) ?? null
  } catch (error) {
    throw new Error(
      `Failed to get state for lead ${leadId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

// One query for the whole client rather than a BatchGet of every leadId on the
// page: the inbox already needs to merge against three lead tables, and a
// single index read is both cheaper and avoids BatchGet's 100-key chunking.
export async function getLeadStatesForClient(clientId: string): Promise<LeadState[]> {
  try {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME(),
        IndexName: CLIENT_INDEX,
        KeyConditionExpression: 'clientId = :clientId',
        ExpressionAttributeValues: { ':clientId': clientId },
        ScanIndexForward: false,
      })
    )
    return (result.Items as LeadState[] | undefined) ?? []
  } catch (error) {
    throw new Error(
      `Failed to get lead states for client ${clientId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
