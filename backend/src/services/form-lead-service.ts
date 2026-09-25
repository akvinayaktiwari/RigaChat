import {
  createFormLead,
  getFormLeadById,
  getFormLeadsByClientId,
  getFormLeadsByFormId,
} from '../repositories/form-lead-repository.js'
import { getPublicConfig } from './form-service.js'
import { syncFormLeadToCRM } from './crm-service.js'
import { sendLeadNotification } from './lead-notification-service.js'
import type { CreateFormLeadInput, FormConfig, FormField, FormLead } from '../types/index.js'

function parseFormLead(lead: FormLead): FormLead {
  try {
    const parsed = JSON.parse(lead.customFields)
    return { ...lead, customFields: parsed }
  } catch {
    return lead
  }
}

// customFields can arrive as a parsed object, a JSON string, or a
// double-encoded string (e.g. from a hand-crafted request body), so
// notification message building needs to tolerate all three shapes.
function parseCustomFields(raw: unknown): Record<string, string> {
  if (typeof raw === 'object' && raw !== null) {
    return raw as Record<string, string>
  }
  try {
    const once = JSON.parse(raw as string)
    if (typeof once === 'object') return once
    return JSON.parse(once)
  } catch {
    return {}
  }
}

interface LabelledAnswer {
  label: string
  type?: FormField['type']
  value: string
}

export interface FormLeadSummary {
  name?: string
  phone?: string
  interest: string
}

// Form leads are keyed by fieldId UUIDs (form-widget.js sends
// customFields[field.fieldId]), so an answer means nothing until it is resolved
// to its field. A key that matches no field -- a hand-crafted body keyed by
// label -- keeps the key itself as its label.
function labelAnswers(form: FormConfig, fields: Record<string, string>): LabelledAnswer[] {
  const byId = new Map(form.fields.map((field) => [field.fieldId, field]))
  return Object.entries(fields)
    .map(([key, raw]) => {
      const field = byId.get(key)
      const value = String(raw ?? '').trim()
      return field ? { label: field.label, type: field.type, value } : { label: key, value }
    })
    .filter((answer) => answer.value !== '')
}

function labelHas(answer: LabelledAnswer, words: string[]): boolean {
  const label = answer.label.toLowerCase()
  return words.some((word) => label.includes(word))
}

// What the lead alert shows. A form has no fixed schema, so name and phone are
// best-effort: phone by field type first, then by label; name by label. A miss
// shows "Not provided" on that row, and every other answer is in `interest`,
// by label, so nothing is lost.
export function summariseFormLead(form: FormConfig, fields: Record<string, string>): FormLeadSummary {
  const answers = labelAnswers(form, fields)
  const phone = answers.find((a) => a.type === 'phone') ?? answers.find((a) => labelHas(a, ['phone', 'mobile']))
  const name = answers.find((a) => a !== phone && labelHas(a, ['name']))
  const interest = answers
    .filter((a) => a !== name && a !== phone)
    .map((a) => `${a.label}: ${a.value}`)
    .join(' · ')
  return { ...(name ? { name: name.value } : {}), ...(phone ? { phone: phone.value } : {}), interest }
}

export async function captureFormLead(input: CreateFormLeadInput): Promise<FormLead> {
  const form = await getPublicConfig(input.formId)

  const customFieldsJson = JSON.stringify(input.customFields)

  const createdLead = await createFormLead({
    formId: input.formId,
    clientId: input.clientId,
    source: 'form',
    customFields: customFieldsJson,
    sourceUrl: input.sourceUrl,
  })

  // Never fails lead capture (errors are swallowed below) — but must be
  // awaited for the same reason the WhatsApp notification below is: AWS Lambda
  // freezes the execution environment as soon as the handler's response
  // promise resolves, so an un-awaited call here would be aborted mid-flight
  // before the CRM sync's external requests ever completed.
  await syncFormLeadToCRM(createdLead, input.formId, input.clientId).catch((err) => {
    console.error('CRM sync error:', err)
  })

  // Never fails lead capture (sendLeadNotification always resolves, never
  // throws) — but must be awaited, not truly fire-and-forget: AWS Lambda
  // freezes the execution environment as soon as the handler's response
  // promise resolves, so an un-awaited async call here would be aborted
  // mid-flight before the KMS decrypt / Gupshup request ever completed.
  const summary = summariseFormLead(form, parseCustomFields(input.customFields))

  const notification = await sendLeadNotification({
    clientId: input.clientId,
    leadId: createdLead.leadId,
    botId: input.formId,
    // A form lead is addressed by formId, not botId -- the botId field above
    // carries the formId for the WhatsApp template's benefit, but the ref has
    // to name the source correctly or GET /api/leads/detail reads the wrong
    // table.
    leadRef: { source: 'form', formId: input.formId, leadId: createdLead.leadId },
    source: 'Website form',
    ...summary,
  })
  if (!notification.notified) {
    console.error(`[lead-notification] form lead ${createdLead.leadId} reached nobody:`, notification.error)
  }

  return createdLead
}

export async function getLeadsForForm(formId: string, limit?: number): Promise<FormLead[]> {
  const leads = await getFormLeadsByFormId(formId, limit)
  return leads.map(parseFormLead)
}

export async function getLeadsForClient(clientId: string): Promise<FormLead[]> {
  const leads = await getFormLeadsByClientId(clientId)
  return leads.map(parseFormLead)
}

export async function getFormLeadDetail(formId: string, leadId: string): Promise<FormLead> {
  const lead = await getFormLeadById(formId, leadId)
  if (!lead) {
    throw new Error('Form lead not found')
  }
  return parseFormLead(lead)
}
