import { beforeEach, describe, expect, it, vi } from 'vitest'

const getLeadsForClient = vi.fn()
vi.mock('./lead-service.js', () => ({ getLeadsForClient }))

const getVoiceLeadsByClientId = vi.fn()
vi.mock('../repositories/voice-lead-repository.js', () => ({ getVoiceLeadsByClientId }))

const getPendingReply = vi.fn()
vi.mock('../repositories/journey-pending-reply-repository.js', () => ({ getPendingReply }))

const { findLeadByPhone } = await import('./lead-identity-service.js')

function chatLead(leadId: string, phone: string, createdAt: string) {
  return { leadId, botId: 'bot-1', clientId: 'client-1', phone, name: 'Asha', createdAt }
}

function voiceLead(leadId: string, phone: string, createdAt: string) {
  return { leadId, agentId: 'agent-1', clientId: 'client-1', phone, createdAt }
}

beforeEach(() => {
  getLeadsForClient.mockReset().mockResolvedValue([])
  getVoiceLeadsByClientId.mockReset().mockResolvedValue([])
  getPendingReply.mockReset().mockResolvedValue(null)
})

describe('findLeadByPhone', () => {
  it('returns null when nobody matches', async () => {
    getLeadsForClient.mockResolvedValue([chatLead('c1', '+919876543210', '2026-09-01T00:00:00.000Z')])

    await expect(findLeadByPhone('client-1', '+919999999999')).resolves.toBeNull()
  })

  it('returns null for a withheld number without querying anything', async () => {
    await expect(findLeadByPhone('client-1', '')).resolves.toBeNull()
    expect(getLeadsForClient).not.toHaveBeenCalled()
  })

  it('matches a chat lead, so a caller who enquired on the website is recognised', async () => {
    getLeadsForClient.mockResolvedValue([chatLead('c1', '+919876543210', '2026-09-01T00:00:00.000Z')])

    const match = await findLeadByPhone('client-1', '+919876543210')

    expect(match).toMatchObject({
      leadId: 'c1',
      leadRef: { source: 'chat', botId: 'bot-1', leadId: 'c1' },
      reason: 'only_match',
      candidateCount: 1,
    })
  })

  // The reverse direction, and the reason this service exists separately from
  // inbound-lead-match-service: a caller who first reached us BY PHONE has no
  // chat lead at all, so a chat-only search would make them a stranger forever.
  it('matches a voice lead, so a repeat caller is not a new person every time', async () => {
    getVoiceLeadsByClientId.mockResolvedValue([voiceLead('v1', '+919876543210', '2026-09-01T00:00:00.000Z')])

    const match = await findLeadByPhone('client-1', '+919876543210')

    expect(match).toMatchObject({
      leadId: 'v1',
      leadRef: { source: 'voice', agentId: 'agent-1', leadId: 'v1' },
      reason: 'only_match',
    })
  })

  it('matches across differing phone formats', async () => {
    // Caller ID arrives as +91..., a web form may have captured 98765 43210.
    getLeadsForClient.mockResolvedValue([chatLead('c1', '98765 43210', '2026-09-01T00:00:00.000Z')])

    await expect(findLeadByPhone('client-1', '+919876543210')).resolves.toMatchObject({ leadId: 'c1' })
  })

  it('prefers a lead with a journey parked on it over a more recent one', async () => {
    // The rule that was paid for in production: an execution waiting on a reply
    // is a far stronger signal than recency, and picking wrong strands the
    // journey until it times out silently.
    getLeadsForClient.mockResolvedValue([
      chatLead('older-with-journey', '+919876543210', '2026-08-01T00:00:00.000Z'),
      chatLead('newer', '+919876543210', '2026-09-01T00:00:00.000Z'),
    ])
    getPendingReply.mockImplementation(async (leadId: string) =>
      leadId === 'older-with-journey' ? { leadId, token: 'x' } : null
    )

    const match = await findLeadByPhone('client-1', '+919876543210')

    expect(match).toMatchObject({ leadId: 'older-with-journey', reason: 'pending_reply', candidateCount: 2 })
  })

  it('falls back to the most recent contact when no journey is parked', async () => {
    getLeadsForClient.mockResolvedValue([
      chatLead('older', '+919876543210', '2026-08-01T00:00:00.000Z'),
      chatLead('newer', '+919876543210', '2026-09-01T00:00:00.000Z'),
    ])

    const match = await findLeadByPhone('client-1', '+919876543210')

    expect(match).toMatchObject({ leadId: 'newer', reason: 'most_recent', candidateCount: 2 })
  })

  it('picks the most recent across sources, not whichever source was queried first', async () => {
    // Querying chat first and returning early would always prefer a stale chat
    // lead over yesterday's phone call.
    getLeadsForClient.mockResolvedValue([chatLead('old-chat', '+919876543210', '2026-07-01T00:00:00.000Z')])
    getVoiceLeadsByClientId.mockResolvedValue([voiceLead('recent-call', '+919876543210', '2026-09-02T00:00:00.000Z')])

    const match = await findLeadByPhone('client-1', '+919876543210')

    expect(match).toMatchObject({ leadId: 'recent-call', leadRef: { source: 'voice' } })
  })

  // Failing to recognise a returning caller costs a duplicate lead. Throwing
  // costs the call. The duplicate is recoverable.
  it('degrades to the surviving source when one lookup fails', async () => {
    getLeadsForClient.mockRejectedValue(new Error('DynamoDB unavailable'))
    getVoiceLeadsByClientId.mockResolvedValue([voiceLead('v1', '+919876543210', '2026-09-01T00:00:00.000Z')])

    await expect(findLeadByPhone('client-1', '+919876543210')).resolves.toMatchObject({ leadId: 'v1' })
  })

  it('returns null rather than throwing when both lookups fail', async () => {
    getLeadsForClient.mockRejectedValue(new Error('down'))
    getVoiceLeadsByClientId.mockRejectedValue(new Error('down'))

    await expect(findLeadByPhone('client-1', '+919876543210')).resolves.toBeNull()
  })

  it('ignores leads with no phone number recorded', async () => {
    getLeadsForClient.mockResolvedValue([chatLead('c1', '', '2026-09-01T00:00:00.000Z')])

    await expect(findLeadByPhone('client-1', '+919876543210')).resolves.toBeNull()
  })
})
