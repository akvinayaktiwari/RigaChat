import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Agent, ClientRecord } from '../types/index.js'

const getAgentForResource = vi.fn()
const claimAgentBinding = vi.fn()
const removeAgentBinding = vi.fn()
const getAgentsByClientId = vi.fn()
const getAgentById = vi.fn()
const updateAgent = vi.fn()
const getBotById = vi.fn()
const getClientById = vi.fn()

vi.mock('../repositories/agent-binding-lookup-repository.js', () => ({
  getAgentForResource,
  claimAgentBinding,
  removeAgentBinding,
}))
vi.mock('../repositories/agent-repository.js', () => ({
  createAgent: vi.fn(),
  deleteAgent: vi.fn(),
  getAgentById,
  getAgentsByClientId,
  updateAgent,
}))
vi.mock('../repositories/bot-repository.js', () => ({ getBotById }))
vi.mock('../repositories/client-repository.js', () => ({ getClientById }))
vi.mock('../repositories/voice-repository.js', () => ({ getVoiceAgentById: vi.fn() }))

const { getBotWhatsAppStatus, enableWhatsAppForBot } = await import('./agent-service.js')

const PHONE_ID = '1285689897954143'
const BOT_ID = 'bot-1'

function agentWith(channels: Agent['channels']): Agent {
  return {
    agentId: 'agent-1',
    clientId: 'client-1',
    name: 'Wonderise Assistance',
    channels,
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
  }
}

function clientWith(connected: boolean): ClientRecord {
  return {
    clientId: 'client-1',
    email: 'a@example.com',
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
    ...(connected
      ? {
          metaDirectWhatsAppConnection: {
            provider: 'meta_direct' as const,
            connected: true,
            wabaId: 'waba-1',
            phoneNumberId: PHONE_ID,
            businessAccountId: 'waba-1',
            accessTokenEncrypted: 'cipher',
            displayPhoneNumber: '+91 70070 28001',
            notificationNumber: '919000000001',
            connectedAt: '2026-08-15T00:00:00.000Z',
          },
        }
      : {}),
  } as ClientRecord
}

beforeEach(() => {
  getAgentForResource.mockReset()
  claimAgentBinding.mockReset().mockResolvedValue(undefined)
  removeAgentBinding.mockReset().mockResolvedValue(undefined)
  getAgentsByClientId.mockReset().mockResolvedValue([])
  getAgentById.mockReset()
  updateAgent.mockReset()
  getBotById.mockReset().mockResolvedValue({ botId: BOT_ID, clientId: 'client-1' })
  getClientById.mockReset().mockResolvedValue(clientWith(true))
})

describe('getBotWhatsAppStatus', () => {
  // The toggle is hidden entirely rather than shown broken. A control that
  // cannot work is worse than no control.
  it('reports no connection when the client has not connected WhatsApp', async () => {
    getClientById.mockResolvedValue(clientWith(false))

    const status = await getBotWhatsAppStatus(BOT_ID, 'client-1')

    expect(status).toEqual({ connectionAvailable: false, enabled: false })
  })

  it('reports enabled when this bot Agent holds the number', async () => {
    const agent = agentWith({ web: { resourceId: BOT_ID }, whatsapp: { resourceId: PHONE_ID } })
    getAgentForResource.mockImplementation(async (id: string) =>
      id === BOT_ID || id === PHONE_ID ? { resourceId: id, agentId: 'agent-1', clientId: 'client-1' } : null
    )
    getAgentsByClientId.mockResolvedValue([agent])

    const status = await getBotWhatsAppStatus(BOT_ID, 'client-1')

    expect(status.enabled).toBe(true)
    // The DISPLAY number, never phoneNumberId: Meta's internal resource id
    // cannot form a wa.me link.
    expect(status.displayPhoneNumber).toBe('+91 70070 28001')
    expect(status.blockedReason).toBeUndefined()
  })

  it('reports off, not blocked, when nothing holds the number yet', async () => {
    const agent = agentWith({ web: { resourceId: BOT_ID } })
    getAgentForResource.mockImplementation(async (id: string) =>
      id === BOT_ID ? { resourceId: id, agentId: 'agent-1', clientId: 'client-1' } : null
    )
    getAgentsByClientId.mockResolvedValue([agent])

    const status = await getBotWhatsAppStatus(BOT_ID, 'client-1')

    expect(status.enabled).toBe(false)
    expect(status.blockedReason).toBeUndefined()
  })

  // One number, one Agent. Telling the client WHY beats letting them click a
  // toggle that will fail on the atomic claim.
  it('explains when another Agent already holds the number', async () => {
    const agent = agentWith({ web: { resourceId: BOT_ID } })
    getAgentForResource.mockImplementation(async (id: string) => {
      if (id === BOT_ID) return { resourceId: id, agentId: 'agent-1', clientId: 'client-1' }
      if (id === PHONE_ID) return { resourceId: id, agentId: 'agent-OTHER', clientId: 'client-1' }
      return null
    })
    getAgentsByClientId.mockResolvedValue([agent])

    const status = await getBotWhatsAppStatus(BOT_ID, 'client-1')

    expect(status.enabled).toBe(false)
    expect(status.blockedReason).toContain('another Agent')
  })

  it('explains when the bot belongs to no Agent', async () => {
    getAgentForResource.mockResolvedValue(null)

    const status = await getBotWhatsAppStatus(BOT_ID, 'client-1')

    expect(status.enabled).toBe(false)
    expect(status.blockedReason).toContain('not part of an Agent')
  })

  // Ownership, not just existence. Another tenant's bot must 404 the same way a
  // missing one does.
  it("throws when the bot is not this client's", async () => {
    getBotById.mockResolvedValue(null)

    await expect(getBotWhatsAppStatus(BOT_ID, 'client-1')).rejects.toThrow('Bot not found')
  })
})

describe('enableWhatsAppForBot', () => {
  it('refuses when the bot belongs to no Agent', async () => {
    getAgentForResource.mockResolvedValue(null)

    await expect(enableWhatsAppForBot(BOT_ID, 'client-1')).rejects.toThrow('not part of an Agent')
    expect(claimAgentBinding).not.toHaveBeenCalled()
  })

  // A web binding is required: an inbound lead needs a botId to partition the
  // row, scope Pinecone (rule 5) and resolve journey ignition.
  it('refuses an Agent with no chatbot', async () => {
    const agent = agentWith({ voice: { resourceId: 'voice-1' } })
    getAgentForResource.mockResolvedValue({ resourceId: BOT_ID, agentId: 'agent-1', clientId: 'client-1' })
    getAgentsByClientId.mockResolvedValue([agent])
    getAgentById.mockResolvedValue(agent)

    await expect(enableWhatsAppForBot(BOT_ID, 'client-1')).rejects.toThrow('no chatbot')
    expect(claimAgentBinding).not.toHaveBeenCalled()
  })

  it('claims the phone number for the Agent that owns the bot', async () => {
    const agent = agentWith({ web: { resourceId: BOT_ID } })
    getAgentForResource.mockImplementation(async (id: string) =>
      id === BOT_ID ? { resourceId: id, agentId: 'agent-1', clientId: 'client-1' } : null
    )
    getAgentsByClientId.mockResolvedValue([agent])
    getAgentById.mockResolvedValue(agent)
    updateAgent.mockResolvedValue(agentWith({ web: { resourceId: BOT_ID }, whatsapp: { resourceId: PHONE_ID } }))

    await enableWhatsAppForBot(BOT_ID, 'client-1')

    expect(claimAgentBinding).toHaveBeenCalledWith(PHONE_ID, 'agent-1', 'client-1')
  })
})
