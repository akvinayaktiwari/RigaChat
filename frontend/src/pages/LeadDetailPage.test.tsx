import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// frontend vitest runs without globals, so @testing-library's auto-cleanup never
// registers and renders stack in one document.
afterEach(cleanup)

const getUnifiedLeadDetail = vi.fn()
const getLeadEvents = vi.fn()
const updateLeadState = vi.fn()
const addLeadNote = vi.fn()
const setLeadArchived = vi.fn()
const eraseLead = vi.fn()

vi.mock('../services/api', () => ({
  getUnifiedLeadDetail: (...a: unknown[]) => getUnifiedLeadDetail(...a),
  getLeadEvents: (...a: unknown[]) => getLeadEvents(...a),
  updateLeadState: (...a: unknown[]) => updateLeadState(...a),
  addLeadNote: (...a: unknown[]) => addLeadNote(...a),
  setLeadArchived: (...a: unknown[]) => setLeadArchived(...a),
  eraseLead: (...a: unknown[]) => eraseLead(...a),
}))

const toastShow = vi.fn()
vi.mock('../components/Toast/Toast', () => ({ useToast: () => ({ show: toastShow }) }))

const navigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

const LeadDetailPage = (await import('./LeadDetailPage')).default

function lead(overrides: Record<string, unknown> = {}) {
  return {
    leadId: 'lead-abc12345',
    clientId: 'client-1',
    source: 'chat',
    name: 'Priya Sharma',
    email: 'priya@example.com',
    phone: '+919812345678',
    createdAt: '2026-08-20T10:00:00.000Z',
    customFields: {},
    state: null,
    ...overrides,
  }
}

async function renderDetail(data: Record<string, unknown> = lead()) {
  getUnifiedLeadDetail.mockResolvedValue({ success: true, data })
  render(
    <MemoryRouter initialEntries={['/dashboard/leads/lead-abc12345?source=chat&botId=bot-1']}>
      <Routes>
        <Route path="/dashboard/leads/:leadId" element={<LeadDetailPage />} />
      </Routes>
    </MemoryRouter>
  )
  await screen.findByText('Priya Sharma')
}

beforeEach(() => {
  vi.clearAllMocks()
  getLeadEvents.mockResolvedValue({ success: true, data: [] })
  setLeadArchived.mockResolvedValue({ success: true, data: { leadId: 'lead-abc12345', archivedAt: 'now' } })
  eraseLead.mockResolvedValue({ success: true, data: { leadId: 'lead-abc12345', source: 'chat', eventsDeleted: 7, executionsStopped: 1 } })
})

describe('archiving from the lead detail', () => {
  it('archives with a single click, because it is reversible', async () => {
    await renderDetail()

    fireEvent.click(screen.getByRole('button', { name: /Archive/ }))

    await waitFor(() =>
      expect(setLeadArchived).toHaveBeenCalledWith({ source: 'chat', botId: 'bot-1', leadId: 'lead-abc12345' }, true)
    )
  })

  it('offers Restore, and says nothing was deleted, when already archived', async () => {
    await renderDetail(lead({ state: { leadId: 'lead-abc12345', status: 'new', notes: [], archivedAt: '2026-08-29T00:00:00.000Z' } }))

    expect(screen.getByRole('button', { name: /Restore/ })).toBeTruthy()
    expect(screen.getByText(/Nothing has been deleted/)).toBeTruthy()
  })
})

// The destructive half. Everything here is about making the irreversible
// action hard to reach by accident and impossible to reach by momentum.
describe('erasing a lead', () => {
  it('does not erase on the first click — it opens a confirmation', async () => {
    await renderDetail()

    fireEvent.click(screen.getByRole('button', { name: /Erase data/ }))

    expect(await screen.findByText(/Erase this lead/)).toBeTruthy()
    expect(eraseLead).not.toHaveBeenCalled()
  })

  // "All associated data" tells an operator nothing. If they are authorising a
  // permanent deletion they should see what actually disappears.
  it('names what will be destroyed', async () => {
    await renderDetail()
    fireEvent.click(screen.getByRole('button', { name: /Erase data/ }))

    expect(await screen.findByText(/every message to and from them/)).toBeTruthy()
    expect(screen.getByText(/any journey still running for them will be stopped/)).toBeTruthy()
  })

  it('points at Archive as the reversible alternative', async () => {
    await renderDetail()
    fireEvent.click(screen.getByRole('button', { name: /Erase data/ }))

    expect(await screen.findByText(/use\s+Archive instead/)).toBeTruthy()
  })

  it('keeps the confirm button disabled until the name is typed exactly', async () => {
    await renderDetail()
    fireEvent.click(screen.getByRole('button', { name: /Erase data/ }))

    const confirm = await screen.findByRole('button', { name: 'Erase permanently' })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('Confirm erasure by typing the lead name'), { target: { value: 'Priya' } })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('Confirm erasure by typing the lead name'), { target: { value: 'Priya Sharma' } })
    expect((confirm as HTMLButtonElement).disabled).toBe(false)
  })

  it('erases once confirmed and reports what was destroyed', async () => {
    await renderDetail()
    fireEvent.click(screen.getByRole('button', { name: /Erase data/ }))
    fireEvent.change(await screen.findByLabelText('Confirm erasure by typing the lead name'), { target: { value: 'Priya Sharma' } })
    fireEvent.click(screen.getByRole('button', { name: 'Erase permanently' }))

    await waitFor(() => expect(eraseLead).toHaveBeenCalledTimes(1))
    expect(toastShow).toHaveBeenCalledWith(expect.stringContaining('7 history entries deleted'), 'success')
    expect(toastShow).toHaveBeenCalledWith(expect.stringContaining('1 journey stopped'), 'success')
  })

  it('leaves the lead alone when the operator backs out', async () => {
    await renderDetail()
    fireEvent.click(screen.getByRole('button', { name: /Erase data/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByText('Erase permanently')).toBeNull())
    expect(eraseLead).not.toHaveBeenCalled()
  })

  it('stays on the page and surfaces the error when erasure fails', async () => {
    eraseLead.mockResolvedValue({ success: false, error: 'Lead not found' })
    await renderDetail()
    fireEvent.click(screen.getByRole('button', { name: /Erase data/ }))
    fireEvent.change(await screen.findByLabelText('Confirm erasure by typing the lead name'), { target: { value: 'Priya Sharma' } })
    fireEvent.click(screen.getByRole('button', { name: 'Erase permanently' }))

    await waitFor(() => expect(toastShow).toHaveBeenCalledWith('Lead not found', 'error'))
    expect(navigate).not.toHaveBeenCalledWith('/dashboard/leads')
  })
})
