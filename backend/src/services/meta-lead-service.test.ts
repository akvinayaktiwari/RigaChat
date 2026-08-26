import { beforeEach, describe, expect, it, vi } from 'vitest'

// Every collaborator is mocked: this file is about ONE decision -- what happens
// when Meta answers the field_data fetch with an empty array -- and that
// decision is made before any of them matter.
const verifyWebhookSignature = vi.fn(() => true)
const fetchLeadFieldData = vi.fn()
vi.mock('../providers/meta-provider.js', () => ({
  metaProvider: {
    get verifyWebhookSignature() {
      return verifyWebhookSignature
    },
    get fetchLeadFieldData() {
      return fetchLeadFieldData
    },
  },
}))

const hasProcessed = vi.fn(async () => false)
const markProcessed = vi.fn(async () => undefined)
const countWebhookAttempt = vi.fn(async () => 1)
vi.mock('../repositories/webhook-event-repository.js', () => ({
  hasProcessed: (...args: unknown[]) => hasProcessed(...(args as [])),
  markProcessed: (...args: unknown[]) => markProcessed(...(args as [])),
  countWebhookAttempt: (...args: unknown[]) => countWebhookAttempt(...(args as [])),
}))

interface SavedMetaLead {
  name?: string
  phone?: string
  customFields: string
}
const createMetaLead = vi.fn(async (_input: SavedMetaLead) => ({ leadId: 'lead-1', clientId: 'client-1' }))
vi.mock('../repositories/meta-lead-repository.js', () => ({
  createMetaLead: (input: SavedMetaLead) => createMetaLead(input),
  getClientIdForPage: async () => 'client-1',
  getMetaLeadsByClientId: async () => [],
  MetaPageConflictError: class extends Error {},
  removePageClientMapping: async () => undefined,
  setPageClientMapping: async () => undefined,
  updateMetaLeadSyncStatus: async () => undefined,
}))

vi.mock('../repositories/client-repository.js', () => ({
  getClientById: async () => ({
    clientId: 'client-1',
    metaConnection: { connected: true, pageName: 'Skyline Homes', pageAccessTokenEncrypted: 'enc' },
  }),
  removeClientMetaConnection: async () => undefined,
  updateClient: async () => undefined,
}))

vi.mock('../lib/kms.js', () => ({ decrypt: async () => 'page-token', encrypt: async () => 'enc' }))
vi.mock('./crm-service.js', () => ({ getProvider: () => null, syncLeadToCRMWithRetry: async () => ({ success: true }) }))
vi.mock('./lead-notification-service.js', () => ({ sendLeadNotification: async () => ({ notified: true }) }))
vi.mock('./journey-ignition-service.js', () => ({ igniteJourneysForLead: async () => ({ status: 'started' }) }))
vi.mock('../repositories/meta-deletion-request-repository.js', () => ({
  createMetaDeletionRequest: async () => undefined,
  getMetaDeletionRequest: async () => null,
  markMetaDeletionRequestNotified: async () => undefined,
}))
vi.mock('../repositories/email-repository.js', () => ({
  getContactNotificationAddress: () => null,
  sendEmail: async () => undefined,
}))

const { processMetaLeadWebhook, mapMetaFieldData } = await import('./meta-lead-service.js')

const payload = JSON.stringify({
  entry: [{ id: 'page-1', changes: [{ field: 'leadgen', value: { leadgen_id: 'lead-gen-1', page_id: 'page-1' } }] }],
})

beforeEach(() => {
  vi.clearAllMocks()
  verifyWebhookSignature.mockReturnValue(true)
  hasProcessed.mockResolvedValue(false)
  createMetaLead.mockResolvedValue({ leadId: 'lead-1', clientId: 'client-1' })
})

describe('empty field_data from the Graph API', () => {
  // Meta's field data is eventually consistent with its webhook: the
  // notification can arrive before the answers are readable. Persisting that as
  // a real lead is what this guards -- a record with no name, phone or email,
  // permanently marked processed, with no path to backfill it.
  it('asks Meta to redeliver instead of saving a blank lead', async () => {
    fetchLeadFieldData.mockResolvedValue([])
    countWebhookAttempt.mockResolvedValue(1)

    const result = await processMetaLeadWebhook(payload, 'sha256=sig')

    expect(result.status).toBe(503)
    expect(createMetaLead).not.toHaveBeenCalled()
  })

  // The half that makes the retry safe: marking it processed would make the
  // redelivery a no-op and lose the lead for good.
  it('does not mark the event processed while it is still being retried', async () => {
    fetchLeadFieldData.mockResolvedValue([])
    countWebhookAttempt.mockResolvedValue(2)

    await processMetaLeadWebhook(payload, 'sha256=sig')

    expect(markProcessed).not.toHaveBeenCalled()
  })

  // Bounded, because Meta gives up after ~36 hours and an unbounded retry would
  // end with the lead lost entirely rather than merely blank.
  it('accepts the lead once the attempts are exhausted', async () => {
    fetchLeadFieldData.mockResolvedValue([])
    countWebhookAttempt.mockResolvedValue(3)

    const result = await processMetaLeadWebhook(payload, 'sha256=sig')

    expect(result.status).toBe(200)
    expect(createMetaLead).toHaveBeenCalledTimes(1)
    expect(markProcessed).toHaveBeenCalledTimes(1)
  })

  // A blank row that looks like a lead who typed nothing is the failure this
  // whole change is about. The marker is what a human reads in the CRM.
  it('marks an accepted-but-empty lead so it cannot pass as a real one', async () => {
    fetchLeadFieldData.mockResolvedValue([])
    countWebhookAttempt.mockResolvedValue(3)

    await processMetaLeadWebhook(payload, 'sha256=sig')

    const saved = createMetaLead.mock.calls[0][0]
    expect(JSON.parse(saved.customFields)).toHaveProperty('_fieldDataUnavailable')
  })

  it('leaves a normal lead untouched by any of this', async () => {
    fetchLeadFieldData.mockResolvedValue([
      { name: 'full_name', values: ['Ravi Kumar'] },
      { name: 'phone_number', values: ['+919876543210'] },
    ])

    const result = await processMetaLeadWebhook(payload, 'sha256=sig')

    expect(result.status).toBe(200)
    expect(countWebhookAttempt).not.toHaveBeenCalled()
    const saved = createMetaLead.mock.calls[0][0]
    expect(saved.name).toBe('Ravi Kumar')
    expect(JSON.parse(saved.customFields)).not.toHaveProperty('_fieldDataUnavailable')
  })
})

describe('mapMetaFieldData', () => {
  // The reason this mapper was revisited. Indian real-estate forms very often
  // ask for a "WhatsApp Number" rather than a phone number; the old chain
  // tested key.includes('phone'), so whatsapp_number matched nothing and the
  // lead was saved with an EMPTY phone -- the one field lead notifications,
  // journey outreach and the WhatsApp agent are all addressed by.
  it('maps a WhatsApp-labelled question onto phone', () => {
    for (const key of ['whatsapp_number', 'WhatsApp Number', 'whats_app_no', 'wa_number', 'mobile_number']) {
      expect(mapMetaFieldData([{ name: key, values: ['+919876543210'] }]).phone, key).toBe('+919876543210')
    }
  })

  it('still maps the standard Meta keys', () => {
    const mapped = mapMetaFieldData([
      { name: 'full_name', values: ['Ravi Kumar'] },
      { name: 'phone_number', values: ['+919876543210'] },
      { name: 'email', values: ['ravi@example.com'] },
    ])

    expect(mapped).toMatchObject({ name: 'Ravi Kumar', phone: '+919876543210', email: 'ravi@example.com' })
    expect(mapped.customFields).toEqual({})
  })

  // 'preferred_contact_time' is a common question and is not a phone number.
  // A too-greedy phone rule would put a time of day in the field the agent
  // sends WhatsApp messages to.
  it('does not treat every "contact" question as a phone number', () => {
    const mapped = mapMetaFieldData([{ name: 'preferred_contact_time', values: ['Evening'] }])

    expect(mapped.phone).toBeUndefined()
    expect(mapped.customFields).toEqual({ preferred_contact_time: 'Evening' })
  })

  // 'name' as a substring appears in company_name, project_name, society_name.
  it('does not treat every "name" question as the lead name', () => {
    const mapped = mapMetaFieldData([{ name: 'society_name', values: ['Skyline Residences'] }])

    expect(mapped.name).toBeUndefined()
    expect(mapped.customFields).toEqual({ society_name: 'Skyline Residences' })
  })

  it('composes a name from the split standard keys', () => {
    const mapped = mapMetaFieldData([
      { name: 'first_name', values: ['Ravi'] },
      { name: 'last_name', values: ['Kumar'] },
    ])

    expect(mapped.name).toBe('Ravi Kumar')
  })

  it('prefers a whole-name question over the split keys', () => {
    const mapped = mapMetaFieldData([
      { name: 'full_name', values: ['Ravi Kumar'] },
      { name: 'first_name', values: ['Ravi'] },
    ])

    expect(mapped.name).toBe('Ravi Kumar')
  })

  // The filed complaint: values[0] with the rest dropped and no trace.
  it('keeps every answer to a multi-select question', () => {
    const mapped = mapMetaFieldData([{ name: 'property_interest', values: ['2 BHK', '3 BHK'] }])

    expect(mapped.propertyInterest).toBe('2 BHK, 3 BHK')
  })

  // A single-valued target still takes one value -- phonesMatch and the
  // WhatsApp send both need ONE number, not a joined string -- but the extras
  // are parked rather than lost.
  it('parks the extras when a single-valued field carries several', () => {
    const mapped = mapMetaFieldData([{ name: 'phone_number', values: ['+919876543210', '+919000000000'] }])

    expect(mapped.phone).toBe('+919876543210')
    expect(mapped.customFields).toEqual({ phone_number_additional: '+919000000000' })
  })

  it('keeps every answer to a multi-select custom question', () => {
    const mapped = mapMetaFieldData([{ name: 'preferred_areas', values: ['Whitefield', 'Indiranagar'] }])

    expect(mapped.customFields).toEqual({ preferred_areas: 'Whitefield, Indiranagar' })
  })

  // Precedence, which used to be emergent from if/else source order and is now
  // stated: budget before property, so 'budget_for_property' is a budget.
  it('resolves an ambiguous key by the documented precedence', () => {
    expect(mapMetaFieldData([{ name: 'budget_for_property', values: ['1-2 Cr'] }]).budgetRange).toBe('1-2 Cr')
    expect(mapMetaFieldData([{ name: 'email_or_phone', values: ['ravi@example.com'] }]).email).toBe(
      'ravi@example.com'
    )
  })

  it('survives a question with no answer at all', () => {
    const mapped = mapMetaFieldData([{ name: 'phone_number', values: [] }])

    expect(mapped.phone).toBe('')
  })
})
