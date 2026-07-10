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
  name: string
  phone: string
  email: string
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
      name: input.name,
      phone: input.phone,
      email: input.email,
      propertyInterest: input.propertyInterest,
      budgetRange: input.budgetRange,
      chatTranscript: input.chatTranscript,
      sourceUrl: input.sourceUrl,
    })

    await markLeadCaptured(input.botId, input.conversationId)

    // Fire-and-forget: WhatsApp notification never blocks or fails lead capture.
    sendLeadNotification(input.clientId, `Name: ${lead.name}\nPhone: ${lead.phone}\nSource: ${lead.sourceUrl}`).catch(
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
