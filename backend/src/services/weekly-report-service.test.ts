import { beforeEach, describe, expect, it, vi } from 'vitest'

const getClientById = vi.fn()
const getConnectedWhatsAppClients = vi.fn()
vi.mock('../repositories/client-repository.js', () => ({ getClientById, getConnectedWhatsAppClients }))

class EmailNotConfiguredError extends Error {}
const sendEmail = vi.fn()
vi.mock('../repositories/email-repository.js', () => ({ sendEmail, EmailNotConfiguredError }))

// sendMessage is the free-text primitive that caused the bug. It is mocked so
// a regression reintroducing it fails loudly rather than silently calling out.
const sendWhatsAppTemplateToClientNumber = vi.fn()
const sendWhatsAppMessageToLead = vi.fn()
vi.mock('./whatsapp-service.js', () => ({
  sendWhatsAppTemplateToClientNumber,
  sendWhatsAppMessageToLead,
}))

const getChatLeads = vi.fn()
vi.mock('./lead-service.js', () => ({ getLeadsForClient: getChatLeads }))
const getFormLeads = vi.fn()
vi.mock('./form-lead-service.js', () => ({ getLeadsForClient: getFormLeads }))

const { sendWeeklyReport, sendWeeklyReportsForAllClients, countLeadsThisWeek } = await import(
  './weekly-report-service.js'
)

const now = Date.now()
const daysAgo = (n: number): string => new Date(now - n * 24 * 60 * 60 * 1000).toISOString()

beforeEach(() => {
  getClientById.mockReset().mockResolvedValue({ clientId: 'client-1', email: 'owner@example.com' })
  getConnectedWhatsAppClients.mockReset().mockResolvedValue([])
  sendEmail.mockReset().mockResolvedValue(undefined)
  sendWhatsAppTemplateToClientNumber.mockReset().mockResolvedValue({ success: true, messageId: 'wamid.w' })
  sendWhatsAppMessageToLead.mockReset()
  getChatLeads.mockReset().mockResolvedValue([{ createdAt: daysAgo(1) }, { createdAt: daysAgo(3) }])
  getFormLeads.mockReset().mockResolvedValue([{ createdAt: daysAgo(2) }])
})

describe('countLeadsThisWeek', () => {
  it('counts only leads inside the seven day window', async () => {
    getChatLeads.mockResolvedValue([{ createdAt: daysAgo(1) }, { createdAt: daysAgo(30) }])
    getFormLeads.mockResolvedValue([{ createdAt: daysAgo(2) }, { createdAt: daysAgo(8) }])

    expect(await countLeadsThisWeek('client-1')).toEqual({ total: 2, chat: 1, form: 1 })
  })
})

describe('sendWeeklyReport', () => {
  // THE regression test. This path sent free text to the client's own
  // notificationNumber, which is never inside a 24h window, so Meta failed
  // every send with 131047 after already returning success.
  it('sends the approved template, never free text', async () => {
    const result = await sendWeeklyReport('client-1')

    expect(sendWhatsAppTemplateToClientNumber).toHaveBeenCalledWith(
      'client-1',
      'weekly_report_1',
      ['3', '2', '1'],
      expect.any(String)
    )
    expect(sendWhatsAppMessageToLead).not.toHaveBeenCalled()
    expect(result).toMatchObject({ sent: true, via: 'whatsapp', counts: { total: 3, chat: 2, form: 1 } })
  })

  // A paid template send per client per week to say "nothing happened" is
  // worse than silence. The old code sent it regardless.
  it('sends nothing in a week with no leads', async () => {
    getChatLeads.mockResolvedValue([])
    getFormLeads.mockResolvedValue([])

    const result = await sendWeeklyReport('client-1')

    expect(sendWhatsAppTemplateToClientNumber).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
    expect(result).toMatchObject({ sent: false, skipReason: 'no_leads_this_week' })
  })

  it('falls back to email when WhatsApp rejects the send', async () => {
    sendWhatsAppTemplateToClientNumber.mockResolvedValue({
      success: false,
      retryable: false,
      error: 'Template not approved',
    })

    const result = await sendWeeklyReport('client-1')

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner@example.com',
        subject: 'Your weekly Vyostra report: 3 new leads',
      })
    )
    expect(result).toMatchObject({ sent: true, via: 'email' })
  })

  it('singularises the email subject for a single lead', async () => {
    getChatLeads.mockResolvedValue([{ createdAt: daysAgo(1) }])
    getFormLeads.mockResolvedValue([])
    sendWhatsAppTemplateToClientNumber.mockResolvedValue({ success: false, retryable: false, error: 'nope' })

    await sendWeeklyReport('client-1')

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Your weekly Vyostra report: 1 new lead' })
    )
  })

  it('reports that nothing was delivered when both channels fail', async () => {
    sendWhatsAppTemplateToClientNumber.mockResolvedValue({ success: false, retryable: false, error: 'nope' })
    sendEmail.mockRejectedValue(new Error('SES down'))

    expect(await sendWeeklyReport('client-1')).toMatchObject({ sent: false, via: 'none' })
  })

  it('never throws, whatever the transport does', async () => {
    sendWhatsAppTemplateToClientNumber.mockRejectedValue(new Error('KMS decrypt failed'))

    await expect(sendWeeklyReport('client-1')).resolves.toMatchObject({ sent: false, via: 'none' })
  })
})

describe('sendWeeklyReportsForAllClients', () => {
  // Unattended weekly job: one client's broken connection must not cost every
  // other client their report.
  it('keeps going when one client fails', async () => {
    getConnectedWhatsAppClients.mockResolvedValue([
      { clientId: 'client-1' },
      { clientId: 'client-2' },
      { clientId: 'client-3' },
    ])
    sendWhatsAppTemplateToClientNumber
      .mockResolvedValueOnce({ success: true, messageId: 'w1' })
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ success: true, messageId: 'w3' })

    await sendWeeklyReportsForAllClients()

    expect(sendWhatsAppTemplateToClientNumber).toHaveBeenCalledTimes(3)
  })
})
