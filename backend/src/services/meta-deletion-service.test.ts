import { beforeEach, describe, expect, it, vi } from 'vitest'

// meta-lead-service reaches the whole Meta ingest graph at import time; only
// the deletion path is under test here, so everything else is stubbed.
const parseSignedRequest = vi.fn()
vi.mock('../providers/meta-provider.js', () => ({
  metaProvider: { parseSignedRequest },
}))

const createMetaDeletionRequest = vi.fn()
const getMetaDeletionRequest = vi.fn()
const markMetaDeletionRequestNotified = vi.fn()
vi.mock('../repositories/meta-deletion-request-repository.js', () => ({
  createMetaDeletionRequest,
  getMetaDeletionRequest,
  markMetaDeletionRequestNotified,
}))

const sendEmail = vi.fn()
const getContactNotificationAddress = vi.fn()
vi.mock('../repositories/email-repository.js', () => ({
  sendEmail,
  getContactNotificationAddress,
}))

vi.mock('./crm-service.js', () => ({ getProvider: vi.fn(), syncLeadToCRMWithRetry: vi.fn() }))
vi.mock('./whatsapp-service.js', () => ({ sendLeadNotification: vi.fn() }))
vi.mock('./journey-ignition-service.js', () => ({ igniteJourneysForLead: vi.fn() }))
vi.mock('../lib/kms.js', () => ({ decrypt: vi.fn(), encrypt: vi.fn() }))
vi.mock('../repositories/client-repository.js', () => ({
  getClientById: vi.fn(),
  removeClientMetaConnection: vi.fn(),
  updateClient: vi.fn(),
}))
vi.mock('../repositories/meta-lead-repository.js', () => ({
  createMetaLead: vi.fn(),
  getClientIdForPage: vi.fn(),
  getMetaLeadsByClientId: vi.fn(),
  MetaPageConflictError: class extends Error {},
  removePageClientMapping: vi.fn(),
  setPageClientMapping: vi.fn(),
  updateMetaLeadSyncStatus: vi.fn(),
}))
vi.mock('../repositories/webhook-event-repository.js', () => ({
  hasProcessed: vi.fn(),
  markProcessed: vi.fn(),
}))

const { getMetaDeletionRequestStatus, handleMetaDataDeletionRequest } = await import(
  './meta-lead-service.js'
)

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})

  parseSignedRequest.mockReturnValue({ user_id: '4512644655638994' })
  createMetaDeletionRequest.mockImplementation(async (record: unknown) => record)
  markMetaDeletionRequestNotified.mockResolvedValue(undefined)
  getContactNotificationAddress.mockReturnValue('support@vyostra.com')
  sendEmail.mockResolvedValue(undefined)
})

describe('handleMetaDataDeletionRequest', () => {
  it('rejects a request whose signature does not verify, and stores nothing', async () => {
    parseSignedRequest.mockReturnValue(null)

    const result = await handleMetaDataDeletionRequest('bogus.signed-request')

    expect(result.verified).toBe(false)
    expect(createMetaDeletionRequest).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('persists the request with the Meta user id before returning the code', async () => {
    const result = await handleMetaDataDeletionRequest('valid.signed-request')

    expect(result.verified).toBe(true)
    expect(createMetaDeletionRequest).toHaveBeenCalledTimes(1)

    const stored = createMetaDeletionRequest.mock.calls[0][0]
    expect(stored.confirmationCode).toBe(result.confirmationCode)
    expect(stored.metaUserId).toBe('4512644655638994')
    expect(stored.status).toBe('received')
    expect(stored.notified).toBe(false)
    expect(Date.parse(stored.requestedAt)).not.toBeNaN()
  })

  // The regression this whole change exists for: the old code derived the
  // confirmation code from Date.now(), so two requests in the same millisecond
  // collided and any code was guessable from a timestamp.
  it('issues an unguessable code that differs between two requests', async () => {
    const first = await handleMetaDataDeletionRequest('valid.signed-request')
    const second = await handleMetaDataDeletionRequest('valid.signed-request')

    expect(first.confirmationCode).not.toBe(second.confirmationCode)
    expect(first.confirmationCode).toMatch(/^mdr_[0-9a-f]{32}$/)
  })

  it('emails ops and flags the row as notified', async () => {
    const result = await handleMetaDataDeletionRequest('valid.signed-request')

    expect(sendEmail).toHaveBeenCalledTimes(1)
    const email = sendEmail.mock.calls[0][0]
    expect(email.to).toBe('support@vyostra.com')
    expect(email.subject).toContain(result.confirmationCode)
    expect(email.textBody).toContain('4512644655638994')
    expect(markMetaDeletionRequestNotified).toHaveBeenCalledWith(result.confirmationCode)
  })

  it('still verifies the request when SES is unconfigured, leaving notified false', async () => {
    getContactNotificationAddress.mockReturnValue(null)

    const result = await handleMetaDataDeletionRequest('valid.signed-request')

    expect(result.verified).toBe(true)
    expect(createMetaDeletionRequest).toHaveBeenCalledTimes(1)
    expect(markMetaDeletionRequestNotified).not.toHaveBeenCalled()
  })

  it('still verifies the request when the notification email throws', async () => {
    sendEmail.mockRejectedValue(new Error('SES down'))

    const result = await handleMetaDataDeletionRequest('valid.signed-request')

    expect(result.verified).toBe(true)
    expect(markMetaDeletionRequestNotified).not.toHaveBeenCalled()
  })

  it('does not fail the callback when flagging the row as notified fails', async () => {
    markMetaDeletionRequestNotified.mockRejectedValue(new Error('Dynamo down'))

    await expect(handleMetaDataDeletionRequest('valid.signed-request')).resolves.toMatchObject({
      verified: true,
    })
  })

  it('records the request even when Meta omits user_id', async () => {
    parseSignedRequest.mockReturnValue({})

    await handleMetaDataDeletionRequest('valid.signed-request')

    expect(createMetaDeletionRequest.mock.calls[0][0].metaUserId).toBe('unknown')
  })
})

describe('getMetaDeletionRequestStatus', () => {
  it('returns null for a code that was never issued', async () => {
    getMetaDeletionRequest.mockResolvedValue(null)

    expect(await getMetaDeletionRequestStatus('mdr_nope')).toBeNull()
  })

  it('does not expose the Meta user id to the public status page', async () => {
    getMetaDeletionRequest.mockResolvedValue({
      confirmationCode: 'mdr_abc',
      metaUserId: '4512644655638994',
      status: 'received',
      requestedAt: '2026-08-10T00:00:00.000Z',
      notified: true,
    })

    const status = await getMetaDeletionRequestStatus('mdr_abc')

    expect(status).toEqual({
      confirmationCode: 'mdr_abc',
      status: 'received',
      requestedAt: '2026-08-10T00:00:00.000Z',
    })
    expect(JSON.stringify(status)).not.toContain('4512644655638994')
  })
})
