import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUnifiedInbox = vi.fn()
const getUnifiedLeadDetail = vi.fn()
vi.mock('./lead-inbox-service.js', () => ({ getUnifiedInbox, getUnifiedLeadDetail }))

const getClientBots = vi.fn()
const getBotConfig = vi.fn()
vi.mock('./bot-service.js', () => ({ getClientBots, getBotConfig }))

vi.mock('./form-service.js', () => ({ getClientForms: vi.fn(), getFormConfig: vi.fn() }))
vi.mock('./voice-service.js', () => ({ getVoiceAgents: vi.fn(), getVoiceAgentById: vi.fn() }))

const { PublicResourceNotFoundError, decodeLeadId, encodeLeadId, getBot, getLead, listBots, listLeads } =
  await import('./public-api-service.js')

const CHAT_REF = { source: 'chat' as const, botId: 'bot-1', leadId: 'lead-1' }
const UNIFIED = {
  leadId: 'lead-1',
  clientId: 'client-1',
  source: 'chat' as const,
  name: 'Asha',
  phone: '+919876543210',
  budgetRange: '1-2 Cr',
  leadRef: CHAT_REF,
  createdAt: '2026-10-01T00:00:00.000Z',
  state: null,
  urgencyTier: 'untouched' as const,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('lead ids', () => {
  it.each([
    [CHAT_REF],
    [{ source: 'form' as const, formId: 'form-1', leadId: 'l:2' }],
    [{ source: 'meta' as const, pageId: '1234567890', leadId: '987' }],
    [{ source: 'voice' as const, agentId: 'agent-1', leadId: 'l4' }],
  ])('round-trips %j', (ref) => {
    expect(decodeLeadId(encodeLeadId(ref))).toEqual(ref)
  })

  it.each([
    ['lead-1', 'a bare internal id'],
    ['lead_not-base64-json', 'garbage after the prefix'],
    [`lead_${Buffer.from(JSON.stringify(['sms', 'x', 'y'])).toString('base64url')}`, 'an unknown source'],
    [`lead_${Buffer.from(JSON.stringify(['chat', 'bot-1'])).toString('base64url')}`, 'a missing part'],
  ])('rejects %s (%s)', (id) => {
    expect(decodeLeadId(id)).toBeNull()
  })
})

describe('listLeads', () => {
  it('always asks for a page, even when the caller sent no limit', async () => {
    getUnifiedInbox.mockResolvedValue({ leads: [], total: 0 })

    await listLeads('client-1', {})

    expect(getUnifiedInbox).toHaveBeenCalledWith('client-1', { limit: 50 })
  })

  it('publishes an allowlisted shape with no internal fields', async () => {
    getUnifiedInbox.mockResolvedValue({ leads: [UNIFIED], total: 1, nextCursor: 'abc' })

    const page = await listLeads('client-1', { limit: 10 })

    expect(page).toEqual({
      data: [
        {
          id: encodeLeadId(CHAT_REF),
          source: 'chat',
          sourceId: 'bot-1',
          name: 'Asha',
          phone: '+919876543210',
          email: null,
          sourceUrl: null,
          attributes: { budgetRange: '1-2 Cr' },
          status: 'new',
          outcome: null,
          leadScore: null,
          archived: false,
          createdAt: UNIFIED.createdAt,
        },
      ],
      nextCursor: 'abc',
      total: 1,
    })
  })

  it('says so when a source could not be read', async () => {
    getUnifiedInbox.mockResolvedValue({ leads: [], total: 0, degradedSources: ['meta'] })

    expect((await listLeads('client-1', {})).incompleteSources).toEqual(['meta'])
  })
})

describe('getLead', () => {
  it('decodes the id and returns the transcript and submitted answers', async () => {
    getUnifiedLeadDetail.mockResolvedValue({ ...UNIFIED, chatTranscript: 'hi', customFields: { city: 'Pune' } })

    const lead = await getLead('client-1', encodeLeadId(CHAT_REF))

    expect(getUnifiedLeadDetail).toHaveBeenCalledWith(CHAT_REF, 'client-1')
    expect(lead.transcript).toBe('hi')
    expect(lead.attributes).toEqual({ budgetRange: '1-2 Cr', city: 'Pune' })
  })

  it('treats an undecodable id as not found without reading anything', async () => {
    await expect(getLead('client-1', 'nonsense')).rejects.toBeInstanceOf(PublicResourceNotFoundError)
    expect(getUnifiedLeadDetail).not.toHaveBeenCalled()
  })

  it('translates the service not-found into the typed error', async () => {
    getUnifiedLeadDetail.mockRejectedValue(new Error('Lead not found'))

    await expect(getLead('client-1', encodeLeadId(CHAT_REF))).rejects.toBeInstanceOf(PublicResourceNotFoundError)
  })
})

describe('bots', () => {
  const BOT = {
    botId: 'bot-1',
    clientId: 'client-1',
    name: 'Site bot',
    greetingMessage: 'Hi',
    brandColor: '#000',
    leadTriggerAfterMessages: 3,
    leadFormFields: [],
    widgetTrigger: 'immediate' as const,
    indexingJob: { jobId: 'job-1' },
    crawlError: 'boom',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  }

  it('does not publish clientId or indexing internals', async () => {
    getClientBots.mockResolvedValue([BOT])

    const [bot] = await listBots('client-1')

    expect(Object.keys(bot).sort()).toEqual(
      [
        'botId',
        'brandColor',
        'createdAt',
        'greetingMessage',
        'leadFormFields',
        'leadTriggerAfterMessages',
        'name',
        'supportEmail',
        'updatedAt',
        'websiteUrl',
        'widgetTrigger',
      ].sort()
    )
  })

  it('does not swallow a real failure as a 404', async () => {
    getBotConfig.mockRejectedValue(new Error('Failed to get bot: throttled'))

    await expect(getBot('client-1', 'bot-1')).rejects.not.toBeInstanceOf(PublicResourceNotFoundError)
  })
})
