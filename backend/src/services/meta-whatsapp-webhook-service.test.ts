import crypto from 'crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// This service's import graph reaches the client repository, the inbound
// activity repository, the lead matcher and the journey reply service. None of
// that is exercised by the signature tests below, so each boundary is mocked --
// same pattern as whatsapp-service.test.ts.
const getConnectedWhatsAppClients = vi.fn()
const recordInboundMessage = vi.fn()
const matchLeadForInboundMessage = vi.fn()
const handleInboundLeadMessage = vi.fn()

vi.mock('../repositories/client-repository.js', () => ({ getConnectedWhatsAppClients }))
vi.mock('../repositories/whatsapp-inbound-activity-repository.js', () => ({ recordInboundMessage }))
vi.mock('./inbound-lead-match-service.js', () => ({
  matchLeadForInboundMessage,
  logInboundMatch: vi.fn(),
}))
vi.mock('./journey-reply-service.js', () => ({ handleInboundLeadMessage }))

const APP_SECRET = 'test-app-secret'

const { processMetaWhatsAppWebhook } = await import('./meta-whatsapp-webhook-service.js')

function sign(rawBody: string, secret = APP_SECRET): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`
}

const INBOUND_BODY = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [
    {
      changes: [
        {
          field: 'messages',
          value: {
            metadata: { phone_number_id: 'phone-1' },
            messages: [{ from: '919000000001', type: 'text', text: { body: 'hello' } }],
          },
        },
      ],
    },
  ],
})

beforeEach(() => {
  process.env.META_APP_SECRET = APP_SECRET
  getConnectedWhatsAppClients.mockReset().mockResolvedValue([
    { clientId: 'client-1', metaDirectWhatsAppConnection: { phoneNumberId: 'phone-1' } },
  ])
  recordInboundMessage.mockReset().mockResolvedValue(undefined)
  matchLeadForInboundMessage.mockReset().mockResolvedValue({
    lead: { leadId: 'lead-1', botId: 'bot-1', phone: '919000000001' },
    candidateCount: 1,
    reason: 'only_match',
  })
  handleInboundLeadMessage.mockReset().mockResolvedValue({ handled: 'resumed' })
})

describe('processMetaWhatsAppWebhook signature verification', () => {
  // The gap this endpoint shipped with until 2026-08-16: anyone who knew the URL
  // could forge an inbound message. Bounded then only by the pending-token
  // binding; inbound-created leads would have removed that bound.
  it('rejects a request with no signature and processes nothing', async () => {
    const result = await processMetaWhatsAppWebhook(INBOUND_BODY, undefined)

    expect(result.status).toBe(400)
    expect(matchLeadForInboundMessage).not.toHaveBeenCalled()
    expect(recordInboundMessage).not.toHaveBeenCalled()
    expect(handleInboundLeadMessage).not.toHaveBeenCalled()
  })

  it('rejects a request signed with the wrong secret', async () => {
    const result = await processMetaWhatsAppWebhook(INBOUND_BODY, sign(INBOUND_BODY, 'not-the-secret'))

    expect(result.status).toBe(400)
    expect(matchLeadForInboundMessage).not.toHaveBeenCalled()
  })

  it('rejects a malformed signature header', async () => {
    const result = await processMetaWhatsAppWebhook(INBOUND_BODY, 'definitely-not-sha256-prefixed')

    expect(result.status).toBe(400)
    expect(matchLeadForInboundMessage).not.toHaveBeenCalled()
  })

  // The signature covers the exact bytes Meta sent. A body that differs by even
  // one character must not verify, which is why the route reads raw text rather
  // than parsing and re-serialising.
  it('rejects when the body differs from what was signed', async () => {
    const signature = sign(INBOUND_BODY)
    const tampered = INBOUND_BODY.replace('919000000001', '919999999999')

    const result = await processMetaWhatsAppWebhook(tampered, signature)

    expect(result.status).toBe(400)
    expect(matchLeadForInboundMessage).not.toHaveBeenCalled()
  })

  it('accepts and processes a correctly signed request', async () => {
    const result = await processMetaWhatsAppWebhook(INBOUND_BODY, sign(INBOUND_BODY))

    expect(result.status).toBe(200)
    expect(matchLeadForInboundMessage).toHaveBeenCalledWith('client-1', '919000000001')
    expect(recordInboundMessage).toHaveBeenCalledWith('lead-1')
    expect(handleInboundLeadMessage).toHaveBeenCalledWith('lead-1', 'hello')
  })

  // A misconfigured secret would reject GENUINE Meta traffic. That must read as
  // "our fault, retry" rather than "your request is bad", or Meta backs off and
  // eventually disables the webhook over what is our own broken config.
  it('returns 500, not 400, when META_APP_SECRET is missing', async () => {
    delete process.env.META_APP_SECRET

    const result = await processMetaWhatsAppWebhook(INBOUND_BODY, sign(INBOUND_BODY))

    expect(result.status).toBe(500)
    expect(matchLeadForInboundMessage).not.toHaveBeenCalled()
  })

  // Signed by Meta but unusable. Still 200: Meta retries non-2xx and disables a
  // webhook that keeps failing, and no number of retries will make this parse.
  it('returns 200 for a signed request whose body is not JSON', async () => {
    const notJson = 'this is not json'

    const result = await processMetaWhatsAppWebhook(notJson, sign(notJson))

    expect(result.status).toBe(200)
    expect(matchLeadForInboundMessage).not.toHaveBeenCalled()
  })

  it('returns 200 and ignores a signed payload for a different object type', async () => {
    const otherObject = JSON.stringify({ object: 'page', entry: [] })

    const result = await processMetaWhatsAppWebhook(otherObject, sign(otherObject))

    expect(result.status).toBe(200)
    expect(matchLeadForInboundMessage).not.toHaveBeenCalled()
  })
})
