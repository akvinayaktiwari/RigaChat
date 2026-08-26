import {
  createLead,
  getLeadById,
  getLeadsByBotId,
  getLeadsByClientId,
} from '../repositories/lead-repository.js'
import { markLeadCaptured } from '../repositories/conversation-repository.js'
import { sendLeadNotification } from './lead-notification-service.js'
import { appendLeadEvent } from '../repositories/lead-event-repository.js'
import { igniteJourneysForLead } from './journey-ignition-service.js'
import { getBotConfig } from './bot-service.js'
import type { BotConfig, Lead } from '../types/index.js'

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

export class LeadValidationError extends Error {}

type LeadFieldId = 'name' | 'phone' | 'email' | 'propertyInterest' | 'budgetRange'

function assertRequiredLeadFields(bot: BotConfig, input: CreateLeadInput): void {
  if (!input.name && !input.phone && !input.email) {
    throw new LeadValidationError(
      'At least one contact field (name, phone, or email) is required.'
    )
  }

  const values: Record<LeadFieldId, string | undefined> = {
    name: input.name,
    phone: input.phone,
    email: input.email,
    propertyInterest: input.propertyInterest,
    budgetRange: input.budgetRange,
  }

  for (const field of bot.leadFormFields) {
    const fieldId = field.fieldId as LeadFieldId
    if (field.required && !values[fieldId]) {
      throw new LeadValidationError(`Missing required lead field: ${field.label || field.fieldId}`)
    }
  }
}

export async function captureLead(bot: BotConfig, input: CreateLeadInput): Promise<Lead> {
  assertRequiredLeadFields(bot, input)

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

    await appendLeadEvent({
      leadId: lead.leadId,
      clientId: input.clientId,
      botId: input.botId,
      type: 'lead_captured',
      channel: 'web_widget',
      body: input.sourceUrl,
    })

    // Hand the lead to its Agent. Safe inside this try/catch because
    // igniteJourneysForLead never throws -- if it could, a journey-layer
    // failure would surface as "Failed to capture lead" and the widget would
    // tell a real visitor their details were not saved, when they were.
    const ignition = await igniteJourneysForLead({
      leadRef: { source: 'chat', botId: input.botId, leadId: lead.leadId },
      clientId: input.clientId,
    })
    if (ignition.status !== 'started') {
      console.log(`[ignition] chat lead ${lead.leadId}: ${ignition.status}`, ignition)
    }

    // Never fails lead capture (sendLeadNotification always resolves, never
    // throws) — but must be awaited, not truly fire-and-forget: AWS Lambda
    // freezes the execution environment as soon as the handler's response
    // promise resolves, so an un-awaited async call here would be aborted
    // mid-flight before the KMS decrypt / Gupshup request ever completed.
    const notification = await sendLeadNotification({
      clientId: input.clientId,
      leadId: lead.leadId,
      botId: input.botId,
      // Same ref the journey ignition above uses. Carries the mobile push to
      // this lead's detail screen with no reconstruction.
      leadRef: { source: 'chat', botId: input.botId, leadId: lead.leadId },
      source: 'Website chat',
      ...(lead.name ? { name: lead.name } : {}),
      ...(lead.phone ? { phone: lead.phone } : {}),
      interest: [lead.propertyInterest, lead.budgetRange, lead.email]
        .filter((value): value is string => Boolean(value))
        .join(' · '),
    })
    if (!notification.notified) {
      console.error(`[lead-notification] chat lead ${lead.leadId} reached nobody:`, notification.error)
    }

    return lead
  } catch (error) {
    throw new Error(
      `Failed to capture lead for bot ${input.botId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

// getBotConfig() throws 'Bot not found' both when the bot genuinely doesn't
// exist and when it belongs to a different clientId -- same 404 either way.
export async function getLeadsForBot(botId: string, clientId: string, limit?: number): Promise<Lead[]> {
  await getBotConfig(botId, clientId)

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

// 404 either way (missing vs. owned by someone else) -- don't reveal
// existence to a non-owner. Mirrors voice-service.ts's getOwnedVoiceAgent().
export async function getLeadDetail(botId: string, leadId: string, clientId: string): Promise<Lead> {
  const lead = await getLeadById(botId, leadId)
  if (!lead || lead.clientId !== clientId) {
    throw new Error('Lead not found')
  }
  return lead
}
