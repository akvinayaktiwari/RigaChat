import { beforeEach, describe, expect, it, vi } from 'vitest'

// Every collaborator is mocked: this file is about ONE decision -- what happens
// when Meta answers the field_data fetch with an empty array -- and that
// decision is made before any of them matter.
const verifyWebhookSignature = vi.fn(() => true)
const fetchLeadFieldData = vi.fn()
const fetchFormQuestions = vi.fn(async () => [] as { key: string; label?: string; type?: string }[])
const fetchPageLeadgenForms = vi.fn(
  async () => [] as { formId: string; questions: { key: string; type?: string }[] }[]
)
const exchangeCodeForPageCredentials = vi.fn(async () => ({
  pageId: 'page-1',
  pageName: 'Skyline Homes',
  pageAccessToken: 'page-token',
}))
const subscribePageToWebhook = vi.fn(async () => undefined)
vi.mock('../providers/meta-provider.js', () => ({
  metaProvider: {
    get verifyWebhookSignature() {
      return verifyWebhookSignature
    },
    get fetchLeadFieldData() {
      return fetchLeadFieldData
    },
    get fetchFormQuestions() {
      return fetchFormQuestions
    },
    get fetchPageLeadgenForms() {
      return fetchPageLeadgenForms
    },
    get exchangeCodeForPageCredentials() {
      return exchangeCodeForPageCredentials
    },
    get subscribePageToWebhook() {
      return subscribePageToWebhook
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
const getCachedFormQuestions = vi.fn(async () => null as { key: string; type?: string }[] | null)
const setCachedFormQuestions = vi.fn(async () => undefined)
vi.mock('../repositories/redis-repository.js', () => ({
  getCachedFormQuestions: (...args: unknown[]) => getCachedFormQuestions(...(args as [])),
  setCachedFormQuestions: (...args: unknown[]) => setCachedFormQuestions(...(args as [])),
}))

vi.mock('../repositories/email-repository.js', () => ({
  getContactNotificationAddress: () => null,
  sendEmail: async () => undefined,
}))

const { processMetaLeadWebhook, connectMetaAds } = await import('./meta-lead-service.js')

const payload = JSON.stringify({
  entry: [{ id: 'page-1', changes: [{ field: 'leadgen', value: { leadgen_id: 'lead-gen-1', page_id: 'page-1' } }] }],
})

// The realistic payload: Meta sends form_id on every leadgen change, and it is
// what unlocks the schema lookup.
const payloadWithForm = JSON.stringify({
  entry: [
    {
      id: 'page-1',
      changes: [{ field: 'leadgen', value: { leadgen_id: 'lead-gen-1', page_id: 'page-1', form_id: 'form-77' } }],
    },
  ],
})

beforeEach(() => {
  vi.clearAllMocks()
  verifyWebhookSignature.mockReturnValue(true)
  hasProcessed.mockResolvedValue(false)
  createMetaLead.mockResolvedValue({ leadId: 'lead-1', clientId: 'client-1' })
  getCachedFormQuestions.mockResolvedValue(null)
  fetchFormQuestions.mockResolvedValue([])
  fetchPageLeadgenForms.mockResolvedValue([])
  exchangeCodeForPageCredentials.mockResolvedValue({
    pageId: 'page-1',
    pageName: 'Skyline Homes',
    pageAccessToken: 'page-token',
  })
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

describe('form schema lookup', () => {
  beforeEach(() => {
    fetchLeadFieldData.mockResolvedValue([{ name: 'your_best_contact', values: ['+919876543210'] }])
  })

  // The whole point: a question whose KEY says nothing still lands in phone,
  // because Meta declared the question's type.
  it('maps by the declared type when the schema is available', async () => {
    fetchFormQuestions.mockResolvedValue([{ key: 'your_best_contact', label: 'Your best contact', type: 'PHONE' }])

    await processMetaLeadWebhook(payloadWithForm, 'sha256=sig')

    expect(fetchFormQuestions).toHaveBeenCalledWith('form-77', 'page-token')
    expect(createMetaLead.mock.calls[0][0].phone).toBe('+919876543210')
  })

  // Per FORM, not per lead. A form produces many leads and its schema cannot
  // change, so paying for the call once is the difference between a cheap
  // lookup and a Graph round trip on every lead.
  it('caches the schema after fetching it', async () => {
    fetchFormQuestions.mockResolvedValue([{ key: 'your_best_contact', type: 'PHONE' }])

    await processMetaLeadWebhook(payloadWithForm, 'sha256=sig')

    expect(setCachedFormQuestions).toHaveBeenCalledWith('form-77', [{ key: 'your_best_contact', type: 'PHONE' }])
  })

  it('does not re-fetch a schema it already has cached', async () => {
    getCachedFormQuestions.mockResolvedValue([{ key: 'your_best_contact', type: 'PHONE' }])

    await processMetaLeadWebhook(payloadWithForm, 'sha256=sig')

    expect(fetchFormQuestions).not.toHaveBeenCalled()
    expect(createMetaLead.mock.calls[0][0].phone).toBe('+919876543210')
  })

  // A schema we cannot read must DEGRADE the mapping, never fail the lead --
  // this runs on the lead-capture path.
  it('still saves the lead when the schema cannot be fetched', async () => {
    fetchFormQuestions.mockResolvedValue([])

    const result = await processMetaLeadWebhook(payloadWithForm, 'sha256=sig')

    expect(result.status).toBe(200)
    expect(setCachedFormQuestions).not.toHaveBeenCalled()
    // 'your_best_contact' matches no keyword rule, so layer 3 catches it.
    expect(createMetaLead.mock.calls[0][0].phone).toBe('+919876543210')
  })

  it('skips the lookup entirely when the payload carries no form_id', async () => {
    await processMetaLeadWebhook(payload, 'sha256=sig')

    expect(fetchFormQuestions).not.toHaveBeenCalled()
    expect(getCachedFormQuestions).not.toHaveBeenCalled()
  })
})

// A lead form exists as soon as the client builds the ad, so connect time is
// the earliest moment its schema can be read -- which is what gets the mapper
// Meta's declared types from the FIRST lead instead of the second.
describe('form schema prewarm on connect', () => {
  it('caches every form schema on the page', async () => {
    fetchPageLeadgenForms.mockResolvedValue([
      { formId: 'form-77', questions: [{ key: 'phone_number', type: 'PHONE' }] },
      { formId: 'form-88', questions: [{ key: 'email', type: 'EMAIL' }] },
    ])

    await connectMetaAds('client-1', 'oauth-code')

    expect(setCachedFormQuestions).toHaveBeenCalledTimes(2)
    expect(setCachedFormQuestions).toHaveBeenCalledWith('form-77', [{ key: 'phone_number', type: 'PHONE' }])
    expect(setCachedFormQuestions).toHaveBeenCalledWith('form-88', [{ key: 'email', type: 'EMAIL' }])
  })

  it('skips a form whose questions came back empty', async () => {
    fetchPageLeadgenForms.mockResolvedValue([
      { formId: 'form-77', questions: [] },
      { formId: 'form-88', questions: [{ key: 'email', type: 'EMAIL' }] },
    ])

    await connectMetaAds('client-1', 'oauth-code')

    expect(setCachedFormQuestions).toHaveBeenCalledTimes(1)
    expect(setCachedFormQuestions).toHaveBeenCalledWith('form-88', [{ key: 'email', type: 'EMAIL' }])
  })

  // The case that is live TODAY: pages_manage_ads is not granted, so the form
  // list comes back empty. The Page must still connect.
  it('connects the page even when no schema can be read', async () => {
    fetchPageLeadgenForms.mockResolvedValue([])

    await expect(connectMetaAds('client-1', 'oauth-code')).resolves.toBeUndefined()

    expect(setCachedFormQuestions).not.toHaveBeenCalled()
  })

  // The prewarm is a cache warm, not a step of the connection. A Page that has
  // claimed its mapping and subscribed its webhook is connected; losing the
  // schemas must not undo that.
  it('does not fail the connection when the prewarm throws', async () => {
    fetchPageLeadgenForms.mockRejectedValue(new Error('graph exploded'))

    await expect(connectMetaAds('client-1', 'oauth-code')).resolves.toBeUndefined()
  })

  it('runs only after the webhook subscription has succeeded', async () => {
    const order: string[] = []
    subscribePageToWebhook.mockImplementation(async () => {
      order.push('subscribe')
    })
    fetchPageLeadgenForms.mockImplementation(async () => {
      order.push('prewarm')
      return []
    })

    await connectMetaAds('client-1', 'oauth-code')

    expect(order).toEqual(['subscribe', 'prewarm'])
  })
})
