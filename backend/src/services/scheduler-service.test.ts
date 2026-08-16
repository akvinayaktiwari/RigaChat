import { beforeEach, describe, expect, it, vi } from 'vitest'

// compileScheduleExpression is pure and doesn't touch whatsapp-service.js at
// all, but scheduler-service.ts imports it (for executeScheduledAction's
// dispatch to sendWeeklyReport), which transitively pulls in the entire
// lead/form-lead/conversation repository graph -- each with its own
// module-load-time getTableName() check. Mocking the one import this test
// doesn't exercise avoids growing vitest.config.ts's env var list every
// time an unrelated service adds a new table dependency.
vi.mock('./whatsapp-service.js', () => ({ sendWeeklyReport: vi.fn() }))

// Same reasoning: scheduler-service.ts now imports agent-service.js
// (resolveOwningAgentId, to stamp the owning Agent on lead-scoped actions),
// which transitively pulls in the agents / agent_binding_lookup repositories
// and their module-load-time getTableName() checks. Mock the boundary this
// test doesn't exercise.
vi.mock('./agent-service.js', () => ({ resolveOwningAgentId: vi.fn().mockResolvedValue(undefined) }))

const sendHandoffAlert = vi.fn()
vi.mock('./notification-service.js', () => ({ sendHandoffAlert }))

const { compileScheduleExpression, executeScheduledAction, ScheduleValidationError } = await import(
  './scheduler-service.js'
)

describe('compileScheduleExpression', () => {
  it('compiles an interval_days cadence to an EventBridge rate() expression', () => {
    expect(compileScheduleExpression({ type: 'interval_days', intervalDays: 7 })).toBe('rate(7 days)')
  })

  it('uses the singular "day" for a 1-day interval', () => {
    expect(compileScheduleExpression({ type: 'interval_days', intervalDays: 1 })).toBe('rate(1 day)')
  })

  it('rejects an interval below the minimum', () => {
    expect(() => compileScheduleExpression({ type: 'interval_days', intervalDays: 0 })).toThrow(ScheduleValidationError)
  })

  it('rejects a non-integer interval', () => {
    expect(() => compileScheduleExpression({ type: 'interval_days', intervalDays: 1.5 })).toThrow(
      ScheduleValidationError
    )
  })

  it('compiles a future one_off cadence to an EventBridge at() expression', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const result = compileScheduleExpression({ type: 'one_off', at: future })
    expect(result).toMatch(/^at\(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\)$/)
  })

  it('rejects an invalid datetime string', () => {
    expect(() => compileScheduleExpression({ type: 'one_off', at: 'not-a-date' })).toThrow(
      /not a valid ISO 8601 datetime/
    )
  })

  it('rejects a one_off cadence in the past', () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    expect(() => compileScheduleExpression({ type: 'one_off', at: past })).toThrow(/must be in the future/)
  })
})

// AC6: lead_reminder stopped being a console.log. A reminder and a handoff are
// the same thing to the person receiving it -- "look at this lead now" -- so
// both go out through the one notification path rather than each growing its
// own send.
describe('executeScheduledAction lead_reminder', () => {
  beforeEach(() => {
    sendHandoffAlert.mockReset()
    sendHandoffAlert.mockResolvedValue({ notified: true })
  })

  it('notifies the human through the same path a handoff uses', async () => {
    await executeScheduledAction('client-1', 'lead_reminder', { leadId: 'lead-1', botId: 'bot-1' })

    expect(sendHandoffAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        leadRef: { source: 'chat', botId: 'bot-1', leadId: 'lead-1' },
        clientId: 'client-1',
        trigger: 'lead_reminder',
      })
    )
  })

  it('skips a schedule with no lead context instead of throwing', async () => {
    await expect(executeScheduledAction('client-1', 'lead_reminder', {})).resolves.toBeUndefined()

    expect(sendHandoffAlert).not.toHaveBeenCalled()
  })
})
