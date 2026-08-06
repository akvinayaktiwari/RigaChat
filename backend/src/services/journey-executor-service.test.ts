import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { McpCapability } from '../types/index.js'

const incrementWaitAndRecheckIteration = vi.fn()
const bookAppointment = vi.fn()
const scheduleReminder = vi.fn()
const getQuotation = vi.fn()
const sendBrochure = vi.fn()
const getLeadById = vi.fn()
const hasActiveWhatsAppSession = vi.fn()
const sendWhatsAppMessageToLead = vi.fn()

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
vi.mock('../repositories/lead-repository.js', () => ({ getLeadById }))
vi.mock('./whatsapp-service.js', () => ({ hasActiveWhatsAppSession, sendWhatsAppMessageToLead }))

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
  getLeadById.mockReset()
  hasActiveWhatsAppSession.mockReset()
  sendWhatsAppMessageToLead.mockReset()
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

  describe('send_message', () => {
    it('is unsupported on channels other than whatsapp', async () => {
      const result = await executeJourneyStep({ ...baseContext, operation: 'send_message', stepId: 'greet' })
      expect(result).toMatchObject({ sent: false, reason: 'unsupported_channel' })
      expect(getLeadById).not.toHaveBeenCalled()
    })

    it('refuses when the lead has no phone number on file', async () => {
      getLeadById.mockResolvedValueOnce({ leadId: 'lead-1' })

      const result = await executeJourneyStep({
        ...baseContext,
        channel: 'whatsapp',
        operation: 'send_message',
        stepId: 'greet',
      })

      expect(result).toMatchObject({ sent: false, reason: 'no_phone_number' })
      expect(hasActiveWhatsAppSession).not.toHaveBeenCalled()
    })

    it('refuses outside an active WhatsApp session rather than risk a policy violation', async () => {
      getLeadById.mockResolvedValueOnce({ leadId: 'lead-1', phone: '+15551234567' })
      hasActiveWhatsAppSession.mockResolvedValueOnce(false)

      const result = await executeJourneyStep({
        ...baseContext,
        channel: 'whatsapp',
        operation: 'send_message',
        stepId: 'greet',
      })

      expect(result).toMatchObject({ sent: false, reason: 'no_active_session' })
      expect(sendWhatsAppMessageToLead).not.toHaveBeenCalled()
    })

    it('sends via WhatsApp when the lead has a phone number and an active session', async () => {
      getLeadById.mockResolvedValueOnce({ leadId: 'lead-1', phone: '+15551234567' })
      hasActiveWhatsAppSession.mockResolvedValueOnce(true)
      sendWhatsAppMessageToLead.mockResolvedValueOnce({ success: true, messageId: 'msg-1' })

      const result = await executeJourneyStep({
        ...baseContext,
        channel: 'whatsapp',
        operation: 'send_message',
        stepId: 'greet',
        messageHint: 'Hi, checking in!',
      })

      expect(sendWhatsAppMessageToLead).toHaveBeenCalledWith('client-1', '+15551234567', 'Hi, checking in!')
      expect(result).toMatchObject({ sent: true, messageId: 'msg-1' })
    })
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

    // The cast is deliberate, not a workaround. McpCapability now makes this
    // unrepresentable for our own callers, but a JourneyExecutorEvent arrives
    // from Step Functions -- an external boundary the type system does not
    // police. A state machine compiled before a capability was renamed, or a
    // hand-invoked execution, can still deliver a name that no longer exists,
    // so the runtime default branch has to keep working. Deleting this test
    // because "the type prevents it" would be exactly wrong.
    it('rejects an unknown toolName arriving from Step Functions', async () => {
      await expect(
        executeJourneyStep({
          ...baseContext,
          operation: 'tool_call',
          toolName: 'not_a_real_tool' as McpCapability,
        })
      ).rejects.toThrow(/unknown toolName/)
    })
  })

  it('human_handoff acknowledges the handoff', async () => {
    const result = await executeJourneyStep({ ...baseContext, operation: 'human_handoff', stepId: 'handoff' })
    expect(result).toEqual({ handedOff: true })
  })
})
