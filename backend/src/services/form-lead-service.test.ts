import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FormConfig } from '../types/index.js'

const createFormLead = vi.fn()
vi.mock('../repositories/form-lead-repository.js', () => ({
  createFormLead,
  getFormLeadById: vi.fn(),
  getFormLeadsByClientId: vi.fn(),
  getFormLeadsByFormId: vi.fn(),
}))

const getPublicConfig = vi.fn()
vi.mock('./form-service.js', () => ({ getPublicConfig }))

const syncFormLeadToCRM = vi.fn()
vi.mock('./crm-service.js', () => ({ syncFormLeadToCRM }))

const sendLeadNotification = vi.fn()
vi.mock('./lead-notification-service.js', () => ({ sendLeadNotification }))

const { captureFormLead, summariseFormLead } = await import('./form-lead-service.js')

// Field ids are UUIDs in production -- that is the whole point of the bug.
const NAME_ID = '3f1c2a9e-0b1d-4c55-9a0e-6f1b2c3d4e5f'
const PHONE_ID = '9b2e7d10-4a6c-4e2f-8b1a-0c9d8e7f6a5b'
const EMAIL_ID = 'c4d5e6f7-1a2b-4c3d-9e8f-7a6b5c4d3e2f'
const INTEREST_ID = 'e1f2a3b4-5c6d-4e7f-8a9b-0c1d2e3f4a5b'

const form: FormConfig = {
  formId: 'form-1',
  clientId: 'client-1',
  name: 'Aspire Uru — Site visit',
  submitButtonText: 'Book a Site Visit',
  createdAt: '2026-09-25T00:00:00.000Z',
  updatedAt: '2026-09-25T00:00:00.000Z',
  fields: [
    { fieldId: NAME_ID, label: 'Name', type: 'text', required: true },
    { fieldId: PHONE_ID, label: 'Phone', type: 'phone', required: true },
    { fieldId: EMAIL_ID, label: 'Email', type: 'email', required: false },
    { fieldId: INTEREST_ID, label: 'Interested in', type: 'options', required: false },
  ],
}

// Exactly what form-widget.js posts: every answer keyed by fieldId.
const widgetFields = {
  [NAME_ID]: 'Asha Rao',
  [PHONE_ID]: '+91 98450 12345',
  [EMAIL_ID]: '',
  [INTEREST_ID]: 'Type A — 1,644 sq ft',
}

beforeEach(() => {
  createFormLead.mockReset()
  createFormLead.mockResolvedValue({ leadId: 'lead-1', formId: 'form-1', clientId: 'client-1' })
  getPublicConfig.mockReset()
  getPublicConfig.mockResolvedValue(form)
  syncFormLeadToCRM.mockReset()
  syncFormLeadToCRM.mockResolvedValue(undefined)
  sendLeadNotification.mockReset()
  sendLeadNotification.mockResolvedValue({ notified: true })
})

describe('summariseFormLead', () => {
  it('resolves fieldId keys to labels and picks name and phone from them', () => {
    expect(summariseFormLead(form, widgetFields)).toEqual({
      name: 'Asha Rao',
      phone: '+91 98450 12345',
      interest: 'Interested in: Type A — 1,644 sq ft',
    })
  })

  it('finds the phone by field type even when its label says something else', () => {
    const contact: FormConfig = {
      ...form,
      fields: [{ fieldId: 'id-x', label: 'Best number to reach you', type: 'phone', required: true }],
    }
    expect(summariseFormLead(contact, { 'id-x': '9845012345' })).toEqual({ phone: '9845012345', interest: '' })
  })

  it('still reads a hand-crafted body keyed by label', () => {
    expect(summariseFormLead(form, { name: 'Ravi', phone: '9876543210', city: 'Pune' })).toEqual({
      name: 'Ravi',
      phone: '9876543210',
      interest: 'city: Pune',
    })
  })
})

describe('captureFormLead', () => {
  it('sends the lead alert with the real name and phone, not UUIDs (regression)', async () => {
    await captureFormLead({
      formId: 'form-1',
      clientId: 'client-1',
      customFields: widgetFields,
      sourceUrl: 'https://www.aspireuru.com/',
    })

    expect(sendLeadNotification).toHaveBeenCalledTimes(1)
    const sent = sendLeadNotification.mock.calls[0]?.[0]
    expect(sent).toMatchObject({
      source: 'Website form',
      name: 'Asha Rao',
      phone: '+91 98450 12345',
      interest: 'Interested in: Type A — 1,644 sq ft',
    })
    expect(JSON.stringify(sent)).not.toContain(NAME_ID)
  })

  it('stores the answers exactly as received', async () => {
    await captureFormLead({ formId: 'form-1', clientId: 'client-1', customFields: widgetFields, sourceUrl: 'https://x/' })
    expect(createFormLead).toHaveBeenCalledWith(expect.objectContaining({ customFields: JSON.stringify(widgetFields) }))
  })
})
