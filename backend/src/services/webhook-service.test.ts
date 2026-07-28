import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mocked purely because webhook-service.ts's top-level imports pull in
// unrelated dependency graphs (razorpay-provider.js needs real Razorpay
// keys to load at all; entitlement-service.js and lead-service.js each
// reach several more DynamoDB-table-backed repositories). Same "mock the
// boundary this test doesn't exercise" pattern used elsewhere (e.g.
// scheduler-service.test.ts's whatsapp-service.js mock). getLeadsForClient
// IS exercised directly below, just via its mock rather than real
// lead-service.ts/lead-repository.ts/conversation-repository.ts behavior.
vi.mock('../providers/razorpay-provider.js', () => ({ razorpayProvider: {} }))
vi.mock('./entitlement-service.js', () => ({ invalidateEntitlementsCache: vi.fn() }))
const getLeadsForClient = vi.fn()
vi.mock('./lead-service.js', () => ({ getLeadsForClient }))
const getClientIdForGupshupApp = vi.fn()
vi.mock('../repositories/gupshup-app-lookup-repository.js', () => ({ getClientIdForGupshupApp }))
const recordInboundMessage = vi.fn()
vi.mock('../repositories/whatsapp-inbound-activity-repository.js', () => ({ recordInboundMessage }))

const { logGupshupWebhookEvent, verifyGupshupWebhookToken } = await import('./webhook-service.js')

const ORIGINAL_TOKEN = process.env.GUPSHUP_WEBHOOK_TOKEN

describe('verifyGupshupWebhookToken', () => {
  beforeEach(() => {
    process.env.GUPSHUP_WEBHOOK_TOKEN = 'correct-secret'
  })

  afterEach(() => {
    process.env.GUPSHUP_WEBHOOK_TOKEN = ORIGINAL_TOKEN
  })

  it('accepts the correct token', () => {
    expect(verifyGupshupWebhookToken('correct-secret')).toBe(true)
  })

  it('rejects a wrong token', () => {
    expect(verifyGupshupWebhookToken('wrong-secret')).toBe(false)
  })

  it('rejects a missing token', () => {
    expect(verifyGupshupWebhookToken(undefined)).toBe(false)
  })

  // Regression guard: a naive substring/prefix comparison could accept
  // "correct-secret-extra" or similar. timingSafeEqual requires equal
  // buffer length, which the length check before it enforces explicitly
  // (timingSafeEqual itself throws on mismatched lengths rather than
  // returning false).
  it('rejects a token that only differs in length', () => {
    expect(verifyGupshupWebhookToken('correct-secret-extra')).toBe(false)
    expect(verifyGupshupWebhookToken('correct-secre')).toBe(false)
  })

  it('throws when GUPSHUP_WEBHOOK_TOKEN is not configured', () => {
    delete process.env.GUPSHUP_WEBHOOK_TOKEN
    expect(() => verifyGupshupWebhookToken('anything')).toThrow(/GUPSHUP_WEBHOOK_TOKEN/)
  })
})

function incomingMessage(app: string | undefined, source: string) {
  return {
    type: 'message',
    timestamp: Date.now(),
    app,
    payload: { id: 'msg-1', source, payload: { text: 'hi' } },
  }
}

describe('logGupshupWebhookEvent (inbound message resolution)', () => {
  beforeEach(() => {
    getLeadsForClient.mockReset()
    getClientIdForGupshupApp.mockReset()
    recordInboundMessage.mockReset()
  })

  it('records the inbound timestamp for the lead whose phone matches, across differing formats', async () => {
    getClientIdForGupshupApp.mockResolvedValueOnce('client-1')
    getLeadsForClient.mockResolvedValueOnce([
      { leadId: 'lead-1', phone: '+91 82988 82194' },
      { leadId: 'lead-2', phone: '9999999999' },
    ])

    await logGupshupWebhookEvent(incomingMessage('DemoApp', '918298882194'))

    expect(getClientIdForGupshupApp).toHaveBeenCalledWith('DemoApp')
    expect(recordInboundMessage).toHaveBeenCalledWith('lead-1')
  })

  it('does not record anything when the app field is missing', async () => {
    await logGupshupWebhookEvent(incomingMessage(undefined, '918298882194'))

    expect(getClientIdForGupshupApp).not.toHaveBeenCalled()
    expect(recordInboundMessage).not.toHaveBeenCalled()
  })

  it('does not record anything for an unmapped app', async () => {
    getClientIdForGupshupApp.mockResolvedValueOnce(null)

    await logGupshupWebhookEvent(incomingMessage('UnknownApp', '918298882194'))

    expect(getLeadsForClient).not.toHaveBeenCalled()
    expect(recordInboundMessage).not.toHaveBeenCalled()
  })

  it('does not record anything when no lead matches the phone number', async () => {
    getClientIdForGupshupApp.mockResolvedValueOnce('client-1')
    getLeadsForClient.mockResolvedValueOnce([{ leadId: 'lead-1', phone: '+1 5551234567' }])

    await logGupshupWebhookEvent(incomingMessage('DemoApp', '918298882194'))

    expect(recordInboundMessage).not.toHaveBeenCalled()
  })

  // A DynamoDB blip resolving/recording an inbound message must never turn
  // an otherwise-successful webhook delivery into a failure Gupshup would
  // interpret as needing a retry -- this is best-effort enrichment, not
  // the acknowledgement itself.
  it('never throws, even if resolution fails partway through', async () => {
    getClientIdForGupshupApp.mockRejectedValueOnce(new Error('DynamoDB is down'))

    await expect(logGupshupWebhookEvent(incomingMessage('DemoApp', '918298882194'))).resolves.toBeUndefined()
  })
})
