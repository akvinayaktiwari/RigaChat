import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Agent } from '../types/index.js'

const send = vi.fn()
vi.mock('./dynamo-client.js', () => ({
  dynamoClient: { send },
  getTableName: () => 'test-agents',
}))

const { createAgent, getAgentById, getAgentsByClientId } = await import('./agent-repository.js')

describe('createAgent', () => {
  beforeEach(() => {
    send.mockReset()
  })

  it('stamps createdAt/updatedAt and writes to the agents table', async () => {
    send.mockResolvedValue({})

    const result = await createAgent({
      agentId: 'agent-1',
      clientId: 'client-1',
      name: 'Sales Agent',
      channels: { web: { resourceId: 'bot-1' }, voice: { resourceId: 'voice-1' } },
    })

    expect(result.createdAt).toEqual(expect.any(String))
    expect(result.updatedAt).toEqual(expect.any(String))
    const input = send.mock.calls[0][0].input
    expect(input.Item).toMatchObject({ agentId: 'agent-1', clientId: 'client-1', name: 'Sales Agent' })
    expect(input.Item.channels.web.resourceId).toBe('bot-1')
  })
})

describe('getAgentById', () => {
  beforeEach(() => {
    send.mockReset()
  })

  it('reads by the clientId+agentId key (ownership-scoped)', async () => {
    const agent: Agent = {
      agentId: 'agent-1',
      clientId: 'client-1',
      name: 'Sales Agent',
      channels: {},
      createdAt: 'x',
      updatedAt: 'x',
    }
    send.mockResolvedValue({ Item: agent })

    const result = await getAgentById('agent-1', 'client-1')

    expect(result).toEqual(agent)
    expect(send.mock.calls[0][0].input.Key).toEqual({ clientId: 'client-1', agentId: 'agent-1' })
  })

  it('returns null when the agent does not exist (or belongs to another client)', async () => {
    send.mockResolvedValue({})
    expect(await getAgentById('agent-1', 'other-client')).toBeNull()
  })
})

describe('getAgentsByClientId', () => {
  beforeEach(() => {
    send.mockReset()
  })

  it('queries by the clientId partition key and returns [] when empty', async () => {
    send.mockResolvedValue({ Items: undefined })
    const result = await getAgentsByClientId('client-1')
    expect(result).toEqual([])
    expect(send.mock.calls[0][0].input.KeyConditionExpression).toBe('clientId = :clientId')
  })
})
