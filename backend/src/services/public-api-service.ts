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
import { createNewForm, getClientForms, getFormConfig } from './form-service.js'
import { getUnifiedInbox, getUnifiedLeadDetail } from './lead-inbox-service.js'
import { getVoiceAgentById, getVoiceAgents } from './voice-service.js'
import type {
  BotConfig,
  CreateFormInput,
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
// The message is returned to the caller, so it names the offending field and
// nothing internal.
export class PublicValidationError extends Error {}
export class PublicConflictError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

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

// ---------------------------------------------------------------------------
// Writes. Input is validated as strictly as output is allowlisted: an unknown
// key is refused rather than ignored, because a misspelt `submitButtonText`
// that silently falls back to the default is a bug the caller finds in
// production. Refusing can be relaxed later; accepting cannot be taken back.
// ---------------------------------------------------------------------------

// A ceiling, not a plan limit. One key can make 120 requests a minute, and
// without this a looping script fills the account with forms.
export const MAX_FORMS_PER_ACCOUNT = 200
export const MAX_FORM_FIELDS = 30
export const MAX_FIELD_OPTIONS = 50
const MAX_FORM_NAME_LENGTH = 120
const MAX_FORM_DESCRIPTION_LENGTH = 500
const MAX_LABEL_LENGTH = 120

// Record rather than an array so a type added to FormField without being
// listed here is a compile error.
const FIELD_TYPE_REGISTRY: Record<FormField['type'], true> = {
  text: true,
  number: true,
  email: true,
  phone: true,
  options: true,
}
const FIELD_TYPES = Object.keys(FIELD_TYPE_REGISTRY) as FormField['type'][]

const FORM_KEYS = ['name', 'description', 'submitButtonText', 'fields']
const FIELD_KEYS = ['label', 'type', 'required', 'placeholder', 'options']

type NewFormField = Omit<FormField, 'fieldId'>
type NewForm = Omit<CreateFormInput, 'clientId'>

function asObject(raw: unknown, what: string, allowedKeys: string[]): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new PublicValidationError(`${what} must be a JSON object`)
  }
  const unknown = Object.keys(raw).filter((key) => !allowedKeys.includes(key))
  if (unknown.length > 0) {
    throw new PublicValidationError(`${what} has unknown property: ${unknown.join(', ')}`)
  }
  return raw as Record<string, unknown>
}

function requiredText(value: unknown, name: string, maxLength: number): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (text.length === 0 || text.length > maxLength) {
    throw new PublicValidationError(`${name} is required and must be at most ${maxLength} characters`)
  }
  return text
}

function optionalText(value: unknown, name: string, maxLength: number): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new PublicValidationError(`${name} must be a string of at most ${maxLength} characters`)
  }
  return value.trim() || undefined
}

function parseOptions(raw: unknown, name: string): string[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_FIELD_OPTIONS) {
    throw new PublicValidationError(`${name} must be an array of 1 to ${MAX_FIELD_OPTIONS} choices`)
  }
  const options = raw.map((option, index) => requiredText(option, `${name}[${index}]`, MAX_LABEL_LENGTH))
  // Two identical choices would be indistinguishable in the submitted answer.
  if (new Set(options).size !== options.length) {
    throw new PublicValidationError(`${name} must not repeat a choice`)
  }
  return options
}

function parseFieldType(raw: unknown, name: string): FormField['type'] {
  if (!FIELD_TYPES.includes(raw as FormField['type'])) {
    throw new PublicValidationError(`${name} must be one of: ${FIELD_TYPES.join(', ')}`)
  }
  return raw as FormField['type']
}

function parseField(raw: unknown, index: number): NewFormField {
  const at = `fields[${index}]`
  const body = asObject(raw, at, FIELD_KEYS)
  const type = parseFieldType(body.type, `${at}.type`)
  if (body.required !== undefined && typeof body.required !== 'boolean') {
    throw new PublicValidationError(`${at}.required must be true or false`)
  }
  if (type !== 'options' && body.options !== undefined) {
    throw new PublicValidationError(`${at}.options is only allowed when type is "options"`)
  }
  const placeholder = optionalText(body.placeholder, `${at}.placeholder`, MAX_LABEL_LENGTH)

  return {
    label: requiredText(body.label, `${at}.label`, MAX_LABEL_LENGTH),
    type,
    required: body.required === true,
    ...(placeholder !== undefined ? { placeholder } : {}),
    ...(type === 'options' ? { options: parseOptions(body.options, `${at}.options`) } : {}),
  }
}

export function parseCreateFormInput(raw: unknown): NewForm {
  const body = asObject(raw, 'The request body', FORM_KEYS)
  if (!Array.isArray(body.fields) || body.fields.length === 0 || body.fields.length > MAX_FORM_FIELDS) {
    throw new PublicValidationError(`fields must be an array of 1 to ${MAX_FORM_FIELDS} fields`)
  }
  const description = optionalText(body.description, 'description', MAX_FORM_DESCRIPTION_LENGTH)

  return {
    name: requiredText(body.name, 'name', MAX_FORM_NAME_LENGTH),
    ...(description !== undefined ? { description } : {}),
    submitButtonText: optionalText(body.submitButtonText, 'submitButtonText', MAX_LABEL_LENGTH) ?? 'Submit',
    fields: body.fields.map(parseField),
  }
}

// Everything a caller can set, and nothing they cannot (fieldId, timestamps),
// so a stored form compares equal to the request that made it.
function definitionOf(form: NewForm | FormConfig): string {
  return JSON.stringify({
    description: form.description || null,
    submitButtonText: form.submitButtonText,
    fields: form.fields.map((field) => [
      field.label,
      field.type,
      field.required,
      field.placeholder || null,
      field.options ?? null,
    ]),
  })
}

export interface CreateFormResult {
  form: PublicForm
  // False when an identical form already existed and was returned instead.
  created: boolean
}

// Creating is a setup step, done once; a form is never made per submission.
// Nothing stops a setup script running twice, though -- a redeploy, a retry
// after a timeout -- so the call is safe to repeat: the same name with the
// same definition returns the form that is already there instead of a second
// one. The same name with a DIFFERENT definition is refused rather than
// guessed at, since either answer (a silent duplicate, or a silent edit of a
// live form) would be wrong for somebody.
//
// Not a transaction: two identical requests in the same instant can both
// create. A setup script does not do that, and the cost is one spare form.
//
// Validates before reading, so a malformed request costs no read.
export async function createForm(clientId: string, raw: unknown): Promise<CreateFormResult> {
  const input = parseCreateFormInput(raw)

  const existing = await getClientForms(clientId)
  const sameName = existing.filter((form) => form.name === input.name)
  const identical = sameName.find((form) => definitionOf(form) === definitionOf(input))
  if (identical) return { form: toPublicForm(identical), created: false }
  if (sameName.length > 0) {
    throw new PublicConflictError(
      'form_name_taken',
      `A form named "${input.name}" already exists with different fields. Use another name, or read the existing one from GET /v1/forms.`
    )
  }
  if (existing.length >= MAX_FORMS_PER_ACCOUNT) {
    throw new PublicConflictError(
      'form_limit_reached',
      `This account already has ${MAX_FORMS_PER_ACCOUNT} forms. Delete one you no longer use before creating another.`
    )
  }

  return { form: toPublicForm(await createNewForm({ clientId, ...input })), created: true }
}

export async function listVoiceAgents(clientId: string): Promise<PublicVoiceAgent[]> {
  return (await getVoiceAgents(clientId)).map(toPublicVoiceAgent)
}

export async function getVoiceAgent(clientId: string, agentId: string): Promise<PublicVoiceAgent> {
  return toPublicVoiceAgent(await orNotFound(getVoiceAgentById(agentId, clientId)))
}
