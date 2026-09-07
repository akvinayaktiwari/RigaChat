import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// frontend vitest runs without globals, so @testing-library's auto-cleanup never
// registers and renders stack in one document.
afterEach(cleanup)

const getLeadInbox = vi.fn()

vi.mock('../services/api', () => ({
  getLeadInbox: (...a: unknown[]) => getLeadInbox(...a),
  updateLeadState: vi.fn(),
  setLeadArchived: vi.fn(),
  eraseLead: vi.fn(),
  getMyBots: vi.fn().mockResolvedValue({ success: true, data: [] }),
}))

vi.mock('../components/Toast/Toast', () => ({ useToast: () => ({ show: vi.fn() }) }))

const LeadsPage = (await import('./LeadsPage')).default

function lead(leadId: string) {
  return {
    leadId,
    clientId: 'client-1',
    source: 'chat',
    leadRef: { source: 'chat', botId: 'bot-1', leadId },
    name: `Lead ${leadId}`,
    phone: '+919876543210',
    email: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    state: null,
    urgencyTier: 'later',
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <LeadsPage />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('an inbox missing one of its sources', () => {
  it('says the list is incomplete rather than showing it as normal', async () => {
    // The screen looks entirely healthy when a source silently drops out, and
    // nobody can notice the leads they were never shown.
    getLeadInbox.mockResolvedValue({
      success: true,
      data: { leads: [lead('c1')], total: 1, degradedSources: ['voice'] },
    })

    renderPage()

    expect(await screen.findByText(/list is incomplete/i)).toBeTruthy()
    expect(screen.getByText(/Phone Call/)).toBeTruthy()
  })

  it('still shows the leads that did load', async () => {
    getLeadInbox.mockResolvedValue({
      success: true,
      data: { leads: [lead('c1')], total: 1, degradedSources: ['voice'] },
    })

    renderPage()

    // The page renders a desktop table AND a mobile card list, so every lead
    // is in the DOM twice.
    expect((await screen.findAllByText('Lead c1')).length).toBeGreaterThan(0)
  })

  it('names every failed source', async () => {
    getLeadInbox.mockResolvedValue({
      success: true,
      data: { leads: [], total: 0, degradedSources: ['meta', 'voice'] },
    })

    renderPage()

    await screen.findByText(/list is incomplete/i)
    expect(screen.getByText(/Meta Ads, Phone Call/)).toBeTruthy()
  })

  it('stays quiet on a healthy inbox', async () => {
    getLeadInbox.mockResolvedValue({ success: true, data: { leads: [lead('c1')], total: 1 } })

    renderPage()

    await screen.findAllByText('Lead c1')
    expect(screen.queryByText(/list is incomplete/i)).toBeNull()
  })

  it('does not add the warning on top of a total failure', async () => {
    // A failed load already has its own full-page state with a Retry. Showing
    // both would say the list is incomplete when there is no list at all.
    getLeadInbox.mockResolvedValue({ success: false, error: 'boom' })

    renderPage()

    await waitFor(() => expect(screen.getAllByText(/Couldn’t load your leads/i).length).toBeGreaterThan(0))
    expect(screen.queryByText(/list is incomplete/i)).toBeNull()
  })
})
