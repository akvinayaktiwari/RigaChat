import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the DynamoDB boundary. getTableName also runs at module load, so it is
// stubbed here to avoid needing DYNAMODB_TABLE_AGENT_BINDING_LOOKUP in the env.
const send = vi.fn()
vi.mock('./dynamo-client.js', () => ({
  dynamoClient: { send },
  getTableName: () => 'test-agent-binding-lookup',
}))

const { claimAgentBinding, getAgentForResource, removeAgentBinding, AgentBindingConflictError } =
  await import('./agent-binding-lookup-repository.js')

function conditionalCheckFailed(): Error {
  const err = new Error('The conditional request failed')
  err.name = 'ConditionalCheckFailedException'
  return err
}

describe('claimAgentBinding', () => {
  beforeEach(() => {
    send.mockReset()
  })

  it('writes an atomic claim that a resource maps to at most one Agent, re-claimable by the same Agent', async () => {
    send.mockResolvedValue({})

    await claimAgentBinding('bot-1', 'agent-1', 'client-1')

    const input = send.mock.calls[0][0].input
    expect(input.Item).toMatchObject({ resourceId: 'bot-1', agentId: 'agent-1', clientId: 'client-1' })
    expect(input.Item.boundAt).toEqual(expect.any(String))
    // attribute_not_exists -> first claim; OR agentId = self -> idempotent re-claim.
    expect(input.ConditionExpression).toBe('attribute_not_exists(resourceId) OR agentId = :agentId')
    expect(input.ExpressionAttributeValues).toEqual({ ':agentId': 'agent-1' })
  })

  it('rejects a second, different Agent claiming an already-bound resource', async () => {
    send.mockRejectedValue(conditionalCheckFailed())

    await expect(claimAgentBinding('bot-1', 'agent-2', 'client-1')).rejects.toBeInstanceOf(
      AgentBindingConflictError
    )
  })

  it('surfaces non-conflict DynamoDB errors as a generic failure, not a conflict', async () => {
    send.mockRejectedValue(new Error('network down'))

    await expect(claimAgentBinding('bot-1', 'agent-1', 'client-1')).rejects.toThrow(/network down/)
    await expect(claimAgentBinding('bot-1', 'agent-1', 'client-1')).rejects.not.toBeInstanceOf(
      AgentBindingConflictError
    )
  })
})

describe('getAgentForResource', () => {
  beforeEach(() => {
    send.mockReset()
  })

  it('returns the owning Agent row for a bound resource', async () => {
    send.mockResolvedValue({
      Item: { resourceId: 'voice-9', agentId: 'agent-7', clientId: 'client-1', boundAt: '2026-07-30T00:00:00.000Z' },
    })

    const owner = await getAgentForResource('voice-9')

    expect(owner).toEqual({
      resourceId: 'voice-9',
      agentId: 'agent-7',
      clientId: 'client-1',
      boundAt: '2026-07-30T00:00:00.000Z',
    })
  })

  it('returns null for an unbound resource', async () => {
    send.mockResolvedValue({})
    expect(await getAgentForResource('nope')).toBeNull()
  })
})

describe('removeAgentBinding', () => {
  beforeEach(() => {
    send.mockReset()
  })

  it('deletes by resourceId', async () => {
    send.mockResolvedValue({})
    await removeAgentBinding('bot-1')
    expect(send.mock.calls[0][0].input.Key).toEqual({ resourceId: 'bot-1' })
  })
})
