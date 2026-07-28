import { beforeEach, describe, expect, it, vi } from 'vitest'

const createAppointmentRequest = vi.fn()

vi.mock('../repositories/appointment-request-repository.js', () => ({ createAppointmentRequest }))

const { bookAppointment } = await import('./booking-mcp-server.js')

beforeEach(() => {
  createAppointmentRequest.mockReset()
})

describe('bookAppointment', () => {
  it('persists a request record for a valid requestedAt', async () => {
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
    })
    expect(result).toEqual({ requestId: 'req-1', status: 'requested' })
  })

  it('rejects an invalid requestedAt before touching the repository', async () => {
    await expect(
      bookAppointment({ botId: 'bot-1', clientId: 'client-1', leadId: 'lead-1', requestedAt: 'not-a-date' })
    ).rejects.toThrow(/not a valid ISO 8601 datetime/)
    expect(createAppointmentRequest).not.toHaveBeenCalled()
  })
})
