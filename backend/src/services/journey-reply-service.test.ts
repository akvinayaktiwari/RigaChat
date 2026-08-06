import { beforeEach, describe, expect, it, vi } from 'vitest'

const getPendingReply = vi.fn()
const clearPendingReply = vi.fn()
vi.mock('../repositories/journey-pending-reply-repository.js', () => ({ getPendingReply, clearPendingReply }))

const consumeResumeAllowance = vi.fn()
const isOptedOut = vi.fn()
const recordOptOut = vi.fn()
vi.mock('../repositories/whatsapp-inbound-activity-repository.js', () => ({
  consumeResumeAllowance,
  isOptedOut,
  recordOptOut,
}))

const resumeAwaitingExecution = vi.fn()
const failAwaitingExecution = vi.fn()
vi.mock('../lib/step-functions.js', () => ({ resumeAwaitingExecution, failAwaitingExecution }))

const { handleInboundLeadMessage, isOptOutMessage } = await import('./journey-reply-service.js')

const pending = {
  leadId: 'lead-1',
  taskToken: 'token-abc',
  bundleId: 'bundle-1',
  stepId: 'ask-budget',
  botId: 'bot-1',
  clientId: 'client-1',
  createdAt: 'now',
  expiresAt: Math.floor(Date.now() / 1000) + 86400,
}

beforeEach(() => {
  vi.clearAllMocks()
  isOptedOut.mockResolvedValue(false)
  recordOptOut.mockResolvedValue(undefined)
  clearPendingReply.mockResolvedValue(undefined)
  consumeResumeAllowance.mockResolvedValue(true)
  getPendingReply.mockResolvedValue(pending)
  resumeAwaitingExecution.mockResolvedValue({ resumed: true })
  failAwaitingExecution.mockResolvedValue({ resumed: true })
})

describe('isOptOutMessage — whole message, not substring', () => {
  it.each(['STOP', 'stop', ' Stop ', 'unsubscribe', 'Cancel', 'opt out', 'remove me', 'stop.'])(
    'treats %j as an opt-out',
    (text) => {
      expect(isOptOutMessage(text)).toBe(true)
    }
  )

  // The failure that matters: a substring match would opt a lead out for asking
  // a perfectly normal question about a site visit.
  it.each([
    'stop by the site office on Sunday?',
    'can you cancel my 3pm and rebook?',
    'I want to end up in a 3BHK',
    'Please remove me from the waitlist for tower A',
  ])('does NOT treat %j as an opt-out', (text) => {
    expect(isOptOutMessage(text)).toBe(false)
  })
})

describe('handleInboundLeadMessage — resuming a paused journey', () => {
  it('hands the reply text back to the waiting execution', async () => {
    const outcome = await handleInboundLeadMessage('lead-1', 'My budget is around 90 lakhs')

    expect(resumeAwaitingExecution).toHaveBeenCalledWith(
      'token-abc',
      expect.objectContaining({ replied: true, message: 'My budget is around 90 lakhs' })
    )
    expect(outcome).toMatchObject({ handled: 'resumed', bundleId: 'bundle-1', stepId: 'ask-budget' })
  })

  it('clears the single-use token after resuming', async () => {
    await handleInboundLeadMessage('lead-1', 'hello')
    expect(clearPendingReply).toHaveBeenCalledWith('lead-1', 'token-abc')
  })

  it('does nothing when no journey is parked on this lead', async () => {
    getPendingReply.mockResolvedValue(null)

    await expect(handleInboundLeadMessage('lead-1', 'hello')).resolves.toEqual({ handled: 'no_pending_journey' })
    expect(resumeAwaitingExecution).not.toHaveBeenCalled()
  })

  // A reply arriving just after the 24h window closed is ordinary, not an error:
  // Step Functions has already routed the execution down onNoReply.
  it('reports a stale token instead of failing when the window already closed', async () => {
    resumeAwaitingExecution.mockResolvedValue({ resumed: false, reason: 'token_expired' })

    await expect(handleInboundLeadMessage('lead-1', 'sorry, was busy')).resolves.toEqual({
      handled: 'stale_token',
      reason: 'token_expired',
    })
    // Still cleared -- a token that can only fail is worse than none.
    expect(clearPendingReply).toHaveBeenCalled()
  })
})

describe('handleInboundLeadMessage — resumption is bound to a token we stored', () => {
  // The security property: an inbound message can only advance a journey that is
  // genuinely parked on THIS lead. It cannot start one, skip a step, choose a
  // branch, or resume anyone else's -- the caller supplies no token.
  it('never resumes using anything the caller supplied', async () => {
    await handleInboundLeadMessage('lead-1', 'anything at all')

    const [tokenUsed] = resumeAwaitingExecution.mock.calls[0]
    expect(tokenUsed).toBe(pending.taskToken)
  })

  it('refuses to resume once the per-lead allowance is spent', async () => {
    consumeResumeAllowance.mockResolvedValue(false)

    await expect(handleInboundLeadMessage('lead-1', 'flood')).resolves.toEqual({ handled: 'rate_limited' })
    expect(resumeAwaitingExecution).not.toHaveBeenCalled()
  })
})

describe('handleInboundLeadMessage — opt-out', () => {
  it('records the opt-out and stops the paused journey', async () => {
    const outcome = await handleInboundLeadMessage('lead-1', 'STOP')

    expect(recordOptOut).toHaveBeenCalledWith('lead-1')
    expect(failAwaitingExecution).toHaveBeenCalledWith('token-abc', 'LeadOptedOut', expect.any(String))
    expect(outcome).toMatchObject({ handled: 'opted_out', stoppedJourney: true })
  })

  // Advancing the journey would send the next message -- responding to "stop"
  // by messaging them again.
  it('never treats an opt-out as a conversational reply', async () => {
    await handleInboundLeadMessage('lead-1', 'unsubscribe')
    expect(resumeAwaitingExecution).not.toHaveBeenCalled()
  })

  it('opts out even when no journey is running', async () => {
    getPendingReply.mockResolvedValue(null)

    await expect(handleInboundLeadMessage('lead-1', 'STOP')).resolves.toEqual({
      handled: 'opted_out',
      stoppedJourney: false,
    })
    expect(recordOptOut).toHaveBeenCalled()
  })

  // Opt-out is recorded before the execution is stopped on purpose: if stopping
  // fails, the lead is still opted out and every future send is blocked, which
  // is the outcome that actually protects them.
  it('still records the opt-out if stopping the execution fails', async () => {
    failAwaitingExecution.mockRejectedValue(new Error('AWS down'))

    await expect(handleInboundLeadMessage('lead-1', 'STOP')).rejects.toThrow()
    expect(recordOptOut).toHaveBeenCalledWith('lead-1')
  })

  it('does not resume a journey for a lead who opted out earlier', async () => {
    isOptedOut.mockResolvedValue(true)

    await expect(handleInboundLeadMessage('lead-1', 'actually, tell me more')).resolves.toEqual({
      handled: 'no_pending_journey',
    })
    expect(resumeAwaitingExecution).not.toHaveBeenCalled()
  })
})
