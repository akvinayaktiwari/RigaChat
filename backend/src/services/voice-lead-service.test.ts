import { beforeEach, describe, expect, it, vi } from 'vitest'

const appendLeadEvent = vi.fn()
vi.mock('../repositories/lead-event-repository.js', () => ({ appendLeadEvent }))

const createVoiceLead = vi.fn()
vi.mock('../repositories/voice-lead-repository.js', () => ({ createVoiceLead }))

const findLeadByPhone = vi.fn()
vi.mock('./lead-identity-service.js', () => ({ findLeadByPhone }))

const sendHandoffAlert = vi.fn()
vi.mock('./notification-service.js', () => ({ sendHandoffAlert }))

const { resolveCallLead, recordCallTurn, recordCallLifecycle, recordCallToolUse, recordCallHandoff } =
  await import('./voice-lead-service.js')

const CALL = {
  clientId: 'client-1',
  agentId: 'agent-1',
  callerPhone: '+919876543210',
  dialledNumber: '+911111111111',
  callId: 'call-1',
}

beforeEach(() => {
  appendLeadEvent.mockReset().mockResolvedValue(undefined)
  createVoiceLead.mockReset()
  findLeadByPhone.mockReset().mockResolvedValue(null)
  sendHandoffAlert.mockReset().mockResolvedValue({ notified: true })
})

describe('resolveCallLead', () => {
  // The whole point of the feature: a caller who already exists does NOT become
  // a second lead. Same leadId means same lead_events stream, same lead_state,
  // same journey -- shared context across WhatsApp, chat and the phone.
  it('attaches to an existing lead instead of creating a duplicate', async () => {
    findLeadByPhone.mockResolvedValue({
      leadRef: { source: 'chat', botId: 'bot-9', leadId: 'existing' },
      leadId: 'existing',
      phone: CALL.callerPhone,
      createdAt: '2026-09-01T00:00:00.000Z',
      candidateCount: 1,
      reason: 'only_match',
    })

    const identity = await resolveCallLead(CALL)

    expect(identity).toMatchObject({
      leadId: 'existing',
      leadRef: { source: 'chat', botId: 'bot-9', leadId: 'existing' },
      isNewLead: false,
      matchReason: 'only_match',
    })
    expect(createVoiceLead).not.toHaveBeenCalled()
  })

  it('creates a voice lead for a caller nobody has seen before', async () => {
    createVoiceLead.mockResolvedValue({ leadId: 'new-voice', agentId: 'agent-1' })

    const identity = await resolveCallLead(CALL)

    expect(createVoiceLead).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'agent-1',
        clientId: 'client-1',
        phone: '+919876543210',
        dialledNumber: '+911111111111',
        callId: 'call-1',
      })
    )
    expect(identity).toMatchObject({
      leadId: 'new-voice',
      leadRef: { source: 'voice', agentId: 'agent-1', leadId: 'new-voice' },
      isNewLead: true,
    })
  })

  // Withheld caller ID is ordinary on inbound calls. There is nothing to join
  // on and no number to call back, but the call still happened and should still
  // leave a record.
  it('still records a call from a withheld number, without attempting a match', async () => {
    createVoiceLead.mockResolvedValue({ leadId: 'anon', agentId: 'agent-1' })

    const identity = await resolveCallLead({ ...CALL, callerPhone: '' })

    expect(findLeadByPhone).not.toHaveBeenCalled()
    expect(createVoiceLead).toHaveBeenCalledWith(expect.objectContaining({ phone: '' }))
    expect(identity.isNewLead).toBe(true)
  })

  // lead_events.botId is required. A kb_only voice agent has no linked chatbot,
  // and inventing a fake bot reference would be worse than using the agent's
  // own id -- the field scopes events, it does not drive Pinecone retrieval.
  it('falls back to the agentId when the voice agent has no linked bot', async () => {
    createVoiceLead.mockResolvedValue({ leadId: 'new-voice', agentId: 'agent-1' })

    await expect(resolveCallLead(CALL)).resolves.toMatchObject({ botId: 'agent-1' })
  })

  it('uses the linked bot when there is one, so events scope to it', async () => {
    createVoiceLead.mockResolvedValue({ leadId: 'new-voice', agentId: 'agent-1' })

    await expect(resolveCallLead({ ...CALL, linkedBotId: 'bot-7' })).resolves.toMatchObject({
      botId: 'bot-7',
    })
  })
})

describe('recording the conversation', () => {
  const identity = { leadRef: { source: 'voice' as const, agentId: 'a', leadId: 'lead-1' }, leadId: 'lead-1', botId: 'bot-1', isNewLead: true }

  // message_in / message_out rather than a voice-specific event type: anything
  // that already reads a lead's history sees a phone call as part of the
  // conversation without being taught about voice.
  it('writes a caller turn as message_in on the voice channel', async () => {
    await recordCallTurn({ identity, clientId: 'client-1', role: 'caller', text: 'Is 4B still available?' })

    expect(appendLeadEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: 'lead-1',
        botId: 'bot-1',
        type: 'message_in',
        channel: 'voice',
        body: 'Is 4B still available?',
      })
    )
  })

  it('writes an agent turn as message_out', async () => {
    await recordCallTurn({ identity, clientId: 'client-1', role: 'agent', text: 'Yes, it is.' })

    expect(appendLeadEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'message_out', channel: 'voice' })
    )
  })

  it('skips empty and whitespace-only turns', async () => {
    await recordCallTurn({ identity, clientId: 'client-1', role: 'caller', text: '   ' })
    await recordCallTurn({ identity, clientId: 'client-1', role: 'caller', text: '' })

    expect(appendLeadEvent).not.toHaveBeenCalled()
  })

  it('trims a turn before writing it', async () => {
    await recordCallTurn({ identity, clientId: 'client-1', role: 'caller', text: '  hello  ' })

    expect(appendLeadEvent).toHaveBeenCalledWith(expect.objectContaining({ body: 'hello' }))
  })

  it('marks a first-time caller as lead_captured', async () => {
    await recordCallLifecycle({ identity, clientId: 'client-1', body: 'Inbound call' })

    expect(appendLeadEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'lead_captured' }))
  })

  it('marks a returning caller as state_change, not a new capture', async () => {
    await recordCallLifecycle({
      identity: { ...identity, isNewLead: false },
      clientId: 'client-1',
      body: 'Inbound call (returning contact)',
    })

    expect(appendLeadEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'state_change' }))
  })

  // Without this a transcript shows the agent quoting a price with no trace of
  // where it came from, which is the first question asked when it is wrong.
  it('records the knowledge-base lookup behind an answer', async () => {
    await recordCallToolUse({ identity, clientId: 'client-1', query: 'price of 4B', resultCount: 3 })

    expect(appendLeadEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool_call',
        channel: 'voice',
        body: 'search_knowledge_base(price of 4B) -> 3 result(s)',
      })
    )
  })
})

describe('recordCallHandoff', () => {
  const identity = {
    leadRef: { source: 'voice' as const, agentId: 'a', leadId: 'lead-1' },
    leadId: 'lead-1',
    botId: 'bot-1',
    isNewLead: false,
  }

  // The same path a journey handoff takes. A client should not have to learn
  // two notification systems depending on which channel the person asking for
  // help happened to use.
  it('records the handoff and raises the existing alert', async () => {
    const result = await recordCallHandoff({ identity, clientId: 'client-1', reason: 'wants to negotiate' })

    expect(appendLeadEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'handoff', channel: 'voice', body: 'wants to negotiate' })
    )
    expect(sendHandoffAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        leadRef: identity.leadRef,
        clientId: 'client-1',
        reason: 'wants to negotiate',
        trigger: 'hand_to_agent',
      })
    )
    expect(result.notified).toBe(true)
  })

  // A handoff whose alert failed is still a handoff. The event is written
  // first so the timeline shows a human was asked for even when nobody could
  // be told -- precisely the case an operator needs to be able to find.
  it('still records the event when nobody could be notified', async () => {
    sendHandoffAlert.mockResolvedValue({ notified: false, skipReason: 'no_notification_number' })

    const result = await recordCallHandoff({ identity, clientId: 'client-1', reason: 'complaint' })

    expect(appendLeadEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'handoff' }))
    expect(result).toMatchObject({ notified: false, skipReason: 'no_notification_number' })
  })

  it('reports not-notified rather than throwing when the alert path throws', async () => {
    sendHandoffAlert.mockRejectedValue(new Error('SES down'))

    await expect(
      recordCallHandoff({ identity, clientId: 'client-1', reason: 'x' })
    ).resolves.toMatchObject({ notified: false, skipReason: 'send_failed' })
  })

  it('still attempts the alert when writing the event fails', async () => {
    appendLeadEvent.mockRejectedValue(new Error('DynamoDB down'))

    const result = await recordCallHandoff({ identity, clientId: 'client-1', reason: 'x' })

    expect(sendHandoffAlert).toHaveBeenCalled()
    expect(result.notified).toBe(true)
  })
})
