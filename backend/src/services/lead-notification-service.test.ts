import { beforeEach, describe, expect, it, vi } from 'vitest'

const appendLeadEvent = vi.fn()
vi.mock('../repositories/lead-event-repository.js', () => ({ appendLeadEvent }))

const getClientById = vi.fn()
vi.mock('../repositories/client-repository.js', () => ({ getClientById }))

class EmailNotConfiguredError extends Error {}
const sendEmail = vi.fn()
vi.mock('../repositories/email-repository.js', () => ({ sendEmail, EmailNotConfiguredError }))

// The whole point of the fix: this path must go through the TEMPLATE sender.
// sendMessage is the free-text primitive that caused the bug, so it is mocked
// here purely so a regression that reintroduces it fails loudly instead of
// quietly calling a real function.
const sendWhatsAppTemplateToClientNumber = vi.fn()
const sendWhatsAppMessageToLead = vi.fn()
vi.mock('./whatsapp-service.js', () => ({
  sendWhatsAppTemplateToClientNumber,
  sendWhatsAppMessageToLead,
}))

const { sendLeadNotification, notificationInputFromEvent } = await import('./lead-notification-service.js')

const input = {
  clientId: 'client-1',
  leadId: 'lead-1',
  botId: 'bot-1',
  source: 'Website chat',
  name: 'Ravi Kumar',
  phone: '+919876543210',
  interest: '3 BHK in Wakad',
}

beforeEach(() => {
  appendLeadEvent.mockReset()
  appendLeadEvent.mockResolvedValue(undefined)
  getClientById.mockReset()
  getClientById.mockResolvedValue({ clientId: 'client-1', email: 'owner@example.com' })
  sendEmail.mockReset()
  sendEmail.mockResolvedValue(undefined)
  sendWhatsAppTemplateToClientNumber.mockReset()
  sendWhatsAppTemplateToClientNumber.mockResolvedValue({ success: true, messageId: 'wamid.abc' })
  sendWhatsAppMessageToLead.mockReset()
})

describe('sendLeadNotification', () => {
  // THE regression test. Before the fix this path called
  // provider.sendMessage (free text) to the client's own number, which Meta
  // accepted and then failed with 131047 on every single send, because that
  // number is never inside a 24h customer-service window.
  it('sends the approved template, never free text', async () => {
    const result = await sendLeadNotification(input)

    expect(sendWhatsAppTemplateToClientNumber).toHaveBeenCalledWith(
      'client-1',
      'lead_notification_1',
      ['Website chat', 'Ravi Kumar', '+919876543210', '3 BHK in Wakad'],
      expect.any(String)
    )
    expect(sendWhatsAppMessageToLead).not.toHaveBeenCalled()
    expect(result).toMatchObject({ notified: true, via: 'whatsapp', wamid: 'wamid.abc' })
  })

  // Without this row the wamid GSI has nothing to match, so every delivery
  // status for a lead alert is dropped and the failure stays invisible --
  // which is exactly how the original bug survived for months.
  it('records the send with its wamid so delivery statuses can attach', async () => {
    await sendLeadNotification(input)

    expect(appendLeadEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: 'lead-1',
        clientId: 'client-1',
        botId: 'bot-1',
        type: 'notification_out',
        wamid: 'wamid.abc',
        mode: 'template',
        templateName: 'lead_notification_1',
      })
    )
  })

  it('carries the lead details on the event so a later fallback can rebuild it', async () => {
    await sendLeadNotification(input)

    const [event] = appendLeadEvent.mock.calls[0]
    expect(event.result).toEqual({
      source: 'Website chat',
      name: 'Ravi Kumar',
      phone: '+919876543210',
      interest: '3 BHK in Wakad',
    })
  })

  it('substitutes a placeholder for missing fields, because Meta rejects empty params', async () => {
    await sendLeadNotification({ clientId: 'client-1', leadId: 'lead-1', botId: 'bot-1', source: 'Website form' })

    expect(sendWhatsAppTemplateToClientNumber).toHaveBeenCalledWith(
      'client-1',
      'lead_notification_1',
      ['Website form', 'Not provided', 'Not provided', 'Not provided'],
      expect.any(String)
    )
  })

  it('flattens newlines out of params, because Meta rejects them in a template send', async () => {
    await sendLeadNotification({ ...input, interest: 'Wants:\n  3 BHK\n\n  in Wakad' })

    const [, , params] = sendWhatsAppTemplateToClientNumber.mock.calls[0]
    expect(params[3]).toBe('Wants: 3 BHK in Wakad')
  })

  it('falls back to email when WhatsApp rejects the send outright', async () => {
    sendWhatsAppTemplateToClientNumber.mockResolvedValue({
      success: false,
      retryable: false,
      error: 'Template not approved',
    })

    const result = await sendLeadNotification(input)

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'owner@example.com', subject: 'New lead from Website chat' })
    )
    expect(result).toMatchObject({ notified: true, via: 'email' })
  })

  it('reports that nobody was told when both channels fail', async () => {
    sendWhatsAppTemplateToClientNumber.mockResolvedValue({ success: false, retryable: false, error: 'nope' })
    sendEmail.mockRejectedValue(new Error('SES down'))

    const result = await sendLeadNotification(input)

    expect(result.notified).toBe(false)
    expect(result.via).toBe('none')
  })

  // Capturing the lead is worth more than telling the client about it.
  it('never throws, whatever the transport does', async () => {
    sendWhatsAppTemplateToClientNumber.mockRejectedValue(new Error('KMS decrypt failed'))
    getClientById.mockRejectedValue(new Error('DynamoDB unavailable'))

    await expect(sendLeadNotification(input)).resolves.toMatchObject({ notified: false, via: 'none' })
  })
})

describe('notificationInputFromEvent', () => {
  it('rebuilds the notification from a stored event', () => {
    expect(
      notificationInputFromEvent({
        leadId: 'lead-1',
        clientId: 'client-1',
        botId: 'bot-1',
        result: { source: 'Meta Lead Ads (Acme)', name: 'Ravi Kumar', phone: '+919876543210' },
      })
    ).toEqual({
      clientId: 'client-1',
      leadId: 'lead-1',
      botId: 'bot-1',
      source: 'Meta Lead Ads (Acme)',
      name: 'Ravi Kumar',
      phone: '+919876543210',
    })
  })

  it('still produces a sendable input when the event carries no details', () => {
    const rebuilt = notificationInputFromEvent({ leadId: 'lead-1', clientId: 'client-1', botId: 'bot-1' })

    expect(rebuilt.source).toBe('your website')
    expect(rebuilt.leadId).toBe('lead-1')
  })
})
