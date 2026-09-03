import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Lead } from '../types/index.js'

const getLeadsForClient = vi.fn()
const getPendingReply = vi.fn()

const getVoiceLeadsByClientId = vi.fn()
const readJourneyLead = vi.fn()

vi.mock('./lead-service.js', () => ({ getLeadsForClient }))
vi.mock('../repositories/journey-pending-reply-repository.js', () => ({ getPendingReply }))
vi.mock('../repositories/voice-lead-repository.js', () => ({ getVoiceLeadsByClientId }))
vi.mock('./lead-resolution-service.js', () => ({ readJourneyLead }))

const { matchLeadForInboundMessage } = await import('./inbound-lead-match-service.js')

function lead(leadId: string, createdAt: string, phone: string, botId = 'bot-1'): Lead {
  return {
    leadId,
    botId,
    clientId: 'client-1',
    name: leadId,
    phone,
    email: `${leadId}@example.com`,
    chatTranscript: '',
    sourceUrl: 'https://example.com',
    createdAt,
  }
}

beforeEach(() => {
  getLeadsForClient.mockReset().mockResolvedValue([])
  getVoiceLeadsByClientId.mockReset().mockResolvedValue([])
  getPendingReply.mockReset().mockResolvedValue(null)
  // The chosen candidate's record is read back through the source-agnostic
  // path; the identity of the row matters here, not its contents.
  readJourneyLead.mockReset().mockImplementation(async (ref: { leadId: string }) => ({
    leadId: ref.leadId,
    clientId: 'client-1',
    source: 'chat',
  }))
})

describe('matchLeadForInboundMessage', () => {
  it('returns null when no lead has that phone', async () => {
    getLeadsForClient.mockResolvedValue([lead('a', '2026-01-01T00:00:00Z', '911111111111')])

    expect(await matchLeadForInboundMessage('client-1', '919000000001')).toBeNull()
  })

  it('matches across phone formats, since one person is one person', async () => {
    getLeadsForClient.mockResolvedValue([lead('a', '2026-01-01T00:00:00Z', '9000000001')])

    const match = await matchLeadForInboundMessage('client-1', '919000000001')

    expect(match?.leadId).toBe('a')
    expect(match?.reason).toBe('only_match')
  })

  // The production bug, 2026-08-16: five leads shared a phone across five bots
  // and `.find()` took a July lead on an unrelated bot, so the journey parked
  // on that morning's lead never resumed.
  it('prefers the most recent lead when several share the phone', async () => {
    getLeadsForClient.mockResolvedValue([
      lead('july', '2026-07-07T14:17:59Z', '9000000001', 'bot-old'),
      lead('august', '2026-08-16T12:09:43Z', '919000000001', 'bot-new'),
      lead('older', '2026-07-11T17:55:52Z', '9000000001', 'bot-older'),
    ])

    const match = await matchLeadForInboundMessage('client-1', '919000000001')

    expect(match?.leadId).toBe('august')
    expect(match?.reason).toBe('most_recent')
    expect(match?.candidateCount).toBe(3)
  })

  // A parked execution is literally waiting for this message, so it outranks
  // recency -- otherwise a newer stray lead would strand a live conversation.
  it('prefers a lead with a parked journey over a newer one without', async () => {
    getLeadsForClient.mockResolvedValue([
      lead('parked', '2026-07-07T14:17:59Z', '9000000001'),
      lead('newer', '2026-08-16T12:09:43Z', '9000000001'),
    ])
    getPendingReply.mockImplementation(async (leadId: string) =>
      leadId === 'parked' ? { leadId, taskToken: 't' } : null
    )

    const match = await matchLeadForInboundMessage('client-1', '9000000001')

    expect(match?.leadId).toBe('parked')
    expect(match?.reason).toBe('pending_reply')
  })

  it('does not probe pending replies when there is only one candidate', async () => {
    getLeadsForClient.mockResolvedValue([lead('only', '2026-08-16T12:09:43Z', '9000000001')])

    await matchLeadForInboundMessage('client-1', '9000000001')

    expect(getPendingReply).not.toHaveBeenCalled()
  })

  // Bounded reads: a client with a long history on one number must not turn
  // every inbound message into an unbounded fan-out of point reads.
  it('caps how many candidates get a pending-reply lookup', async () => {
    getLeadsForClient.mockResolvedValue(
      Array.from({ length: 25 }, (_, i) =>
        lead(`l${i}`, `2026-08-${String(i + 1).padStart(2, '0')}T00:00:00Z`, '9000000001')
      )
    )

    await matchLeadForInboundMessage('client-1', '9000000001')

    expect(getPendingReply.mock.calls.length).toBeLessThanOrEqual(10)
  })

  // The reverse direction of the voice unification, and the reason this
  // service was pointed at the shared resolver. Someone who CALLED first has
  // no chat lead at all: a chat-only search made them a brand-new stranger and
  // started a second history for the same person on their first WhatsApp.
  it('matches a lead whose only prior contact was a phone call', async () => {
    getVoiceLeadsByClientId.mockResolvedValue([
      { leadId: 'called-first', agentId: 'agent-1', clientId: 'client-1', phone: '9000000001', createdAt: '2026-09-01T00:00:00Z' },
    ])
    readJourneyLead.mockResolvedValue({ leadId: 'called-first', clientId: 'client-1', source: 'voice' })

    const match = await matchLeadForInboundMessage('client-1', '919000000001')

    expect(match?.leadId).toBe('called-first')
    expect(match?.leadRef).toEqual({ source: 'voice', agentId: 'agent-1', leadId: 'called-first' })
  })

  // A voice lead has no linked chatbot, and lead_events.botId is required.
  it('scopes events to the voice agent when the matched lead has no bot', async () => {
    getVoiceLeadsByClientId.mockResolvedValue([
      { leadId: 'v1', agentId: 'agent-9', clientId: 'client-1', phone: '9000000001', createdAt: '2026-09-01T00:00:00Z' },
    ])
    readJourneyLead.mockResolvedValue({ leadId: 'v1', clientId: 'client-1', source: 'voice' })

    await expect(matchLeadForInboundMessage('client-1', '9000000001')).resolves.toMatchObject({
      botId: 'agent-9',
    })
  })

  // A row that vanished between the list and the read is a race, not a match.
  // Returning it would have the caller act on a ghost lead; returning null has
  // them create a fresh one, which is recoverable.
  it('returns null when the matched record cannot be read back', async () => {
    getLeadsForClient.mockResolvedValue([lead('a', '2026-01-01T00:00:00Z', '9000000001')])
    readJourneyLead.mockResolvedValue(null)

    await expect(matchLeadForInboundMessage('client-1', '9000000001')).resolves.toBeNull()
  })
})
