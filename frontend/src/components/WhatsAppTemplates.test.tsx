import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

// frontend vitest runs without globals, so @testing-library's auto-cleanup never
// registers and renders stack in one document.
afterEach(cleanup)

const getWhatsAppTemplates = vi.fn()
const createWhatsAppTemplate = vi.fn()

vi.mock('../services/api', () => ({
  getWhatsAppTemplates: (...a: unknown[]) => getWhatsAppTemplates(...a),
  createWhatsAppTemplate: (...a: unknown[]) => createWhatsAppTemplate(...a),
}))

const WhatsAppTemplates = (await import('./WhatsAppTemplates')).default

const APPROVED = { name: 'lead_notification_1', language: 'en', category: 'UTILITY', body: 'New lead', status: 'APPROVED' }
const MISSING = { name: 'lead_notification_2', language: 'en', category: 'UTILITY', body: 'You have', status: 'NOT_CREATED' }

beforeEach(() => {
  vi.clearAllMocks()
  getWhatsAppTemplates.mockResolvedValue({ success: true, data: [APPROVED, MISSING] })
})

describe('WhatsAppTemplates', () => {
  it("shows each template with Meta's status", async () => {
    render(<WhatsAppTemplates />)

    expect((await screen.findByTestId('template-status-lead_notification_1')).textContent).toBe('Approved')
    expect(screen.getByTestId('template-status-lead_notification_2').textContent).toBe('Not created')
  })

  // An approved template offered a Create button would only ever produce
  // Meta's duplicate-name refusal.
  it('offers Create only for a template the account does not have', async () => {
    render(<WhatsAppTemplates />)

    await screen.findByTestId('template-create-lead_notification_2')
    expect(screen.queryByTestId('template-create-lead_notification_1')).toBeNull()
  })

  it('creates the template and shows the status Meta assigned', async () => {
    createWhatsAppTemplate.mockResolvedValue({ success: true, data: { ...MISSING, status: 'PENDING' } })
    render(<WhatsAppTemplates />)

    fireEvent.click(await screen.findByTestId('template-create-lead_notification_2'))

    await waitFor(() =>
      expect(screen.getByTestId('template-status-lead_notification_2').textContent).toBe('Pending review')
    )
    expect(createWhatsAppTemplate).toHaveBeenCalledWith('lead_notification_2')
  })

  it("shows Meta's reason when it refuses the template", async () => {
    createWhatsAppTemplate.mockResolvedValue({ success: false, error: 'Template name already exists' })
    render(<WhatsAppTemplates />)

    fireEvent.click(await screen.findByTestId('template-create-lead_notification_2'))

    expect((await screen.findByRole('alert')).textContent).toBe('Template name already exists')
  })

  // A status the dashboard has no word for is shown as Meta wrote it, never
  // rounded to the nearest familiar one.
  it('shows an unrecognised status verbatim', async () => {
    getWhatsAppTemplates.mockResolvedValue({ success: true, data: [{ ...APPROVED, status: 'PAUSED' }] })
    render(<WhatsAppTemplates />)

    expect((await screen.findByTestId('template-status-lead_notification_1')).textContent).toBe('PAUSED')
  })

  it('reads the list again on Refresh status', async () => {
    render(<WhatsAppTemplates />)
    await screen.findByTestId('template-row-lead_notification_1')

    fireEvent.click(screen.getByTestId('whatsapp-templates-refresh'))

    await waitFor(() => expect(getWhatsAppTemplates).toHaveBeenCalledTimes(2))
  })
})
