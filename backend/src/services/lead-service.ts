import {
  createLead,
  getLeadById,
  getLeadsByBotId,
  getLeadsByClientId,
} from '../repositories/lead-repository.js'
import { markLeadCaptured } from '../repositories/conversation-repository.js'
import { sendLeadNotification } from './whatsapp-service.js'
import type { Lead } from '../types/index.js'

interface CreateLeadInput {
  botId: string
  clientId: string
  conversationId: string
  name?: string
  phone?: string
  email?: string
  propertyInterest?: string
  budgetRange?: string
  chatTranscript: string
  sourceUrl: string
}

export async function captureLead(input: CreateLeadInput): Promise<Lead> {
  try {
    const lead = await createLead({
      botId: input.botId,
      clientId: input.clientId,
      ...(input.name ? { name: input.name } : {}),
      ...(input.phone ? { phone: input.phone } : {}),
      ...(input.email ? { email: input.email } : {}),
      propertyInterest: input.propertyInterest,
      budgetRange: input.budgetRange,
      chatTranscript: input.chatTranscript,
      sourceUrl: input.sourceUrl,
    })

    await markLeadCaptured(input.botId, input.conversationId)

    const contactLines = [
      lead.name ? `Name: ${lead.name}` : null,
      lead.phone ? `Phone: ${lead.phone}` : null,
      lead.email ? `Email: ${lead.email}` : null,
      `Source: ${lead.sourceUrl}`,
    ].filter((line): line is string => line !== null)

    // Never fails lead capture (sendLeadNotification always resolves, never
    // throws) — but must be awaited, not truly fire-and-forget: AWS Lambda
    // freezes the execution environment as soon as the handler's response
    // promise resolves, so an un-awaited async call here would be aborted
    // mid-flight before the KMS decrypt / Gupshup request ever completed.
    await sendLeadNotification(input.clientId, contactLines.join('\n')).catch(
      (err) => console.error('WhatsApp notification error:', err)
    )

    return lead
  } catch (error) {
    throw new Error(
      `Failed to capture lead for bot ${input.botId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getLeadsForBot(botId: string, limit?: number): Promise<Lead[]> {
  try {
    return await getLeadsByBotId(botId, limit)
  } catch (error) {
    throw new Error(
      `Failed to get leads for bot ${botId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getLeadsForClient(clientId: string): Promise<Lead[]> {
  try {
    return await getLeadsByClientId(clientId)
  } catch (error) {
    throw new Error(
      `Failed to get leads for client ${clientId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getLeadDetail(botId: string, leadId: string): Promise<Lead> {
  const lead = await getLeadById(botId, leadId)
  if (!lead) {
    throw new Error('Lead not found')
  }
  return lead
}
