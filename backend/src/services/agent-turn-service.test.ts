import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Agent, JourneyLead } from '../types/index.js'

const getBotById = vi.fn()
const appendLeadEvent = vi.fn()
const getPendingReply = vi.fn()
const isOptedOut = vi.fn()
const resolveAgentPersona = vi.fn()
const generateChatCompletion = vi.fn()
const retrieveAgentContext = vi.fn()
const sendWhatsAppMessageToLead = vi.fn()

vi.mock('../repositories/bot-repository.js', () => ({ getBotById }))
vi.mock('../repositories/lead-event-repository.js', () => ({ appendLeadEvent }))
vi.mock('../repositories/journey-pending-reply-repository.js', () => ({ getPendingReply }))
vi.mock('../repositories/whatsapp-inbound-activity-repository.js', () => ({ isOptedOut }))
vi.mock('./agent-persona-service.js', () => ({ resolveAgentPersona }))
vi.mock('./openai-service.js', () => ({ generateChatCompletion }))
vi.mock('./rag-service.js', () => ({ retrieveAgentContext }))
vi.mock('./whatsapp-service.js', () => ({ sendWhatsAppMessageToLead }))

const { runAgentTurn } = await import('./agent-turn-service.js')

const agent: Agent = {
  agentId: 'agent-1',
  clientId: 'client-1',
  name: 'Wonderise Assistance',
  channels: { web: { resourceId: 'bot-1' } },
  createdAt: '2026-08-16T00:00:00.000Z',
  updatedAt: '2026-08-16T00:00:00.000Z',
}

const agentWithVoice: Agent = {
  ...agent,
  channels: { web: { resourceId: 'bot-1' }, voice: { resourceId: 'voice-1' } },
}

const lead: JourneyLead = {
  leadId: 'lead-1',
  clientId: 'client-1',
  source: 'chat',
  phone: '919000000001',
}

function turnInput(overrides: Partial<Parameters<typeof runAgentTurn>[0]> = {}) {
  return { agent, botId: 'bot-1', clientId: 'client-1', lead, message: 'what is the price?', ...overrides }
}

beforeEach(() => {
  getBotById.mockReset().mockResolvedValue({ botId: 'bot-1', name: 'Wonderise', clientId: 'client-1' })
  appendLeadEvent.mockReset().mockResolvedValue(undefined)
  getPendingReply.mockReset().mockResolvedValue(null)
  isOptedOut.mockReset().mockResolvedValue(false)
  resolveAgentPersona.mockReset().mockResolvedValue({ systemPrompt: 'PERSONA', source: 'published_bundle' })
  retrieveAgentContext.mockReset().mockResolvedValue(['3 BHK from 90L'])
  generateChatCompletion.mockReset().mockResolvedValue('A 3 BHK starts around 90 lakhs.')
  sendWhatsAppMessageToLead.mockReset().mockResolvedValue({ success: true, messageId: 'wamid-1' })
})

describe('who sends (D12)', () => {
  it('sends directly when no journey is parked', async () => {
    const outcome = await runAgentTurn(turnInput())

    expect(outcome).toEqual({ status: 'sent', text: 'A 3 BHK starts around 90 lakhs.' })
    expect(sendWhatsAppMessageToLead).toHaveBeenCalledWith('client-1', '919000000001', 'A 3 BHK starts around 90 lakhs.')
  })

  // The load-bearing case. Sending here AND letting the woken state machine send
  // is the double-send the whole design exists to prevent.
  it('composes but does NOT send when a journey is parked', async () => {
    getPendingReply.mockResolvedValue({ leadId: 'lead-1', taskToken: 'token' })

    const outcome = await runAgentTurn(turnInput())

    expect(outcome).toEqual({ status: 'composed_for_journey', text: 'A 3 BHK starts around 90 lakhs.' })
    expect(sendWhatsAppMessageToLead).not.toHaveBeenCalled()
  })

  it('records message_out only when it actually sent', async () => {
    getPendingReply.mockResolvedValue({ leadId: 'lead-1', taskToken: 'token' })

    await runAgentTurn(turnInput())

    expect(appendLeadEvent).not.toHaveBeenCalled()
  })

  it('records the wamid on a direct send', async () => {
    await runAgentTurn(turnInput())

    expect(appendLeadEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'message_out', mode: 'free_text', wamid: 'wamid-1' })
    )
  })

  it('records the failure detail when the send fails', async () => {
    sendWhatsAppMessageToLead.mockResolvedValue({ success: false, error: 'error 131047' })

    await runAgentTurn(turnInput())

    expect(appendLeadEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'message_out', errorDetail: 'error 131047' })
    )
  })
})

describe('guards', () => {
  // Checked before the OpenAI call, so a lead who asked to stop costs nothing
  // and, more importantly, is not answered.
  it('never answers an opted-out lead, and never pays for a completion', async () => {
    isOptedOut.mockResolvedValue(true)

    const outcome = await runAgentTurn(turnInput())

    expect(outcome).toEqual({ status: 'skipped', reason: 'opted_out' })
    expect(generateChatCompletion).not.toHaveBeenCalled()
    expect(sendWhatsAppMessageToLead).not.toHaveBeenCalled()
  })

  it('skips an empty message', async () => {
    const outcome = await runAgentTurn(turnInput({ message: '   ' }))

    expect(outcome).toEqual({ status: 'skipped', reason: 'empty_message' })
    expect(generateChatCompletion).not.toHaveBeenCalled()
  })

  it('skips when the lead has no phone number', async () => {
    const outcome = await runAgentTurn(turnInput({ lead: { ...lead, phone: undefined } }))

    expect(outcome).toEqual({ status: 'skipped', reason: 'no_phone' })
  })

  it('skips when the bot is missing', async () => {
    getBotById.mockResolvedValue(null)

    const outcome = await runAgentTurn(turnInput())

    expect(outcome).toEqual({ status: 'skipped', reason: 'bot_missing' })
  })
})

describe('retrieval scope (D4)', () => {
  it('queries the web namespace for a web-only Agent', async () => {
    await runAgentTurn(turnInput())

    expect(retrieveAgentContext).toHaveBeenCalledWith(['bot-1'], 'what is the price?')
  })

  // The union. A client who put pricing in their voice KB must not be told "I
  // don't have that information" on WhatsApp by what the dashboard calls one Agent.
  it('queries web AND voice namespaces when both are bound', async () => {
    await runAgentTurn(turnInput({ agent: agentWithVoice }))

    expect(retrieveAgentContext).toHaveBeenCalledWith(['bot-1', 'voice-1'], 'what is the price?')
  })
})

describe('composition', () => {
  it('passes the resolved persona and the retrieved context to the model', async () => {
    await runAgentTurn(turnInput())

    const params = generateChatCompletion.mock.calls[0]?.[0]
    expect(params.systemPrompt).toContain('PERSONA')
    expect(params.systemPrompt).toContain('3 BHK from 90L')
    expect(params.userPrompt).toBe('what is the price?')
  })

  // Left implicit, a model treats "no context" as "answer from what you know",
  // which is the invention the guard exists to stop.
  it('marks empty retrieval explicitly rather than omitting the section', async () => {
    retrieveAgentContext.mockResolvedValue([])

    await runAgentTurn(turnInput())

    expect(generateChatCompletion.mock.calls[0]?.[0].systemPrompt).toContain('(no relevant information found)')
  })

  // This runs inside a webhook Meta disables when it keeps being slow, so a hung
  // completion is not a slow reply, it is a route to losing the integration.
  it('falls back to a plain message when the model does not answer in time', async () => {
    vi.useFakeTimers()
    generateChatCompletion.mockImplementation(() => new Promise(() => {}))

    const pending = runAgentTurn(turnInput())
    await vi.advanceTimersByTimeAsync(13_000)
    const outcome = await pending

    expect(outcome.status).toBe('sent')
    expect(sendWhatsAppMessageToLead.mock.calls[0]?.[2]).toContain('colleague')
    vi.useRealTimers()
  })
})

// The kill switch is the rollback plan for the whole "agent can answer" epic.
// If it does not actually stop composition, there is no way to stop a
// misbehaving agent short of a deploy while it talks to real leads.
describe('scriptedOnly', () => {
  const scriptedAgent: Agent = { ...agent, scriptedOnly: true }

  it('does not compose and does not send', async () => {
    const outcome = await runAgentTurn(turnInput({ agent: scriptedAgent }))

    expect(outcome).toEqual({ status: 'skipped', reason: 'scripted_only' })
    expect(generateChatCompletion).not.toHaveBeenCalled()
    expect(sendWhatsAppMessageToLead).not.toHaveBeenCalled()
  })

  // Before the OpenAI call AND before the retrieval, because a switched-off
  // agent should not be spending either.
  it('short-circuits before retrieval, not after', async () => {
    await runAgentTurn(turnInput({ agent: scriptedAgent }))

    expect(retrieveAgentContext).not.toHaveBeenCalled()
    expect(getBotById).not.toHaveBeenCalled()
  })

  // "Scripted", not "silent". The caller only sets composedReply on
  // 'composed_for_journey', so a skip leaves it undefined and the parked
  // journey still resumes and sends its own authored line.
  it('leaves a parked journey to send its scripted line', async () => {
    getPendingReply.mockResolvedValueOnce({ leadId: 'lead-1', taskToken: 'tok' })

    const outcome = await runAgentTurn(turnInput({ agent: scriptedAgent }))

    expect(outcome.status).toBe('skipped')
    expect(outcome).not.toHaveProperty('text')
  })

  it('composes as normal when the flag is absent', async () => {
    const outcome = await runAgentTurn(turnInput({ agent }))

    expect(outcome.status).not.toBe('skipped')
    expect(generateChatCompletion).toHaveBeenCalled()
  })

  // Explicit false has to behave like absent, or turning the switch back off
  // would leave the Agent mute.
  it('composes again once the flag is turned back off', async () => {
    const outcome = await runAgentTurn(turnInput({ agent: { ...agent, scriptedOnly: false } }))

    expect(outcome.status).not.toBe('skipped')
    expect(generateChatCompletion).toHaveBeenCalled()
  })
})
