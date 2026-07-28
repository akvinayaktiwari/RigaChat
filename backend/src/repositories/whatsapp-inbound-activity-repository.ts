import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from './dynamo-client.js'

const TABLE_NAME = getTableName('whatsapp_inbound_activity')

// One row per lead, always overwritten with the latest timestamp -- no
// history of every inbound message is kept here (that's what the
// conversations/webhook-event tables are for elsewhere in this codebase);
// this table exists solely to answer "when did this lead last message us,"
// which is what whatsapp-service.ts's hasActiveWhatsAppSession() checks
// against Meta's 24h session-window rule.
export async function recordInboundMessage(leadId: string): Promise<void> {
  try {
    await dynamoClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: { leadId, lastInboundMessageAt: new Date().toISOString() },
      })
    )
  } catch (error) {
    throw new Error(
      `Failed to record inbound WhatsApp message for lead ${leadId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getLastInboundMessageAt(leadId: string): Promise<string | null> {
  try {
    const result = await dynamoClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { leadId },
      })
    )
    return (result.Item?.lastInboundMessageAt as string | undefined) ?? null
  } catch (error) {
    throw new Error(
      `Failed to get last inbound WhatsApp message for lead ${leadId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
