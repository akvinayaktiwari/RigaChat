import { beforeEach, describe, expect, it, vi } from 'vitest'

const createScheduledAction = vi.fn()

vi.mock('../services/scheduler-service.js', () => ({ createScheduledAction }))

const { scheduleReminder } = await import('./reminder-mcp-server.js')

beforeEach(() => {
  createScheduledAction.mockReset()
})

describe('scheduleReminder', () => {
  it('creates a lead-scoped one_off ScheduledAction', async () => {
    createScheduledAction.mockResolvedValueOnce({ scheduleId: 'sched-1' })

    const result = await scheduleReminder({
      botId: 'bot-1',
      clientId: 'client-1',
      leadId: 'lead-1',
      remindAt: '2026-08-01T10:00:00Z',
    })

    expect(createScheduledAction).toHaveBeenCalledWith({
      clientId: 'client-1',
      botId: 'bot-1',
      leadId: 'lead-1',
      actionType: 'lead_reminder',
      cadence: { type: 'one_off', at: '2026-08-01T10:00:00Z' },
    })
    expect(result).toEqual({ scheduleId: 'sched-1' })
  })

  // These arrive on journey-executor-service.ts's `shared` payload and were
  // being dropped here for want of a declaration, which is what made every
  // fired reminder resolve as a chat lead regardless of where it came from.
  it('carries leadSource and leadParentId onto the schedule', async () => {
    createScheduledAction.mockResolvedValueOnce({ scheduleId: 'sched-2' })

    await scheduleReminder({
      botId: 'bot-1',
      clientId: 'client-1',
      leadId: 'lead-9',
      remindAt: '2026-08-01T10:00:00Z',
      leadSource: 'meta',
      leadParentId: 'page-7',
    })

    expect(createScheduledAction).toHaveBeenCalledWith(
      expect.objectContaining({ leadSource: 'meta', leadParentId: 'page-7' })
    )
  })

  it('propagates ScheduleValidationError for a past remindAt (validated by compileScheduleExpression)', async () => {
    createScheduledAction.mockRejectedValueOnce(new Error('one_off cadence must be in the future'))

    await expect(
      scheduleReminder({ botId: 'bot-1', clientId: 'client-1', leadId: 'lead-1', remindAt: '2020-01-01T00:00:00Z' })
    ).rejects.toThrow(/must be in the future/)
  })
})
