import {
  createFormLead,
  getFormLeadById,
  getFormLeadsByClientId,
  getFormLeadsByFormId,
} from '../repositories/form-lead-repository.js'
import { getPublicConfig } from './form-service.js'
import { syncFormLeadToCRM } from './crm-service.js'
import { sendLeadNotification } from './whatsapp-service.js'
import type { CreateFormLeadInput, FormLead } from '../types/index.js'

function parseFormLead(lead: FormLead): FormLead {
  try {
    const parsed = JSON.parse(lead.customFields)
    return { ...lead, customFields: parsed }
  } catch {
    return lead
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

  // Fire-and-forget: CRM sync never blocks or fails lead capture.
  syncFormLeadToCRM(createdLead, input.formId, input.clientId).catch((err) => {
    console.error('CRM sync error:', err)
  })

  // Fire-and-forget: WhatsApp notification never blocks or fails lead capture.
  const fieldsSummary = Object.entries(input.customFields)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')
  sendLeadNotification(input.clientId, `${fieldsSummary}\nSource: ${input.sourceUrl}`).catch((err) => {
    console.error('WhatsApp notification error:', err)
  })

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
