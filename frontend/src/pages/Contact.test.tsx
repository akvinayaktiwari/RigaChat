import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Contact from './Contact'
import { submitContactMessage } from '../services/api'
import { trackEvent } from '../lib/analytics'

vi.mock('../services/api', () => ({ submitContactMessage: vi.fn() }))
vi.mock('../lib/analytics', () => ({ trackEvent: vi.fn() }))

const submitMock = vi.mocked(submitContactMessage)
const trackMock = vi.mocked(trackEvent)

/* fireEvent rather than user-event: the suite has no user-event dependency and
   this form needs no typing behaviour beyond setting each field's value. */
function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'Asha' } })
  fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'asha@example.com' } })
  fireEvent.change(screen.getByLabelText(/^subject$/i), { target: { value: 'Demo' } })
  fireEvent.change(screen.getByLabelText(/^message$/i), { target: { value: 'Please call me' } })
  fireEvent.click(screen.getByRole('button', { name: /send message/i }))
}

function renderPage() {
  render(
    <HelmetProvider>
      <MemoryRouter>
        <Contact />
      </MemoryRouter>
    </HelmetProvider>,
  )
}

describe('contact form conversion tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // This suite runs without globals, so nothing unmounts the previous render.
  afterEach(cleanup)

  it('reports one generate_lead once the backend confirms the message', async () => {
    submitMock.mockResolvedValue({ success: true, data: { messageId: 'msg-1', createdAt: '2026-09-20T00:00:00Z' } })
    renderPage()
    fillAndSubmit()

    await waitFor(() => expect(trackMock).toHaveBeenCalledWith('generate_lead', { form: 'contact' }))
    expect(trackMock).toHaveBeenCalledTimes(1)
  })

  // The honeypot answers a bot with the same success shape a person gets, so
  // without this check every bot submission would report as a converted lead.
  it('reports nothing when the honeypot dropped the submission', async () => {
    submitMock.mockResolvedValue({ success: true, data: { messageId: 'dropped', createdAt: '2026-09-20T00:00:00Z' } })
    renderPage()
    fillAndSubmit()

    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy())
    expect(trackMock).not.toHaveBeenCalled()
  })

  it('reports nothing when the backend rejects the message', async () => {
    submitMock.mockResolvedValue({ success: false, error: 'Please wait a moment before sending another message.' })
    renderPage()
    fillAndSubmit()

    await waitFor(() => expect(screen.getByText(/wait a moment/i)).toBeTruthy())
    expect(trackMock).not.toHaveBeenCalled()
  })

  it('reports nothing when the request throws', async () => {
    submitMock.mockRejectedValue(new Error('network down'))
    renderPage()
    fillAndSubmit()

    await waitFor(() => expect(trackMock).not.toHaveBeenCalled())
  })
})
