// What the /v1 developer API returns.
//
// Every shape here is an explicit allowlist, built field by field, and never a
// spread of the internal record. Internal types gain fields all the time
// (indexing jobs, CRM sync bookkeeping, clientId) and a spread would publish
// each one the day it was added. A field in a public response is a promise --
// it can be added later and can never be taken away -- so anything not
// obviously needed is left out.
//
// Absent values are null rather than omitted, so a consumer sees one stable
// shape per resource.

import { getBotConfig, getClientBots } from './bot-service.js'
import { getClientForms, getFormConfig } from './form-service.js'
import { getUnifiedInbox, getUnifiedLeadDetail } from './lead-inbox-service.js'
import { getVoiceAgentById, getVoiceAgents } from './voice-service.js'
import type {
  BotConfig,
  FormConfig,
  FormField,
  LeadFormField,
  LeadOutcome,
  LeadRef,
  LeadSource,
  LeadStatus,
  UnifiedLead,
  UnifiedLeadDetail,
  VoiceAgent,
} from '../types/index.js'

export class PublicResourceNotFoundError extends Error {}

export const DEFAULT_LEAD_PAGE_SIZE = 50
export const MAX_LEAD_PAGE_SIZE = 200

export interface PublicLead {
  id: string
  source: LeadSource
  // The bot, form, Facebook Page or voice agent the lead came in through.
  sourceId: string
  name: string | null
  phone: string | null
  email: string | null
  sourceUrl: string | null
  // Anything else captured with the lead, keyed by field name.
  attributes: Record<string, string>
  status: LeadStatus
  outcome: LeadOutcome | null
  leadScore: number | null
  archived: boolean
  createdAt: string
}

export interface PublicLeadDetail extends PublicLead {
  transcript: string | null
}

export interface PublicLeadPage {
  data: PublicLead[]
  nextCursor: string | null
  total: number
  // Present only when a lead source could not be read, in which case this page
  // is missing that source's leads. A sync job must not treat such a page as
  // complete.
  incompleteSources?: LeadSource[]
}

export interface PublicBot {
  botId: string
  name: string
  websiteUrl: string | null
  greetingMessage: string
  brandColor: string
  widgetTrigger: BotConfig['widgetTrigger']
  leadTriggerAfterMessages: number
  leadFormFields: LeadFormField[]
  supportEmail: string | null
  createdAt: string
  updatedAt: string
}

export interface PublicForm {
  formId: string
  name: string
  description: string | null
  submitButtonText: string
  fields: FormField[]
  createdAt: string
  updatedAt: string
}

export interface PublicVoiceAgent {
  agentId: string
  name: string
  voice: VoiceAgent['voice']
  greetingMessage: string
  brandColor: string
  widgetPosition: VoiceAgent['widgetPosition']
  maxSessionDuration: VoiceAgent['maxSessionDuration']
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface LeadListQuery {
  limit?: number
  cursor?: string
  includeArchived?: boolean
}

// ---------------------------------------------------------------------------
// Lead ids
//
// Internally a lead is addressed by a LeadRef -- its source, its parent key and
// its leadId -- because the lead tables are partitioned differently and a bare
// leadId cannot be read back. Publicly that is one opaque string, so the
// contract does not expose how leads happen to be stored.
// ---------------------------------------------------------------------------

const LEAD_ID_PREFIX = 'lead_'

function parentIdOf(ref: LeadRef): string {
  if (ref.source === 'chat') return ref.botId
  if (ref.source === 'form') return ref.formId
  if (ref.source === 'meta') return ref.pageId
  return ref.agentId
}

function toLeadRef(source: unknown, parentId: unknown, leadId: unknown): LeadRef | null {
  if (typeof parentId !== 'string' || typeof leadId !== 'string' || !parentId || !leadId) return null
  if (source === 'chat') return { source, botId: parentId, leadId }
  if (source === 'form') return { source, formId: parentId, leadId }
  if (source === 'meta') return { source, pageId: parentId, leadId }
  if (source === 'voice') return { source, agentId: parentId, leadId }
  return null
}

export function encodeLeadId(ref: LeadRef): string {
  const payload = JSON.stringify([ref.source, parentIdOf(ref), ref.leadId])
  return `${LEAD_ID_PREFIX}${Buffer.from(payload).toString('base64url')}`
}

export function decodeLeadId(id: string): LeadRef | null {
  if (!id.startsWith(LEAD_ID_PREFIX)) return null
  try {
    const parsed: unknown = JSON.parse(Buffer.from(id.slice(LEAD_ID_PREFIX.length), 'base64url').toString('utf8'))
    if (!Array.isArray(parsed) || parsed.length !== 3) return null
    return toLeadRef(parsed[0], parsed[1], parsed[2])
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------

function leadAttributes(lead: UnifiedLead, customFields?: Record<string, string>): Record<string, string> {
  return {
    ...(lead.propertyInterest ? { propertyInterest: lead.propertyInterest } : {}),
    ...(lead.budgetRange ? { budgetRange: lead.budgetRange } : {}),
    ...customFields,
  }
}

function toPublicLead(lead: UnifiedLead, customFields?: Record<string, string>): PublicLead {
  return {
    id: encodeLeadId(lead.leadRef),
    source: lead.source,
    sourceId: parentIdOf(lead.leadRef),
    name: lead.name ?? null,
    phone: lead.phone ?? null,
    email: lead.email ?? null,
    sourceUrl: lead.sourceUrl ?? null,
    attributes: leadAttributes(lead, customFields),
    // A lead nobody has touched has no state row yet; that is what 'new' means.
    status: lead.state?.status ?? 'new',
    outcome: lead.state?.outcome ?? null,
    leadScore: lead.state?.leadScore ?? null,
    archived: Boolean(lead.state?.archivedAt),
    createdAt: lead.createdAt,
  }
}

function toPublicLeadDetail(lead: UnifiedLeadDetail): PublicLeadDetail {
  return { ...toPublicLead(lead, lead.customFields), transcript: lead.chatTranscript ?? null }
}

function toPublicBot(bot: BotConfig): PublicBot {
  return {
    botId: bot.botId,
    name: bot.name,
    websiteUrl: bot.websiteUrl ?? null,
    greetingMessage: bot.greetingMessage,
    brandColor: bot.brandColor,
    widgetTrigger: bot.widgetTrigger,
    leadTriggerAfterMessages: bot.leadTriggerAfterMessages,
    leadFormFields: bot.leadFormFields,
    supportEmail: bot.supportEmail ?? null,
    createdAt: bot.createdAt,
    updatedAt: bot.updatedAt,
  }
}

function toPublicForm(form: FormConfig): PublicForm {
  return {
    formId: form.formId,
    name: form.name,
    description: form.description ?? null,
    submitButtonText: form.submitButtonText,
    fields: form.fields,
    createdAt: form.createdAt,
    updatedAt: form.updatedAt,
  }
}

function toPublicVoiceAgent(agent: VoiceAgent): PublicVoiceAgent {
  return {
    agentId: agent.agentId,
    name: agent.name,
    voice: agent.voice,
    greetingMessage: agent.greetingMessage,
    brandColor: agent.brandColor,
    widgetPosition: agent.widgetPosition,
    maxSessionDuration: agent.maxSessionDuration,
    enabled: agent.isEnabled,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
  }
}

// The underlying services signal a missing or foreign record with a plain
// Error('<Thing> not found'). Translated here, once, so the route layer has a
// type to branch on instead of matching message text in eight handlers.
async function orNotFound<T>(read: Promise<T>): Promise<T> {
  try {
    return await read
  } catch (error) {
    if (error instanceof Error && /not found$/i.test(error.message)) {
      throw new PublicResourceNotFoundError(error.message)
    }
    throw error
  }
}

// ---------------------------------------------------------------------------
// Reads. clientId always comes from the API key's row.
// ---------------------------------------------------------------------------

// Always paginated, unlike the dashboard's inbox read: an integration that
// forgot `limit` should get a page, not every lead the account has ever had.
//
// Ordered like the dashboard inbox (by urgency, not by recency), because that
// is the order the cursor is defined over.
export async function listLeads(clientId: string, query: LeadListQuery): Promise<PublicLeadPage> {
  const page = await getUnifiedInbox(clientId, {
    limit: Math.min(query.limit ?? DEFAULT_LEAD_PAGE_SIZE, MAX_LEAD_PAGE_SIZE),
    ...(query.cursor ? { cursor: query.cursor } : {}),
    ...(query.includeArchived ? { includeArchived: true } : {}),
  })

  return {
    data: page.leads.map((lead) => toPublicLead(lead)),
    nextCursor: page.nextCursor ?? null,
    total: page.total,
    ...(page.degradedSources ? { incompleteSources: page.degradedSources } : {}),
  }
}

export async function getLead(clientId: string, id: string): Promise<PublicLeadDetail> {
  const leadRef = decodeLeadId(id)
  // An id that does not decode is an id that names nothing.
  if (!leadRef) throw new PublicResourceNotFoundError('Lead not found')
  return toPublicLeadDetail(await orNotFound(getUnifiedLeadDetail(leadRef, clientId)))
}

export async function listBots(clientId: string): Promise<PublicBot[]> {
  return (await getClientBots(clientId)).map(toPublicBot)
}

export async function getBot(clientId: string, botId: string): Promise<PublicBot> {
  return toPublicBot(await orNotFound(getBotConfig(botId, clientId)))
}

export async function listForms(clientId: string): Promise<PublicForm[]> {
  return (await getClientForms(clientId)).map(toPublicForm)
}

export async function getForm(clientId: string, formId: string): Promise<PublicForm> {
  return toPublicForm(await orNotFound(getFormConfig(formId, clientId)))
}

export async function listVoiceAgents(clientId: string): Promise<PublicVoiceAgent[]> {
  return (await getVoiceAgents(clientId)).map(toPublicVoiceAgent)
}

export async function getVoiceAgent(clientId: string, agentId: string): Promise<PublicVoiceAgent> {
  return toPublicVoiceAgent(await orNotFound(getVoiceAgentById(agentId, clientId)))
}
