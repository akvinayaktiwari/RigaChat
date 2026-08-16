import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Agent } from '../types/index.js'

const getAgentForResource = vi.fn()
const getAgents = vi.fn()

vi.mock('../repositories/agent-binding-lookup-repository.js', () => ({ getAgentForResource }))
vi.mock('./agent-service.js', () => ({ getAgents }))

const { resolveAgentForInboundMessage } = await import('./inbound-agent-resolution-service.js')

// botId is `string | null` rather than optional on purpose: passing `undefined`
// to an optional parameter triggers its DEFAULT, so `agent('a', 'c', undefined)`
// would silently produce an agent WITH a web binding and quietly pass a test
// asserting the opposite.
function agent(agentId: string, clientId = 'client-1', botId: string | null = 'bot-1'): Agent {
  return {
    agentId,
    clientId,
    name: agentId,
    channels: botId ? { web: { resourceId: botId } } : {},
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
  }
}

beforeEach(() => {
  getAgentForResource.mockReset().mockResolvedValue(null)
  getAgents.mockReset().mockResolvedValue([])
})

describe('resolveAgentForInboundMessage', () => {
  it('resolves the Agent that claimed the number', async () => {
    getAgentForResource.mockResolvedValue({ resourceId: 'phone-1', agentId: 'agent-1', clientId: 'client-1' })
    getAgents.mockResolvedValue([agent('agent-1'), agent('agent-2')])

    const resolution = await resolveAgentForInboundMessage('phone-1', 'client-1', 'hi')

    expect(resolution?.agent.agentId).toBe('agent-1')
    expect(resolution?.botId).toBe('bot-1')
    expect(resolution?.strategy).toBe('number_binding')
  })

  // The binding wins even when the client has several Agents. Without it, a
  // multi-Agent client would fall through to the ambiguous case and go unanswered.
  it('prefers the binding over the only-Agent fallback', async () => {
    getAgentForResource.mockResolvedValue({ resourceId: 'phone-1', agentId: 'agent-2', clientId: 'client-1' })
    getAgents.mockResolvedValue([agent('agent-1'), agent('agent-2')])

    const resolution = await resolveAgentForInboundMessage('phone-1', 'client-1', 'hi')

    expect(resolution?.agent.agentId).toBe('agent-2')
  })

  it('falls back to the client only Agent when nothing claimed the number', async () => {
    getAgents.mockResolvedValue([agent('agent-solo')])

    const resolution = await resolveAgentForInboundMessage('phone-unbound', 'client-1', 'hi')

    expect(resolution?.agent.agentId).toBe('agent-solo')
    expect(resolution?.strategy).toBe('only_agent')
  })

  // Guessing would hand a real buyer to the wrong persona and the wrong
  // knowledge base. Same posture as the form/Meta path in lead-resolution.
  it('refuses to guess between several Agents with no binding', async () => {
    getAgents.mockResolvedValue([agent('agent-1'), agent('agent-2')])

    await expect(resolveAgentForInboundMessage('phone-unbound', 'client-1', 'hi')).resolves.toBeNull()
  })

  // A number claimed by another tenant must never route here.
  it('refuses a binding owned by a different client', async () => {
    getAgentForResource.mockResolvedValue({ resourceId: 'phone-1', agentId: 'agent-x', clientId: 'other-client' })
    getAgents.mockResolvedValue([agent('agent-solo')])

    const resolution = await resolveAgentForInboundMessage('phone-1', 'client-1', 'hi')

    // Falls through to the only-Agent fallback for THIS client, never the
    // other tenant's Agent.
    expect(resolution?.agent.agentId).toBe('agent-solo')
  })

  // botId scopes Pinecone (rule 5) and partitions the lead row. An Agent
  // without one cannot answer, and saying so beats answering from nothing.
  it('returns null when the resolved Agent has no web binding', async () => {
    getAgentForResource.mockResolvedValue({ resourceId: 'phone-1', agentId: 'agent-1', clientId: 'client-1' })
    getAgents.mockResolvedValue([agent('agent-1', 'client-1', null)])

    await expect(resolveAgentForInboundMessage('phone-1', 'client-1', 'hi')).resolves.toBeNull()
  })

  it('returns null when the client has no Agents at all', async () => {
    await expect(resolveAgentForInboundMessage('phone-1', 'client-1', 'hi')).resolves.toBeNull()
  })

  // The extension point for many-Agents-per-number. It is deliberately inert
  // today; this pins that it is skipped rather than silently assumed to work,
  // so nobody mistakes the seam for a working feature.
  it('skips the unimplemented ref-code strategy', async () => {
    getAgents.mockResolvedValue([agent('agent-solo')])

    const resolution = await resolveAgentForInboundMessage('phone-1', 'client-1', 'hi [ref:7f3a2b]')

    expect(resolution?.strategy).not.toBe('ref_code')
    expect(resolution?.strategy).toBe('only_agent')
  })
})
