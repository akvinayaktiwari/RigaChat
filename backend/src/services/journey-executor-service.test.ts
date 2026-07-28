import { beforeEach, describe, expect, it, vi } from 'vitest'

const incrementWaitAndRecheckIteration = vi.fn()
const bookAppointment = vi.fn()
const scheduleReminder = vi.fn()
const getQuotation = vi.fn()
const sendBrochure = vi.fn()

vi.mock('../repositories/journey-execution-repository.js', () => ({
  incrementWaitAndRecheckIteration,
}))
// Mocked at the mcp/*.ts boundary, not deeper (DynamoDB/EventBridge) --
// this test's job is to verify handleToolCall's dispatch (right function,
// right args), not booking/reminder's own persistence behavior, which has
// its own dedicated tests.
vi.mock('../mcp/booking-mcp-server.js', () => ({ bookAppointment }))
vi.mock('../mcp/reminder-mcp-server.js', () => ({ scheduleReminder }))
vi.mock('../mcp/quotation-mcp-server.js', () => ({ getQuotation }))
vi.mock('../mcp/brochure-mcp-server.js', () => ({ sendBrochure }))

const { executeJourneyStep } = await import('./journey-executor-service.js')

const baseContext = {
  botId: 'bot-1',
  bundleId: 'bundle-1',
  clientId: 'client-1',
  leadId: 'lead-1',
  channel: 'web_widget' as const,
}

beforeEach(() => {
  incrementWaitAndRecheckIteration.mockReset()
  bookAppointment.mockReset()
  scheduleReminder.mockReset()
  getQuotation.mockReset()
  sendBrochure.mockReset()
})

describe('executeJourneyStep', () => {
  describe('wait_and_recheck_check', () => {
    it('is never satisfied yet (no real data model to check against)', async () => {
      incrementWaitAndRecheckIteration.mockResolvedValueOnce(1)

      const result = await executeJourneyStep({
        ...baseContext,
        operation: 'wait_and_recheck_check',
        stepId: 'poll',
        maxIterations: 5,
      })

      expect(result).toMatchObject({ satisfied: false })
    })

    it('is not exhausted while the iteration count is below maxIterations', async () => {
      incrementWaitAndRecheckIteration.mockResolvedValueOnce(3)

      const result = await executeJourneyStep({
        ...baseContext,
        operation: 'wait_and_recheck_check',
        stepId: 'poll',
        maxIterations: 5,
      })

      expect(result).toMatchObject({ exhausted: false })
    })

    it('is exhausted once the iteration count reaches maxIterations', async () => {
      incrementWaitAndRecheckIteration.mockResolvedValueOnce(5)

      const result = await executeJourneyStep({
        ...baseContext,
        operation: 'wait_and_recheck_check',
        stepId: 'poll',
        maxIterations: 5,
      })

      expect(result).toMatchObject({ exhausted: true })
      expect(incrementWaitAndRecheckIteration).toHaveBeenCalledWith('lead-1', 'poll')
    })

    it('throws when stepId or maxIterations is missing', async () => {
      await expect(
        executeJourneyStep({ ...baseContext, operation: 'wait_and_recheck_check' })
      ).rejects.toThrow(/missing stepId or maxIterations/)
      expect(incrementWaitAndRecheckIteration).not.toHaveBeenCalled()
    })
  })

  it('send_message returns an unsent stub without throwing', async () => {
    const result = await executeJourneyStep({ ...baseContext, operation: 'send_message', stepId: 'greet' })
    expect(result).toEqual({ sent: false, stub: true })
  })

  describe('tool_call', () => {
    it('dispatches "booking" to bookAppointment with the parsed requestedAt', async () => {
      bookAppointment.mockResolvedValueOnce({ requestId: 'req-1' })

      const result = await executeJourneyStep({
        ...baseContext,
        operation: 'tool_call',
        toolName: 'booking',
        toolInput: { requestedAt: '2026-08-01T10:00:00Z' },
      })

      expect(bookAppointment).toHaveBeenCalledWith({
        botId: 'bot-1',
        clientId: 'client-1',
        leadId: 'lead-1',
        requestedAt: '2026-08-01T10:00:00Z',
      })
      expect(result).toEqual({ requestId: 'req-1' })
    })

    it('dispatches "reminder" to scheduleReminder with the parsed remindAt', async () => {
      scheduleReminder.mockResolvedValueOnce({ scheduleId: 'sched-1' })

      await executeJourneyStep({
        ...baseContext,
        operation: 'tool_call',
        toolName: 'reminder',
        toolInput: { remindAt: '2026-08-01T10:00:00Z' },
      })

      expect(scheduleReminder).toHaveBeenCalledWith({
        botId: 'bot-1',
        clientId: 'client-1',
        leadId: 'lead-1',
        remindAt: '2026-08-01T10:00:00Z',
      })
    })

    it('dispatches "quotation" and "brochure" to their stubs with just the shared context', async () => {
      getQuotation.mockResolvedValueOnce({ stub: true })
      await executeJourneyStep({ ...baseContext, operation: 'tool_call', toolName: 'quotation' })
      expect(getQuotation).toHaveBeenCalledWith({ botId: 'bot-1', clientId: 'client-1', leadId: 'lead-1' })

      sendBrochure.mockResolvedValueOnce({ stub: true })
      await executeJourneyStep({ ...baseContext, operation: 'tool_call', toolName: 'brochure' })
      expect(sendBrochure).toHaveBeenCalledWith({ botId: 'bot-1', clientId: 'client-1', leadId: 'lead-1' })
    })

    it('rejects "booking" with a missing requestedAt before ever calling bookAppointment', async () => {
      await expect(
        executeJourneyStep({ ...baseContext, operation: 'tool_call', toolName: 'booking', toolInput: {} })
      ).rejects.toThrow(/missing required field "requestedAt"/)
      expect(bookAppointment).not.toHaveBeenCalled()
    })

    it('rejects an unknown toolName', async () => {
      await expect(
        executeJourneyStep({ ...baseContext, operation: 'tool_call', toolName: 'not_a_real_tool' })
      ).rejects.toThrow(/unknown toolName/)
    })
  })

  it('human_handoff acknowledges the handoff', async () => {
    const result = await executeJourneyStep({ ...baseContext, operation: 'human_handoff', stepId: 'handoff' })
    expect(result).toEqual({ handedOff: true })
  })
})
