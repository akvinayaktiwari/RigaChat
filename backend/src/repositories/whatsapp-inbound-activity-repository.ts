import { GetCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from './dynamo-client.js'

const TABLE_NAME = (): string => getTableName('whatsapp_inbound_activity')

export interface WhatsAppLeadActivity {
  leadId: string
  lastInboundMessageAt?: string
  optedOutAt?: string
  resumeWindowStartedAt?: string
  resumeCount?: number
}

// One row per lead. This started as "when did this lead last message us" for
// whatsapp-service.ts's hasActiveWhatsAppSession() 24h check, and now also
// carries opt-out state and the journey-resume rate counter -- all per-lead
// WhatsApp facts, same key, so they belong together rather than in three tables.
//
// UPDATE, not Put. It used to overwrite the whole item, which was fine when
// lastInboundMessageAt was the only field but would now silently erase a lead's
// opt-out on their next inbound message -- i.e. un-opt-out someone for messaging
// you. Every writer here touches only its own attributes.
export async function recordInboundMessage(leadId: string): Promise<void> {
  try {
    await dynamoClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME(),
        Key: { leadId },
        UpdateExpression: 'SET lastInboundMessageAt = :now',
        ExpressionAttributeValues: { ':now': new Date().toISOString() },
      })
    )
  } catch (error) {
    throw new Error(
      `Failed to record inbound WhatsApp message for lead ${leadId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getLeadActivity(leadId: string): Promise<WhatsAppLeadActivity | null> {
  try {
    const result = await dynamoClient.send(
      new GetCommand({
        TableName: TABLE_NAME(),
        Key: { leadId },
      })
    )
    return (result.Item as WhatsAppLeadActivity | undefined) ?? null
  } catch (error) {
    throw new Error(
      `Failed to get WhatsApp activity for lead ${leadId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getLastInboundMessageAt(leadId: string): Promise<string | null> {
  return (await getLeadActivity(leadId))?.lastInboundMessageAt ?? null
}

// Deliberately never cleared by anything in this codebase. Re-subscribing a
// lead who asked to stop should be an explicit, auditable act by the client,
// not a side effect of some other write -- and certainly not something an
// inbound message can do implicitly.
export async function recordOptOut(leadId: string): Promise<void> {
  try {
    await dynamoClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME(),
        Key: { leadId },
        UpdateExpression: 'SET optedOutAt = :now',
        ExpressionAttributeValues: { ':now': new Date().toISOString() },
      })
    )
  } catch (error) {
    throw new Error(
      `Failed to record opt-out for lead ${leadId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function isOptedOut(leadId: string): Promise<boolean> {
  return Boolean((await getLeadActivity(leadId))?.optedOutAt)
}

// Defence in depth, NOT the primary control. Resuming a journey already
// requires a callback token this system stored against this lead and deletes on
// use, and a new token only exists once the journey reaches another await_reply
// -- so a flood of forged inbound messages is already bounded by the journey's
// own shape. This caps the blast radius if that reasoning is ever wrong.
//
// Read-then-write rather than a single atomic expression: the window reset makes
// an atomic form awkward, and losing a race here costs at most one extra resume
// on a control that is already a backstop.
export async function consumeResumeAllowance(
  leadId: string,
  maxPerWindow: number,
  windowMs: number
): Promise<boolean> {
  const activity = await getLeadActivity(leadId)
  const now = Date.now()
  const windowStart = activity?.resumeWindowStartedAt ? Date.parse(activity.resumeWindowStartedAt) : 0
  const windowIsStale = !windowStart || now - windowStart >= windowMs
  const used = windowIsStale ? 0 : (activity?.resumeCount ?? 0)

  if (used >= maxPerWindow) return false

  try {
    await dynamoClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME(),
        Key: { leadId },
        UpdateExpression: 'SET resumeWindowStartedAt = :start, resumeCount = :count',
        ExpressionAttributeValues: {
          ':start': windowIsStale ? new Date(now).toISOString() : (activity?.resumeWindowStartedAt as string),
          ':count': used + 1,
        },
      })
    )
    return true
  } catch (error) {
    throw new Error(
      `Failed to consume resume allowance for lead ${leadId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

// Erasure only. Dropping this row also closes the lead's 24h session window,
// which is correct: there is no longer a lead to hold a conversation with.
export async function deleteInboundActivity(leadId: string): Promise<void> {
  try {
    await dynamoClient.send(new DeleteCommand({ TableName: TABLE_NAME(), Key: { leadId } }))
  } catch (error) {
    throw new Error(
      `Failed to delete WhatsApp activity for lead ${leadId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
