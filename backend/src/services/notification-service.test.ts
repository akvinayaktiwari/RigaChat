import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LeadEvent } from '../types/index.js'

const readJourneyLead = vi.fn()
vi.mock('./lead-resolution-service.js', () => ({ readJourneyLead }))

const getLeadEvents = vi.fn()
vi.mock('../repositories/lead-event-repository.js', () => ({ getLeadEvents }))

const sendWhatsAppTemplateToClientNumber = vi.fn()
vi.mock('./whatsapp-service.js', () => ({ sendWhatsAppTemplateToClientNumber }))

const { flattenTemplateParam, leadDetailUrl, sendHandoffAlert, summarizeRecentMessages } = await import(
  './notification-service.js'
)

const chatRef = { source: 'chat' as const, botId: 'bot-1', leadId: 'lead-1' }

const baseInput = {
  leadRef: chatRef,
  clientId: 'client-1',
  reason: 'No booking after 3 follow-ups',
  trigger: 'hand_to_agent' as const,
}

function messageEvent(type: 'message_in' | 'message_out', body: string): LeadEvent {
  return { leadId: 'lead-1', ts: '2026-08-16T10:00:00.000Z#a', clientId: 'client-1', botId: 'bot-1', type, body }
}

beforeEach(() => {
  readJourneyLead.mockReset()
  readJourneyLead.mockResolvedValue({ leadId: 'lead-1', clientId: 'client-1', source: 'chat', name: 'Ravi Kumar', phone: '+919876543210' })
  getLeadEvents.mockReset()
  getLeadEvents.mockResolvedValue([])
  sendWhatsAppTemplateToClientNumber.mockReset()
  sendWhatsAppTemplateToClientNumber.mockResolvedValue({ success: true, messageId: 'wamid.1' })
  process.env.FRONTEND_URL = 'https://vyostra.com'
})

describe('sendHandoffAlert', () => {
  it('sends the approved template with the lead, the reason and a deep link', async () => {
    getLeadEvents.mockResolvedValueOnce([
      messageEvent('message_in', 'Yes i just wanna know about pricing'),
      messageEvent('message_out', "I don't have that information right now."),
    ])

    const result = await sendHandoffAlert(baseInput)

    expect(result).toEqual({ notified: true })
    const [clientId, templateName, params] = sendWhatsAppTemplateToClientNumber.mock.calls[0]
    expect(clientId).toBe('client-1')
    expect(templateName).toBe('lead_handoff_alert_1')
    expect(params[0]).toBe('Ravi Kumar')
    expect(params[1]).toBe('+919876543210')
    expect(params[2]).toBe('No booking after 3 follow-ups')
    expect(params[3]).toContain('Lead: Yes i just wanna know about pricing')
    expect(params[4]).toBe('https://vyostra.com/dashboard/leads/lead-1?source=chat&botId=bot-1')
  })

  // AC5: a client who never set a notification number is a configuration gap,
  // not a crash, and has to be distinguishable in the log from one who never
  // connected WhatsApp at all.
  it('reports a missing notificationNumber as its own skip rather than throwing', async () => {
    sendWhatsAppTemplateToClientNumber.mockResolvedValueOnce({
      success: false,
      error: 'Client has no notificationNumber configured',
      retryable: false,
    })

    const result = await sendHandoffAlert(baseInput)

    expect(result.notified).toBe(false)
    expect(result.skipReason).toBe('no_notification_number')
  })

  it('reports a failed send without throwing', async () => {
    sendWhatsAppTemplateToClientNumber.mockResolvedValueOnce({ success: false, error: 'Template not approved', retryable: false })

    const result = await sendHandoffAlert(baseInput)

    expect(result).toEqual({ notified: false, skipReason: 'send_failed', error: 'Template not approved' })
  })

  // AC4: the journey has already stopped talking to the lead by the time this
  // runs, so an exception here must never propagate and fail the execution.
  it('swallows an unexpected throw so the caller cannot fail on it', async () => {
    sendWhatsAppTemplateToClientNumber.mockRejectedValueOnce(new Error('network down'))

    const result = await sendHandoffAlert(baseInput)

    expect(result.notified).toBe(false)
    expect(result.skipReason).toBe('send_failed')
  })

  it('does not attempt a send for a lead that cannot be read', async () => {
    readJourneyLead.mockResolvedValueOnce(null)

    const result = await sendHandoffAlert(baseInput)

    expect(result).toEqual({ notified: false, skipReason: 'lead_not_found' })
    expect(sendWhatsAppTemplateToClientNumber).not.toHaveBeenCalled()
  })

  // A failed event read costs the summary, not the alert -- name, phone and
  // reason are what make the message actionable.
  it('still notifies when the event history cannot be read', async () => {
    getLeadEvents.mockRejectedValueOnce(new Error('dynamo throttled'))

    const result = await sendHandoffAlert(baseInput)

    expect(result.notified).toBe(true)
    expect(sendWhatsAppTemplateToClientNumber.mock.calls[0][2][3]).toBe('No messages exchanged yet.')
  })
})

describe('summarizeRecentMessages', () => {
  // Meta rejects the SEND, not the template, when a parameter contains a
  // newline -- so an unflattened transcript would pass review and then fail
  // against a real lead.
  it('flattens newlines and tabs out of the summary', async () => {
    const summary = summarizeRecentMessages([messageEvent('message_in', 'line one\nline two\t\tindented')])

    expect(summary).toBe('Lead: line one line two indented')
    expect(summary).not.toMatch(/[\n\t]/)
  })

  it('ignores delivery statuses and journey steps', () => {
    const events: LeadEvent[] = [
      messageEvent('message_in', 'Hi'),
      { leadId: 'lead-1', ts: 't', clientId: 'client-1', botId: 'bot-1', type: 'message_status', status: 'read' },
      { leadId: 'lead-1', ts: 't', clientId: 'client-1', botId: 'bot-1', type: 'journey_step', body: 'await_reply' },
    ]

    expect(summarizeRecentMessages(events)).toBe('Lead: Hi')
  })

  it('says so plainly when there is nothing to summarize', () => {
    expect(summarizeRecentMessages([])).toBe('No messages exchanged yet.')
  })
})

describe('leadDetailUrl', () => {
  // leadId alone is not addressable: the three lead tables have three
  // different partition keys, so the whole LeadRef has to survive the link.
  it('carries the discriminator for every lead source', () => {
    expect(leadDetailUrl({ source: 'form', formId: 'form-9', leadId: 'lead-2' })).toBe(
      'https://vyostra.com/dashboard/leads/lead-2?source=form&formId=form-9'
    )
    expect(leadDetailUrl({ source: 'meta', pageId: 'page-3', leadId: 'lead-3' })).toBe(
      'https://vyostra.com/dashboard/leads/lead-3?source=meta&pageId=page-3'
    )
  })

  it('does not double the slash when FRONTEND_URL has a trailing one', () => {
    process.env.FRONTEND_URL = 'https://vyostra.com/'

    expect(leadDetailUrl(chatRef)).toBe('https://vyostra.com/dashboard/leads/lead-1?source=chat&botId=bot-1')
  })
})

describe('flattenTemplateParam', () => {
  it('collapses every run of whitespace Meta would reject', () => {
    expect(flattenTemplateParam('  a\n\nb\t c    d  ')).toBe('a b c d')
  })
})
