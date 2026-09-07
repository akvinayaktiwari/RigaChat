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
const appendLeadEvent = vi.fn()
const getEventByWamid = vi.fn()
const countInboundLeadsSince = vi.fn()
const createLead = vi.fn()
const resolveAgentForInboundMessage = vi.fn()
const runAgentTurn = vi.fn()
const claimWebhookEvent = vi.fn()
const releaseWebhookEventClaim = vi.fn()

vi.mock('../repositories/client-repository.js', () => ({ getConnectedWhatsAppClients }))
vi.mock('../repositories/whatsapp-inbound-activity-repository.js', () => ({ recordInboundMessage }))
vi.mock('./inbound-lead-match-service.js', () => ({
  matchLeadForInboundMessage,
  logInboundMatch: vi.fn(),
}))
vi.mock('./journey-reply-service.js', () => ({ handleInboundLeadMessage }))
vi.mock('../repositories/lead-event-repository.js', () => ({
  appendLeadEvent,
  getEventByWamid,
  countInboundLeadsSince,
}))
vi.mock('../repositories/lead-repository.js', () => ({ createLead }))
vi.mock('./inbound-agent-resolution-service.js', () => ({ resolveAgentForInboundMessage }))
vi.mock('./agent-turn-service.js', () => ({ runAgentTurn }))
vi.mock('../repositories/webhook-event-repository.js', () => ({
  claimWebhookEvent,
  releaseWebhookEventClaim,
}))

const sendLeadNotificationEmail = vi.fn()
vi.mock('./lead-notification-service.js', async () => {
  // notificationInputFromEvent is a pure mapper with its own coverage in
  // lead-notification-service.test.ts, so the real one is kept here -- the
  // point of these tests is what the status path decides, not how it maps.
  const actual = await vi.importActual<typeof import('./lead-notification-service.js')>(
    './lead-notification-service.js'
  )
  return { notificationInputFromEvent: actual.notificationInputFromEvent, sendLeadNotificationEmail }
})

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
            messages: [{ id: 'wamid-inbound-1', from: '919000000001', type: 'text', text: { body: 'hello' } }],
          },
        },
      ],
    },
  ],
})

beforeEach(() => {
  sendLeadNotificationEmail.mockReset().mockResolvedValue({ notified: true, via: 'email' })
  process.env.META_APP_SECRET = APP_SECRET
  getConnectedWhatsAppClients.mockReset().mockResolvedValue([
    { clientId: 'client-1', metaDirectWhatsAppConnection: { phoneNumberId: 'phone-1' } },
  ])
  recordInboundMessage.mockReset().mockResolvedValue(undefined)
  matchLeadForInboundMessage.mockReset().mockResolvedValue({
    leadId: 'lead-1',
    botId: 'bot-1',
    leadRef: { source: 'chat', botId: 'bot-1', leadId: 'lead-1' },
    journeyLead: { leadId: 'lead-1', clientId: 'client-1', source: 'chat', phone: '919000000001' },
    candidateCount: 1,
    reason: 'only_match',
  })
  handleInboundLeadMessage.mockReset().mockResolvedValue({ handled: 'resumed' })
  appendLeadEvent.mockReset().mockResolvedValue(undefined)
  getEventByWamid.mockReset().mockResolvedValue(null)
  countInboundLeadsSince.mockReset().mockResolvedValue(0)
  createLead.mockReset().mockResolvedValue({ leadId: 'new-lead', botId: 'bot-1', clientId: 'client-1' })
  resolveAgentForInboundMessage.mockReset().mockResolvedValue({
    agent: { agentId: 'agent-1' },
    botId: 'bot-1',
    strategy: 'number_binding',
  })
  runAgentTurn.mockReset().mockResolvedValue({ status: 'sent', text: 'an answer' })
  claimWebhookEvent.mockReset().mockResolvedValue(true)
  releaseWebhookEventClaim.mockReset().mockResolvedValue(undefined)
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
    // Third arg is the agent's composed reply, undefined here because the turn
    // already sent it (no journey was parked).
    expect(handleInboundLeadMessage).toHaveBeenCalledWith('lead-1', 'hello', undefined)
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

describe('lead_events written from the webhook', () => {
  it('records message_in for a signed inbound message', async () => {
    await processMetaWhatsAppWebhook(INBOUND_BODY, sign(INBOUND_BODY))

    expect(appendLeadEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: 'lead-1',
        type: 'message_in',
        channel: 'whatsapp',
        body: 'hello',
      })
    )
  })

  it('writes nothing when the signature is rejected', async () => {
    await processMetaWhatsAppWebhook(INBOUND_BODY, undefined)

    expect(appendLeadEvent).not.toHaveBeenCalled()
  })

  // A status payload has a wamid and a recipient and no leadId. The sparse
  // wamid GSI is the only way back to the conversation it belongs to.
  it('correlates a delivery status to its lead via the wamid index', async () => {
    getEventByWamid.mockResolvedValue({
      leadId: 'lead-9',
      clientId: 'client-9',
      botId: 'bot-9',
    })
    const body = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: { statuses: [{ id: 'wamid-abc', status: 'delivered', recipient_id: '91900' }] } }] }],
    })

    await processMetaWhatsAppWebhook(body, sign(body))

    expect(getEventByWamid).toHaveBeenCalledWith('wamid-abc')
    expect(appendLeadEvent).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: 'lead-9', type: 'message_status', status: 'delivered', wamid: 'wamid-abc' })
    )
  })

  // Statuses also arrive for the client-notification template and manual smoke
  // tests, which belong to no lead. Normal, not an error.
  it('records nothing for a status whose wamid is not ours', async () => {
    getEventByWamid.mockResolvedValue(null)
    const body = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: { statuses: [{ id: 'not-ours', status: 'read' }] } }] }],
    })

    const result = await processMetaWhatsAppWebhook(body, sign(body))

    expect(result.status).toBe(200)
    expect(appendLeadEvent).not.toHaveBeenCalled()
  })

  it('keeps Meta failure detail verbatim on a failed status', async () => {
    getEventByWamid.mockResolvedValue({ leadId: 'lead-9', clientId: 'c', botId: 'b' })
    const body = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: { statuses: [{ id: 'w1', status: 'failed', errors: [{ code: 131047, title: 'Re-engagement message' }] }] } }] }],
    })

    await processMetaWhatsAppWebhook(body, sign(body))

    expect(appendLeadEvent).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', errorDetail: expect.stringContaining('131047') })
    )
  })

  // The bug this whole path exists for: Meta ACCEPTS a lead alert (200 + a
  // wamid, so the send call reports success) and only reports the failure here,
  // asynchronously. If this webhook does not trigger the fallback, nothing does
  // and the client is never told a lead came in.
  it('emails the client when a lead alert is reported undelivered', async () => {
    getEventByWamid.mockResolvedValue({
      leadId: 'lead-9',
      clientId: 'client-9',
      botId: 'bot-9',
      type: 'notification_out',
      result: { source: 'Website chat', name: 'Ravi Kumar', phone: '+919876543210' },
    })
    const body = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  { id: 'w1', status: 'failed', errors: [{ code: 131047, title: 'Re-engagement message' }] },
                ],
              },
            },
          ],
        },
      ],
    })

    await processMetaWhatsAppWebhook(body, sign(body))

    expect(sendLeadNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: 'lead-9', clientId: 'client-9', source: 'Website chat', name: 'Ravi Kumar' }),
      expect.stringContaining('131047')
    )
  })

  // A failed message to the LEAD is a different problem with a different
  // remedy. Emailing the client every time one of those fails would turn a
  // safety net into a noise generator.
  it('does not email the client when the failed message was one sent to the lead', async () => {
    getEventByWamid.mockResolvedValue({
      leadId: 'lead-9',
      clientId: 'client-9',
      botId: 'bot-9',
      type: 'message_out',
    })
    const body = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: { statuses: [{ id: 'w1', status: 'failed', errors: [{ code: 131026 }] }] } }] }],
    })

    await processMetaWhatsAppWebhook(body, sign(body))

    expect(sendLeadNotificationEmail).not.toHaveBeenCalled()
  })

  it('does not email when a lead alert is delivered normally', async () => {
    getEventByWamid.mockResolvedValue({
      leadId: 'lead-9',
      clientId: 'client-9',
      botId: 'bot-9',
      type: 'notification_out',
    })
    const body = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: { statuses: [{ id: 'w1', status: 'delivered' }] } }] }],
    })

    await processMetaWhatsAppWebhook(body, sign(body))

    expect(sendLeadNotificationEmail).not.toHaveBeenCalled()
  })

  // Meta has added status values over time. Anything outside the four we model
  // is logged and dropped rather than written as something the UI cannot render.
  it('ignores a status value it does not model', async () => {
    getEventByWamid.mockResolvedValue({ leadId: 'lead-9', clientId: 'c', botId: 'b' })
    const body = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: { statuses: [{ id: 'w1', status: 'warped' }] } }] }],
    })

    await processMetaWhatsAppWebhook(body, sign(body))

    expect(appendLeadEvent).not.toHaveBeenCalled()
  })
})

describe('inbound lead creation (click-to-WhatsApp)', () => {
  // The flow that was a complete no-op before #10: a visitor taps a client's
  // WhatsApp button, messages the number, and no lead existed to answer them.
  it('creates a lead for a number that has never messaged before', async () => {
    matchLeadForInboundMessage.mockResolvedValue(null)

    await processMetaWhatsAppWebhook(INBOUND_BODY, sign(INBOUND_BODY))

    expect(createLead).toHaveBeenCalledWith(
      expect.objectContaining({ botId: 'bot-1', clientId: 'client-1', phone: '919000000001' })
    )
    expect(appendLeadEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'lead_captured', channel: 'whatsapp' }))
  })

  // Lead requires a sourceUrl and a WhatsApp lead has no page. A marker naming
  // the number beats an empty string in the CRM's Source column.
  it('records the business number as the source', async () => {
    matchLeadForInboundMessage.mockResolvedValue(null)

    await processMetaWhatsAppWebhook(INBOUND_BODY, sign(INBOUND_BODY))

    expect(createLead).toHaveBeenCalledWith(
      expect.objectContaining({ sourceUrl: expect.stringContaining('whatsapp:') })
    )
  })

  it('reuses an existing lead rather than creating a second', async () => {
    await processMetaWhatsAppWebhook(INBOUND_BODY, sign(INBOUND_BODY))

    expect(createLead).not.toHaveBeenCalled()
  })

  // Over the cap: create NOTHING and answer NOTHING. Replying to someone with no
  // lead row means they cannot opt out of the replies, since opt-out is keyed by
  // leadId.
  it('creates nothing and answers nothing over the hourly cap', async () => {
    matchLeadForInboundMessage.mockResolvedValue(null)
    countInboundLeadsSince.mockResolvedValue(60)

    await processMetaWhatsAppWebhook(INBOUND_BODY, sign(INBOUND_BODY))

    expect(createLead).not.toHaveBeenCalled()
    expect(handleInboundLeadMessage).not.toHaveBeenCalled()
    expect(appendLeadEvent).not.toHaveBeenCalled()
  })

  it('does not create a lead from a non-text message', async () => {
    matchLeadForInboundMessage.mockResolvedValue(null)
    const reaction = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: { metadata: { phone_number_id: 'phone-1' }, messages: [{ from: '919000000001', type: 'reaction' }] } }] }],
    })

    await processMetaWhatsAppWebhook(reaction, sign(reaction))

    expect(createLead).not.toHaveBeenCalled()
  })

  it('does not create a lead from an empty text body', async () => {
    matchLeadForInboundMessage.mockResolvedValue(null)
    const empty = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: { metadata: { phone_number_id: 'phone-1' }, messages: [{ from: '919000000001', type: 'text', text: { body: '   ' } }] } }] }],
    })

    await processMetaWhatsAppWebhook(empty, sign(empty))

    expect(createLead).not.toHaveBeenCalled()
  })

  it('creates nothing when no Agent resolves for the number', async () => {
    matchLeadForInboundMessage.mockResolvedValue(null)
    resolveAgentForInboundMessage.mockResolvedValue(null)

    await processMetaWhatsAppWebhook(INBOUND_BODY, sign(INBOUND_BODY))

    expect(createLead).not.toHaveBeenCalled()
  })
})

describe('agent turn ordering (D12: exactly one message per inbound message)', () => {
  // The whole point. When a journey is parked the turn composes but does NOT
  // send; the text rides into the resume payload so the journey's next
  // send_message step sends it. Both sending is the double-send this prevents.
  it('hands the composed reply to the journey instead of sending it', async () => {
    runAgentTurn.mockResolvedValue({ status: 'composed_for_journey', text: 'A 3 BHK starts at 90L.' })

    await processMetaWhatsAppWebhook(INBOUND_BODY, sign(INBOUND_BODY))

    expect(handleInboundLeadMessage).toHaveBeenCalledWith('lead-1', 'hello', 'A 3 BHK starts at 90L.')
  })

  it('passes no composed reply when the turn already sent one', async () => {
    runAgentTurn.mockResolvedValue({ status: 'sent', text: 'sent directly' })

    await processMetaWhatsAppWebhook(INBOUND_BODY, sign(INBOUND_BODY))

    expect(handleInboundLeadMessage).toHaveBeenCalledWith('lead-1', 'hello', undefined)
  })

  it('passes no composed reply when the turn was skipped', async () => {
    runAgentTurn.mockResolvedValue({ status: 'skipped', reason: 'opted_out' })

    await processMetaWhatsAppWebhook(INBOUND_BODY, sign(INBOUND_BODY))

    expect(handleInboundLeadMessage).toHaveBeenCalledWith('lead-1', 'hello', undefined)
  })

  // The turn runs first so its answer can ride into the resume. Reversing the
  // order means the state machine wakes and sends before the agent has composed.
  it('runs the turn before resuming the journey', async () => {
    const order: string[] = []
    runAgentTurn.mockImplementation(async () => {
      order.push('turn')
      return { status: 'composed_for_journey', text: 'x' }
    })
    handleInboundLeadMessage.mockImplementation(async () => {
      order.push('resume')
      return { handled: 'resumed' }
    })

    await processMetaWhatsAppWebhook(INBOUND_BODY, sign(INBOUND_BODY))

    expect(order).toEqual(['turn', 'resume'])
  })

  it('still resumes the journey when no Agent resolves', async () => {
    resolveAgentForInboundMessage.mockResolvedValue(null)

    await processMetaWhatsAppWebhook(INBOUND_BODY, sign(INBOUND_BODY))

    expect(runAgentTurn).not.toHaveBeenCalled()
    expect(handleInboundLeadMessage).toHaveBeenCalledWith('lead-1', 'hello', undefined)
  })
})

describe('retry safety (D6)', () => {
  // Processing now costs an OpenAI completion and a WhatsApp send, so a Meta
  // retry must not redo it. The claim is atomic because hasProcessed +
  // markProcessed is a read then an unconditional write, which two concurrent
  // retries both pass.
  it('claims the message id before doing any work', async () => {
    await processMetaWhatsAppWebhook(INBOUND_BODY, sign(INBOUND_BODY))

    expect(claimWebhookEvent).toHaveBeenCalledWith('wamid-inbound-1', 'meta_whatsapp', 'inbound_message')
  })

  it('does nothing when the claim is already held', async () => {
    claimWebhookEvent.mockResolvedValue(false)

    await processMetaWhatsAppWebhook(INBOUND_BODY, sign(INBOUND_BODY))

    expect(runAgentTurn).not.toHaveBeenCalled()
    expect(handleInboundLeadMessage).not.toHaveBeenCalled()
    expect(appendLeadEvent).not.toHaveBeenCalled()
  })

  // Claim-then-crash would swallow a real customer message forever, which is
  // worse than the duplicate the claim prevents.
  it('hands the claim back when processing fails', async () => {
    runAgentTurn.mockRejectedValue(new Error('openai exploded'))

    await processMetaWhatsAppWebhook(INBOUND_BODY, sign(INBOUND_BODY))

    expect(releaseWebhookEventClaim).toHaveBeenCalledWith('wamid-inbound-1')
  })

  it('keeps the claim when processing succeeds', async () => {
    await processMetaWhatsAppWebhook(INBOUND_BODY, sign(INBOUND_BODY))

    expect(releaseWebhookEventClaim).not.toHaveBeenCalled()
  })

  // Older payload shapes carry no id. Dropping a real message because we cannot
  // deduplicate it would be the wrong trade.
  it('still processes a message that carries no id', async () => {
    const noId = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: { metadata: { phone_number_id: 'phone-1' }, messages: [{ from: '919000000001', type: 'text', text: { body: 'hi' } }] } }] }],
    })

    await processMetaWhatsAppWebhook(noId, sign(noId))

    expect(claimWebhookEvent).not.toHaveBeenCalled()
    expect(handleInboundLeadMessage).toHaveBeenCalled()
  })
})

describe('processMetaWhatsAppWebhook account_update', () => {
  const ACCOUNT_UPDATE_BODY = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-1',
        changes: [
          {
            field: 'account_update',
            value: {
              event: 'ACCOUNT_VIOLATION',
              phone_number: '919000000001',
              ban_info: { waba_ban_state: 'SCHEDULE_FOR_DISABLE' },
              restriction_info: [{ restriction_type: 'RESTRICTED_BIZ_INITIATED_MESSAGING' }],
            },
          },
        ],
      },
    ],
  })

  it('logs the event instead of discarding it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await processMetaWhatsAppWebhook(ACCOUNT_UPDATE_BODY, sign(ACCOUNT_UPDATE_BODY))

    const line = warn.mock.calls.map((c) => String(c[0])).find((c) => c.includes('[wa-account-update]'))
    expect(line).toContain('ACCOUNT_VIOLATION')
    expect(line).toContain('SCHEDULE_FOR_DISABLE')
    expect(line).toContain('RESTRICTED_BIZ_INITIATED_MESSAGING')
    warn.mockRestore()
  })

  // An account_update carries no messages. It must not fall through into the
  // inbound path and be mistaken for one.
  it('does not route an account_update into the inbound message path', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await processMetaWhatsAppWebhook(ACCOUNT_UPDATE_BODY, sign(ACCOUNT_UPDATE_BODY))

    expect(handleInboundLeadMessage).not.toHaveBeenCalled()
    expect(recordInboundMessage).not.toHaveBeenCalled()
    vi.mocked(console.warn).mockRestore?.()
  })

  it('still returns 200 so Meta does not retry', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await processMetaWhatsAppWebhook(ACCOUNT_UPDATE_BODY, sign(ACCOUNT_UPDATE_BODY))

    expect(result.status).toBe(200)
    vi.mocked(console.warn).mockRestore?.()
  })
})

