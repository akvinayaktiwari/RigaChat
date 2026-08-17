import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { McpCapability } from '../types/index.js'

const isOptedOut = vi.fn()
vi.mock('../repositories/lead-event-repository.js', () => ({
  appendLeadEvent: vi.fn(),
  getEventByWamid: vi.fn(),
}))
vi.mock('../repositories/whatsapp-inbound-activity-repository.js', () => ({ isOptedOut }))

const claimPendingReply = vi.fn()
vi.mock('../repositories/journey-pending-reply-repository.js', () => ({ claimPendingReply }))

const getAppointmentRequestsByBotId = vi.fn()
vi.mock('../repositories/appointment-request-repository.js', () => ({ getAppointmentRequestsByBotId }))

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

// readJourneyLead reaches these for non-chat leads. Before the leadSource fix
// the executor never looked here at all, which was the bug.
const getFormLeadById = vi.fn()
vi.mock('../repositories/form-lead-repository.js', () => ({ getFormLeadById }))
const getPublicFormConfig = vi.fn()
vi.mock('../repositories/form-repository.js', () => ({ getPublicFormConfig }))
const getMetaLeadById = vi.fn()
vi.mock('../repositories/meta-lead-repository.js', () => ({ getMetaLeadById }))
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
  isOptedOut.mockReset()
  isOptedOut.mockResolvedValue(false)
  claimPendingReply.mockReset()
  claimPendingReply.mockResolvedValue(undefined)
  getAppointmentRequestsByBotId.mockReset()
  getAppointmentRequestsByBotId.mockResolvedValue([])
  incrementWaitAndRecheckIteration.mockReset()
  bookAppointment.mockReset()
  scheduleReminder.mockReset()
  getQuotation.mockReset()
  sendBrochure.mockReset()
  getLeadById.mockReset()
  getFormLeadById.mockReset()
  getPublicFormConfig.mockReset()
  getMetaLeadById.mockReset()
  getPublicFormConfig.mockResolvedValue(null)
  hasActiveWhatsAppSession.mockReset()
  sendWhatsAppMessageToLead.mockReset()
})

describe('executeJourneyStep', () => {
  describe('wait_and_recheck_check', () => {
    // replied / lead_score still have nowhere to live, and a step with no
    // recheckField has nothing to check, so these stay false by design.
    it('is not satisfied when there is no recheckField to evaluate', async () => {
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

    // Regression: the executor used to call getLeadById(event.botId, ...),
    // which reads the CHAT leads table only. A form lead lives in form_leads
    // under formId, so the lookup returned null and every send reported
    // no_phone_number for a lead whose phone was on file the whole time.
    it('finds a form lead’s phone via leadSource instead of the chat table', async () => {
      getFormLeadById.mockResolvedValueOnce({
        leadId: 'lead-1',
        formId: 'form-1',
        clientId: 'client-1',
        source: 'form',
        customFields: JSON.stringify({ 'fid-1': '+919900000000' }),
        sourceUrl: 'https://example.com',
        createdAt: '2026-08-01T00:00:00.000Z',
      })
      getPublicFormConfig.mockResolvedValueOnce({
        formId: 'form-1',
        fields: [{ fieldId: 'fid-1', label: 'Mobile', type: 'phone', required: true }],
      })
      hasActiveWhatsAppSession.mockResolvedValueOnce(true)
      sendWhatsAppMessageToLead.mockResolvedValueOnce({ sent: true })

      const result = await executeJourneyStep({
        ...baseContext,
        channel: 'whatsapp',
        operation: 'send_message',
        stepId: 'greet',
        leadSource: 'form',
        leadParentId: 'form-1',
      })

      expect(getFormLeadById).toHaveBeenCalledWith('form-1', 'lead-1')
      expect(getLeadById).not.toHaveBeenCalled()
      expect(result).not.toMatchObject({ reason: 'no_phone_number' })
    })

    it('still treats a lead with no leadSource as a chat lead under botId', async () => {
      getLeadById.mockResolvedValueOnce({ leadId: 'lead-1', clientId: 'client-1', phone: '+15551234567' })
      hasActiveWhatsAppSession.mockResolvedValueOnce(false)

      await executeJourneyStep({
        ...baseContext,
        channel: 'whatsapp',
        operation: 'send_message',
        stepId: 'greet',
      })

      expect(getLeadById).toHaveBeenCalled()
      expect(getFormLeadById).not.toHaveBeenCalled()
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

    // D12's precedence: the agent's grounded answer to what the lead just said
    // beats the step's authored line. Without this the lead gets a script in
    // reply to a question, which is the behaviour the whole epic set out to fix.
    it('prefers the agent’s composed reply over the step’s authored hint', async () => {
      getLeadById.mockResolvedValueOnce({ leadId: 'lead-1', phone: '+15551234567' })
      hasActiveWhatsAppSession.mockResolvedValueOnce(true)
      sendWhatsAppMessageToLead.mockResolvedValueOnce({ success: true, messageId: 'msg-2' })

      await executeJourneyStep({
        ...baseContext,
        channel: 'whatsapp',
        operation: 'send_message',
        stepId: 'greet',
        messageHint: 'Hi, checking in!',
        lastResult: { replied: true, message: 'what are the amenities?', composedReply: 'There is a gym and a pool.' },
      })

      expect(sendWhatsAppMessageToLead).toHaveBeenCalledWith(
        'client-1',
        '+15551234567',
        'There is a gym and a pool.'
      )
    })

    // Epic A's definition of done #5: a journey published BEFORE the agent could
    // compose must run unchanged, without republishing. Its already-compiled
    // state machine passes no lastResult.composedReply, so the send has to fall
    // straight back to the authored line -- this is that event, exactly as an
    // old execution still emits it.
    it('falls back to the authored hint for a journey compiled before composition existed', async () => {
      getLeadById.mockResolvedValueOnce({ leadId: 'lead-1', phone: '+15551234567' })
      hasActiveWhatsAppSession.mockResolvedValueOnce(true)
      sendWhatsAppMessageToLead.mockResolvedValueOnce({ success: true, messageId: 'msg-3' })

      await executeJourneyStep({
        ...baseContext,
        channel: 'whatsapp',
        operation: 'send_message',
        stepId: 'greet',
        messageHint: 'Hi, checking in!',
        lastResult: { replied: true, message: 'ok' },
      })

      expect(sendWhatsAppMessageToLead).toHaveBeenCalledWith('client-1', '+15551234567', 'Hi, checking in!')
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

describe('send_message — opt-out is enforced before anything else', () => {
  // A 60-90 day nurture journey keeps firing on schedule. Without this check a
  // lead who replied STOP on day 2 keeps receiving messages until day 90, which
  // is a Meta WhatsApp Business policy violation against OUR account.
  it('refuses to send to a lead who opted out, without even reading the lead', async () => {
    isOptedOut.mockResolvedValue(true)

    const result = await executeJourneyStep({
      ...baseContext,
      operation: 'send_message',
      channel: 'whatsapp',
      messageHint: 'hi',
    })

    expect(result).toMatchObject({ sent: false, reason: 'opted_out' })
    expect(getLeadById).not.toHaveBeenCalled()
    expect(sendWhatsAppMessageToLead).not.toHaveBeenCalled()
  })
})

describe('await_reply — parks the execution on the lead', () => {
  // The return value is irrelevant to Step Functions here (the execution resumes
  // only on SendTaskSuccess), so storing the token durably IS the whole job.
  it('stores the callback token against the lead', async () => {
    await executeJourneyStep({
      ...baseContext,
      operation: 'await_reply',
      stepId: 'ask-budget',
      taskToken: 'token-abc',
    })

    expect(claimPendingReply).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: baseContext.leadId,
        taskToken: 'token-abc',
        stepId: 'ask-budget',
        bundleId: baseContext.bundleId,
      })
    )
  })

  it('sets a TTL that outlives the execution timeout so the row is never the first thing to vanish', async () => {
    await executeJourneyStep({
      ...baseContext,
      operation: 'await_reply',
      stepId: 'ask-budget',
      taskToken: 'token-abc',
    })

    const record = claimPendingReply.mock.calls[0]?.[0]
    const secondsFromNow = record.expiresAt - Math.floor(Date.now() / 1000)
    expect(secondsFromNow).toBeGreaterThan(24 * 60 * 60)
  })

  // Returning cleanly without a stored token would park the execution on a
  // token nobody recorded: unresumable, and invisible until it times out a day
  // later. Throwing fails the task immediately instead.
  it('throws rather than silently parking an unresumable execution', async () => {
    claimPendingReply.mockRejectedValue(new Error('conditional check failed'))

    await expect(
      executeJourneyStep({ ...baseContext, operation: 'await_reply', stepId: 's', taskToken: 't' })
    ).rejects.toThrow()
  })

  it('rejects an event with no task token', async () => {
    await expect(
      executeJourneyStep({ ...baseContext, operation: 'await_reply', stepId: 's' })
    ).rejects.toThrow(/missing taskToken/)
  })
})

describe('wait_and_recheck — appointment_booked is a real check now', () => {
  // Previously hardcoded false, so every wait_and_recheck ran to exhaustion and
  // onSatisfied was unreachable. Cal.com giving AppointmentRequest a genuine
  // 'confirmed' transition is what made this checkable.
  it('is satisfied when the lead has a confirmed appointment', async () => {
    getAppointmentRequestsByBotId.mockResolvedValue([
      { leadId: 'lead-1', status: 'confirmed', requestId: 'r1' },
    ])
    incrementWaitAndRecheckIteration.mockResolvedValueOnce(1)

    const result = await executeJourneyStep({
      ...baseContext,
      operation: 'wait_and_recheck_check',
      stepId: 'poll',
      recheckField: 'appointment_booked',
      maxIterations: 3,
    })

    expect(result).toMatchObject({ satisfied: true })
  })

  it('ignores a request that is merely requested or failed', async () => {
    getAppointmentRequestsByBotId.mockResolvedValue([
      { leadId: 'lead-1', status: 'requested' },
      { leadId: 'lead-1', status: 'failed' },
    ])
    incrementWaitAndRecheckIteration.mockResolvedValueOnce(1)

    const result = await executeJourneyStep({
      ...baseContext,
      operation: 'wait_and_recheck_check',
      stepId: 'poll',
      recheckField: 'appointment_booked',
      maxIterations: 3,
    })

    expect(result).toMatchObject({ satisfied: false })
  })

  // Cross-lead leakage would send one lead down onSatisfied because a different
  // lead on the same bot booked.
  it('ignores another lead’s confirmed booking on the same bot', async () => {
    getAppointmentRequestsByBotId.mockResolvedValue([{ leadId: 'someone-else', status: 'confirmed' }])
    incrementWaitAndRecheckIteration.mockResolvedValueOnce(1)

    const result = await executeJourneyStep({
      ...baseContext,
      operation: 'wait_and_recheck_check',
      stepId: 'poll',
      recheckField: 'appointment_booked',
      maxIterations: 3,
    })

    expect(result).toMatchObject({ satisfied: false })
  })

  // Booking on the last permitted tick must win over exhaustion, or a lead who
  // booked gets treated as one who ignored us.
  it('prefers satisfied over exhausted on the final iteration', async () => {
    getAppointmentRequestsByBotId.mockResolvedValue([{ leadId: 'lead-1', status: 'confirmed' }])
    incrementWaitAndRecheckIteration.mockResolvedValueOnce(3)

    const result = await executeJourneyStep({
      ...baseContext,
      operation: 'wait_and_recheck_check',
      stepId: 'poll',
      recheckField: 'appointment_booked',
      maxIterations: 3,
    })

    expect(result).toEqual({ satisfied: true, exhausted: false })
  })
})
