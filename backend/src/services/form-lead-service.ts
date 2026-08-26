import {
  createFormLead,
  getFormLeadById,
  getFormLeadsByClientId,
  getFormLeadsByFormId,
} from '../repositories/form-lead-repository.js'
import { getPublicConfig } from './form-service.js'
import { syncFormLeadToCRM } from './crm-service.js'
import { sendLeadNotification } from './lead-notification-service.js'
import type { CreateFormLeadInput, FormLead } from '../types/index.js'

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

export async function captureFormLead(input: CreateFormLeadInput): Promise<FormLead> {
  await getPublicConfig(input.formId)

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
  const fields = parseCustomFields(input.customFields)
  const fieldsSummary = Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join(' · ')

  // A form has no fixed schema, so name/phone are best-effort: pick the first
  // field whose id looks like one. A miss just shows "Not provided" against
  // that row of the template -- the full answer set is still in `interest`.
  const pick = (needle: string): string | undefined =>
    Object.entries(fields).find(([key]) => key.toLowerCase().includes(needle))?.[1]

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
    ...(pick('name') ? { name: pick('name') as string } : {}),
    ...(pick('phone') ? { phone: pick('phone') as string } : {}),
    interest: fieldsSummary,
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
