import { beforeEach, describe, expect, it, vi } from 'vitest'

const createAppointmentRequest = vi.fn()
const getLeadById = vi.fn()
const bookViaCalCom = vi.fn()

vi.mock('../repositories/appointment-request-repository.js', () => ({ createAppointmentRequest }))
vi.mock('../repositories/lead-repository.js', () => ({ getLeadById }))
vi.mock('../services/cal-com-service.js', () => ({ bookViaCalCom }))

const { bookAppointment } = await import('./booking-mcp-server.js')

beforeEach(() => {
  createAppointmentRequest.mockReset()
  getLeadById.mockReset()
  bookViaCalCom.mockReset()
})

describe('bookAppointment', () => {
  it('rejects an invalid requestedAt before touching anything else', async () => {
    await expect(
      bookAppointment({ botId: 'bot-1', clientId: 'client-1', leadId: 'lead-1', requestedAt: 'not-a-date' })
    ).rejects.toThrow(/not a valid ISO 8601 datetime/)
    expect(getLeadById).not.toHaveBeenCalled()
    expect(createAppointmentRequest).not.toHaveBeenCalled()
  })

  it('falls back to a plain "requested" record when the client has no Cal.com connection', async () => {
    getLeadById.mockResolvedValueOnce({ leadId: 'lead-1', name: 'Priya', email: 'priya@example.com' })
    bookViaCalCom.mockResolvedValueOnce({ connected: false })
    createAppointmentRequest.mockResolvedValueOnce({ requestId: 'req-1', status: 'requested' })

    const result = await bookAppointment({
      botId: 'bot-1',
      clientId: 'client-1',
      leadId: 'lead-1',
      requestedAt: '2026-08-01T10:00:00Z',
      notes: 'wants a weekend visit',
    })

    expect(createAppointmentRequest).toHaveBeenCalledWith({
      botId: 'bot-1',
      clientId: 'client-1',
      leadId: 'lead-1',
      requestedAt: '2026-08-01T10:00:00Z',
      notes: 'wants a weekend visit',
      status: 'requested',
    })
    expect(result).toEqual({ requestId: 'req-1', status: 'requested' })
  })

  it('creates a real confirmed booking when the client is connected, using the lead name/email/default timezone', async () => {
    getLeadById.mockResolvedValueOnce({ leadId: 'lead-1', name: 'Priya', email: 'priya@example.com' })
    bookViaCalCom.mockResolvedValueOnce({ connected: true, booking: { uid: 'booking-uid-1', status: 'accepted' } })
    createAppointmentRequest.mockResolvedValueOnce({ requestId: 'req-1', status: 'confirmed' })

    await bookAppointment({
      botId: 'bot-1',
      clientId: 'client-1',
      leadId: 'lead-1',
      requestedAt: '2026-08-01T10:00:00Z',
    })

    expect(bookViaCalCom).toHaveBeenCalledWith({
      clientId: 'client-1',
      start: '2026-08-01T10:00:00.000Z',
      attendeeName: 'Priya',
      attendeeEmail: 'priya@example.com',
      attendeeTimeZone: 'Asia/Kolkata',
    })
    expect(createAppointmentRequest).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'confirmed', calComBookingUid: 'booking-uid-1' })
    )
  })

  it('falls back to "Lead" as the attendee name when the lead has none on file', async () => {
    getLeadById.mockResolvedValueOnce({ leadId: 'lead-1' })
    bookViaCalCom.mockResolvedValueOnce({ connected: false })
    createAppointmentRequest.mockResolvedValueOnce({ requestId: 'req-1', status: 'requested' })

    await bookAppointment({ botId: 'bot-1', clientId: 'client-1', leadId: 'lead-1', requestedAt: '2026-08-01T10:00:00Z' })

    expect(bookViaCalCom).toHaveBeenCalledWith(expect.objectContaining({ attendeeName: 'Lead' }))
  })

  it('records status "failed" with the real reason when a connected client\'s booking attempt is rejected by Cal.com', async () => {
    getLeadById.mockResolvedValueOnce({ leadId: 'lead-1', name: 'Priya' })
    bookViaCalCom.mockRejectedValueOnce(new Error('Cal.com createBooking failed: attendee email is required'))
    createAppointmentRequest.mockResolvedValueOnce({ requestId: 'req-1', status: 'failed' })

    const result = await bookAppointment({
      botId: 'bot-1',
      clientId: 'client-1',
      leadId: 'lead-1',
      requestedAt: '2026-08-01T10:00:00Z',
    })

    expect(createAppointmentRequest).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', notes: expect.stringContaining('attendee email is required') })
    )
    expect(result).toEqual({ requestId: 'req-1', status: 'failed' })
  })
})
