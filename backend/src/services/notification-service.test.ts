import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LeadEvent } from '../types/index.js'
import { unpackLeadRef } from '../lib/lead-link.js'

const readJourneyLead = vi.fn()
vi.mock('./lead-resolution-service.js', () => ({ readJourneyLead }))

const getLeadEvents = vi.fn()
vi.mock('../repositories/lead-event-repository.js', () => ({ getLeadEvents }))

const sendWhatsAppTemplateToClientNumber = vi.fn()
vi.mock('./whatsapp-service.js', () => ({ sendWhatsAppTemplateToClientNumber }))

const sendLeadPush = vi.fn()
vi.mock('./push-notification-service.js', () => ({ sendLeadPush }))

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
    const [clientId, templateName, params, , urlButtonParam] = sendWhatsAppTemplateToClientNumber.mock.calls[0]
    expect(clientId).toBe('client-1')
    expect(templateName, 'the button template is preferred').toBe('lead_handoff_alert_3')
    expect(params[0]).toBe('Ravi Kumar')
    expect(params[1]).toBe('+919876543210')
    expect(params[2]).toBe('No booking after 3 follow-ups')
    expect(params[3]).toContain('Lead: Yes i just wanna know about pricing')
    // Four body params, not five: _3's link is a BUTTON, so the deep link
    // leaves the body and arrives as the button's suffix instead.
    expect(params).toHaveLength(4)
    expect(unpackLeadRef(urlButtonParam)).toEqual(chatRef)
  })

  // The suffix alone, never a whole URL: the 'https://vyostra.com/l/' half is
  // baked into the approved template, so sending a full URL would build a link
  // with the base repeated twice -- which Meta accepts and nobody can open.
  it('sends the button parameter as a bare packed ref', async () => {
    await sendHandoffAlert(baseInput)

    const urlButtonParam = sendWhatsAppTemplateToClientNumber.mock.calls[0][4]
    expect(urlButtonParam).not.toContain('http')
    expect(urlButtonParam).not.toContain('/')
  })

  // Only _3 has a dynamic URL button. Passing a button parameter against _1 or
  // _2 fails the send outright, so the fall-through has to drop it.
  it('sends no button parameter for the templates that have no button', async () => {
    sendWhatsAppTemplateToClientNumber
      .mockResolvedValueOnce({ success: false, error: 'Template name does not exist', retryable: false })
      .mockResolvedValueOnce({ success: true, messageId: 'wamid.2' })

    await sendHandoffAlert(baseInput)

    expect(sendWhatsAppTemplateToClientNumber.mock.calls[1][1]).toBe('lead_handoff_alert_1')
    expect(sendWhatsAppTemplateToClientNumber.mock.calls[1][4]).toBeUndefined()
  })

  // AC5: a client who never set a notification number is a configuration gap,
  // not a crash, and has to be distinguishable in the log from one who never
  // connected WhatsApp at all.
  it('reports a missing notificationNumber as its own skip rather than throwing', async () => {
    // Not mockResolvedValueOnce: a missing notificationNumber is a property of
    // the CLIENT, so every template in the preference order hits it.
    sendWhatsAppTemplateToClientNumber.mockResolvedValue({
      success: false,
      error: 'Client has no notificationNumber configured',
      retryable: false,
    })

    const result = await sendHandoffAlert(baseInput)

    expect(result.notified).toBe(false)
    expect(result.skipReason).toBe('no_notification_number')
  })

  it('reports a failed send without throwing', async () => {
    sendWhatsAppTemplateToClientNumber.mockResolvedValue({
      success: false,
      error: 'Template not approved',
      retryable: false,
    })

    const result = await sendHandoffAlert(baseInput)

    expect(result).toEqual({ notified: false, skipReason: 'send_failed', error: 'Template not approved' })
    // All three templates were tried before giving up.
    expect(sendWhatsAppTemplateToClientNumber).toHaveBeenCalledTimes(3)
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

// lead_handoff_alert_1 sat in Meta's review queue for a day while every other
// template on the WABA cleared in minutes. _2 is the simpler shape that is
// likely to clear, and the fall-through is what stops the feature waiting on a
// queue nobody controls -- and what lets _1 take over the moment it approves,
// with no deploy.
describe('handoff template fall-through', () => {
  it('sends the simpler template when the preferred one cannot send', async () => {
    sendWhatsAppTemplateToClientNumber
      .mockResolvedValueOnce({ success: false, error: 'Template name does not exist', retryable: false })
      .mockResolvedValueOnce({ success: true, messageId: 'wamid.2' })

    const result = await sendHandoffAlert(baseInput)

    expect(result).toEqual({ notified: true })
    expect(sendWhatsAppTemplateToClientNumber.mock.calls[1][1]).toBe('lead_handoff_alert_1')
  })

  // Three params, not four or five. Every template in the ladder takes a
  // DIFFERENT count, which is the obvious way a fall-through like this breaks:
  // Meta fails a parameter count mismatch with error 132000.
  it('gives each template in the ladder its own parameter count', async () => {
    sendWhatsAppTemplateToClientNumber
      .mockResolvedValueOnce({ success: false, error: 'nope', retryable: false })
      .mockResolvedValueOnce({ success: false, error: 'nope', retryable: false })
      .mockResolvedValueOnce({ success: true, messageId: 'wamid.2' })

    await sendHandoffAlert(baseInput)

    const counts = sendWhatsAppTemplateToClientNumber.mock.calls.map(
      (call: unknown[]) => (call[2] as string[]).length
    )
    expect(counts).toEqual([4, 5, 3])

    const [, templateName, params] = sendWhatsAppTemplateToClientNumber.mock.calls[2]
    expect(templateName).toBe('lead_handoff_alert_2')
    expect(params).toEqual(['Ravi Kumar', '+919876543210', 'No booking after 3 follow-ups'])
  })

  // A retryable failure is Meta being down, not this template being unusable.
  // Trying the next one would fail identically and log a second error for one
  // outage.
  it('does not fall through when the failure was transient', async () => {
    sendWhatsAppTemplateToClientNumber.mockResolvedValue({ success: false, error: '503', retryable: true })

    const result = await sendHandoffAlert(baseInput)

    expect(result.notified).toBe(false)
    expect(sendWhatsAppTemplateToClientNumber).toHaveBeenCalledTimes(1)
  })
})

// The handoff push, added 2026-08-26. Same isolation contract as the lead
// push: this function's catch returns notified:false, and the scheduler reads
// that, so a push failure must never make a delivered alert look undelivered.
describe('handoff push', () => {
  beforeEach(() => {
    sendLeadPush.mockReset()
    sendLeadPush.mockResolvedValue({ sent: 1, failed: 0, retired: 0 })
  })

  it('pushes on the handoffs channel with the lead name already in hand', async () => {
    readJourneyLead.mockResolvedValue({ clientId: 'client-1', name: 'Ravi Kumar', phone: '+919876543210' })
    sendWhatsAppTemplateToClientNumber.mockResolvedValue({ success: true })

    await sendHandoffAlert(baseInput)

    expect(sendLeadPush).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'client-1',
        kind: 'handoff',
        leadRef: chatRef,
        title: 'Ravi Kumar needs you',
      })
    )
  })

  // The template loop returns on first success, so a push placed after it would
  // never run when WhatsApp works.
  it('pushes even when the WhatsApp template succeeds and returns early', async () => {
    readJourneyLead.mockResolvedValue({ clientId: 'client-1', name: 'Ravi Kumar' })
    sendWhatsAppTemplateToClientNumber.mockResolvedValue({ success: true })

    const result = await sendHandoffAlert(baseInput)

    expect(result.notified).toBe(true)
    expect(sendLeadPush).toHaveBeenCalledTimes(1)
  })

  it('does not report a delivered alert as failed when the push throws', async () => {
    readJourneyLead.mockResolvedValue({ clientId: 'client-1', name: 'Ravi Kumar' })
    sendLeadPush.mockRejectedValue(new Error('push exploded'))
    sendWhatsAppTemplateToClientNumber.mockResolvedValue({ success: true })

    const result = await sendHandoffAlert(baseInput)

    expect(result).toEqual({ notified: true })
  })

  // No lead, no push: the alert is skipped before the read succeeds, so there
  // is nothing to notify about and no name to put in the title.
  it('does not push when the lead cannot be resolved', async () => {
    readJourneyLead.mockResolvedValue(null)

    const result = await sendHandoffAlert(baseInput)

    expect(result).toEqual({ notified: false, skipReason: 'lead_not_found' })
    expect(sendLeadPush).not.toHaveBeenCalled()
  })
})
