import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// frontend vitest runs without globals, so @testing-library's auto-cleanup never
// registers and renders stack in one document.
afterEach(cleanup)

const getVoiceAgent = vi.fn()
const getVoiceAgentUsage = vi.fn()
const getMyBots = vi.fn()
const getVoiceAgentPhoneNumber = vi.fn()
const assignVoiceAgentPhoneNumber = vi.fn()
const releaseVoiceAgentPhoneNumber = vi.fn()

vi.mock('../services/api', () => ({
  getVoiceAgent: (...a: unknown[]) => getVoiceAgent(...a),
  getVoiceAgentUsage: (...a: unknown[]) => getVoiceAgentUsage(...a),
  getMyBots: (...a: unknown[]) => getMyBots(...a),
  getVoiceAgentPhoneNumber: (...a: unknown[]) => getVoiceAgentPhoneNumber(...a),
  assignVoiceAgentPhoneNumber: (...a: unknown[]) => assignVoiceAgentPhoneNumber(...a),
  releaseVoiceAgentPhoneNumber: (...a: unknown[]) => releaseVoiceAgentPhoneNumber(...a),
  updateVoiceAgent: vi.fn(),
  deleteVoiceAgent: vi.fn(),
  setupVoiceAgent: vi.fn(),
}))

vi.mock('../hooks/useIndexingStatus', () => ({
  useIndexingStatus: () => ({ job: undefined, refresh: vi.fn() }),
}))

const VoiceAgentDetailPage = (await import('./VoiceAgentDetailPage')).default

const AGENT = {
  agentId: 'agent-1',
  clientId: 'client-1',
  name: 'Ravi',
  voice: 'coral',
  greetingMessage: 'Hello, Acme Estates.',
  brandColor: '#7c3aed',
  widgetPosition: 'bottom-right',
  maxSessionDuration: 10,
  isEnabled: true,
  isIndexed: true,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
}

const ASSIGNMENT = {
  phoneNumber: '+919876543210',
  agentId: 'agent-1',
  clientId: 'client-1',
  assignedAt: '2026-09-06T00:00:00.000Z',
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/dashboard/voice-agents/agent-1']}>
      <Routes>
        <Route path="/dashboard/voice-agents/:agentId" element={<VoiceAgentDetailPage />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  getVoiceAgent.mockResolvedValue({ success: true, data: AGENT })
  getVoiceAgentUsage.mockResolvedValue({ success: true, data: null })
  getMyBots.mockResolvedValue({ success: true, data: [] })
  getVoiceAgentPhoneNumber.mockResolvedValue({ success: true, data: null })
  assignVoiceAgentPhoneNumber.mockResolvedValue({ success: true, data: ASSIGNMENT })
  releaseVoiceAgentPhoneNumber.mockResolvedValue({ success: true, data: null })
})

describe('an agent with no number', () => {
  it('offers the assign form', async () => {
    renderPage()

    expect(await screen.findByPlaceholderText('+91 98765 43210')).toBeTruthy()
  })

  it('will not submit an empty number', async () => {
    renderPage()
    await screen.findByPlaceholderText('+91 98765 43210')

    const button = screen.getByRole('button', { name: /assign number/i })

    expect((button as HTMLButtonElement).disabled).toBe(true)
  })

  it('assigns the number and shows it as live', async () => {
    renderPage()
    const input = await screen.findByPlaceholderText('+91 98765 43210')

    fireEvent.change(input, { target: { value: '+91 98765 43210' } })
    fireEvent.click(screen.getByRole('button', { name: /assign number/i }))

    await waitFor(() => expect(assignVoiceAgentPhoneNumber).toHaveBeenCalledWith('agent-1', '+91 98765 43210'))
    // The number is formatted for display, but what went to the server was the
    // raw input -- the server owns normalisation.
    expect(await screen.findByText('+91 98765 43210')).toBeTruthy()
  })

  it('surfaces the reason a number was refused', async () => {
    // A 409 from another client holding the number is the case a client most
    // needs explained, and it is invisible if the UI only says "failed".
    assignVoiceAgentPhoneNumber.mockResolvedValue({
      success: false,
      error: 'Phone number +919876543210 is already assigned to a different voice agent',
    })
    renderPage()
    const input = await screen.findByPlaceholderText('+91 98765 43210')

    fireEvent.change(input, { target: { value: '+919876543210' } })
    fireEvent.click(screen.getByRole('button', { name: /assign number/i }))

    expect(await screen.findByText(/already assigned to a different voice agent/i)).toBeTruthy()
  })

  it('keeps the typed number after a failure, so it can be corrected', async () => {
    assignVoiceAgentPhoneNumber.mockResolvedValue({ success: false, error: 'Invalid' })
    renderPage()
    const input = await screen.findByPlaceholderText('+91 98765 43210')

    fireEvent.change(input, { target: { value: '+9198765' } })
    fireEvent.click(screen.getByRole('button', { name: /assign number/i }))

    await screen.findByText('Invalid')
    expect((input as HTMLInputElement).value).toBe('+9198765')
  })
})

describe('an agent with a number', () => {
  beforeEach(() => {
    getVoiceAgentPhoneNumber.mockResolvedValue({ success: true, data: ASSIGNMENT })
  })

  it('shows the number rather than the assign form', async () => {
    renderPage()

    expect(await screen.findByText('+91 98765 43210')).toBeTruthy()
    expect(screen.queryByPlaceholderText('+91 98765 43210')).toBeNull()
  })

  it('warns that a disabled agent does not answer its number', async () => {
    // The number is claimed and the dashboard says Live; without this the
    // client has no way to see why calls go unanswered.
    getVoiceAgent.mockResolvedValue({ success: true, data: { ...AGENT, isEnabled: false } })
    renderPage()

    expect(await screen.findByText(/agent is disabled/i)).toBeTruthy()
  })

  it('does not warn when the agent is enabled', async () => {
    renderPage()
    await screen.findByText('+91 98765 43210')

    expect(screen.queryByText(/agent is disabled/i)).toBeNull()
  })

  it('asks before releasing, because calls stop immediately', async () => {
    renderPage()
    await screen.findByText('+91 98765 43210')

    fireEvent.click(screen.getByRole('button', { name: /^release number$/i }))

    expect(await screen.findByText(/calls to it stop being answered/i)).toBeTruthy()
    expect(releaseVoiceAgentPhoneNumber).not.toHaveBeenCalled()
  })

  it('releases the number once confirmed', async () => {
    renderPage()
    await screen.findByText('+91 98765 43210')
    fireEvent.click(screen.getByRole('button', { name: /^release number$/i }))
    await screen.findByText(/calls to it stop being answered/i)

    fireEvent.click(screen.getAllByRole('button', { name: /^release number$/i }).slice(-1)[0])

    await waitFor(() => expect(releaseVoiceAgentPhoneNumber).toHaveBeenCalledWith('agent-1'))
    expect(await screen.findByPlaceholderText('+91 98765 43210')).toBeTruthy()
  })

  it('keeps the number when the client backs out', async () => {
    renderPage()
    await screen.findByText('+91 98765 43210')
    fireEvent.click(screen.getByRole('button', { name: /^release number$/i }))
    await screen.findByText(/calls to it stop being answered/i)

    fireEvent.click(screen.getByRole('button', { name: /keep it/i }))

    await waitFor(() => expect(screen.queryByText(/calls to it stop being answered/i)).toBeNull())
    expect(releaseVoiceAgentPhoneNumber).not.toHaveBeenCalled()
  })

  it('keeps showing the number when the release fails', async () => {
    releaseVoiceAgentPhoneNumber.mockResolvedValue({ success: false, error: 'DynamoDB unavailable' })
    renderPage()
    await screen.findByText('+91 98765 43210')
    fireEvent.click(screen.getByRole('button', { name: /^release number$/i }))
    await screen.findByText(/calls to it stop being answered/i)

    fireEvent.click(screen.getAllByRole('button', { name: /^release number$/i }).slice(-1)[0])

    expect(await screen.findByText('DynamoDB unavailable')).toBeTruthy()
    expect(screen.getByText('+91 98765 43210')).toBeTruthy()
  })
})
