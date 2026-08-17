import { beforeEach, describe, expect, it, vi } from 'vitest'

const createAgentRecord = vi.fn()
const deleteAgentRecord = vi.fn()
const getAgentById = vi.fn()
const getAgentsByClientId = vi.fn()
const updateAgentRecord = vi.fn()
vi.mock('../repositories/agent-repository.js', () => ({
  createAgent: createAgentRecord,
  deleteAgent: deleteAgentRecord,
  getAgentById,
  getAgentsByClientId,
  updateAgent: updateAgentRecord,
}))

const claimAgentBinding = vi.fn()
const removeAgentBinding = vi.fn()
vi.mock('../repositories/agent-binding-lookup-repository.js', () => ({
  claimAgentBinding,
  removeAgentBinding,
}))

const getBotById = vi.fn()
vi.mock('../repositories/bot-repository.js', () => ({ getBotById }))

const getVoiceAgentById = vi.fn()
vi.mock('../repositories/voice-repository.js', () => ({ getVoiceAgentById }))

const { createAgent, deleteAgent, getAgent, setAgentScriptedOnly } = await import('./agent-service.js')

beforeEach(() => {
  vi.clearAllMocks()
  // removeAgentBinding is always awaited with .catch(); give the mock a
  // resolved promise so the compensation/cleanup paths don't blow up on undefined.
  removeAgentBinding.mockResolvedValue(undefined)
})

describe('createAgent — ownership enforcement (plan-eng-review Issue 2)', () => {
  it('binds owned web + voice resources: validates, claims both, writes the Agent', async () => {
    getBotById.mockResolvedValue({ botId: 'bot-1', clientId: 'client-1' })
    getVoiceAgentById.mockResolvedValue({ agentId: 'voice-1', clientId: 'client-1' })
    claimAgentBinding.mockResolvedValue(undefined)
    createAgentRecord.mockImplementation(async (rec: unknown) => ({ ...(rec as object), createdAt: 'x', updatedAt: 'x' }))

    const agent = await createAgent({
      clientId: 'client-1',
      name: 'Sales Agent',
      channels: { web: { resourceId: 'bot-1' }, voice: { resourceId: 'voice-1' } },
    })

    expect(claimAgentBinding).toHaveBeenCalledWith('bot-1', expect.any(String), 'client-1')
    expect(claimAgentBinding).toHaveBeenCalledWith('voice-1', expect.any(String), 'client-1')
    expect(createAgentRecord).toHaveBeenCalledOnce()
    expect(agent.name).toBe('Sales Agent')
  })

  it("REJECTS binding another client's chatbot — never claims or writes", async () => {
    // getBotById is keyed by (botId, clientId); a bot the caller doesn't own
    // returns null.
    getBotById.mockResolvedValue(null)

    await expect(
      createAgent({ clientId: 'attacker', name: 'x', channels: { web: { resourceId: 'victim-bot' } } })
    ).rejects.toThrow('Bot not found')

    expect(claimAgentBinding).not.toHaveBeenCalled()
    expect(createAgentRecord).not.toHaveBeenCalled()
  })

  it("REJECTS binding another client's voice agent — never claims or writes", async () => {
    getVoiceAgentById.mockResolvedValue({ agentId: 'victim-voice', clientId: 'someone-else' })

    await expect(
      createAgent({ clientId: 'attacker', name: 'x', channels: { voice: { resourceId: 'victim-voice' } } })
    ).rejects.toThrow('Voice agent not found')

    expect(claimAgentBinding).not.toHaveBeenCalled()
    expect(createAgentRecord).not.toHaveBeenCalled()
  })

  it('releases already-made claims if a later claim conflicts (compensation)', async () => {
    getBotById.mockResolvedValue({ botId: 'bot-1', clientId: 'client-1' })
    getVoiceAgentById.mockResolvedValue({ agentId: 'voice-1', clientId: 'client-1' })
    // web claim (first) succeeds, voice claim (second) conflicts.
    claimAgentBinding.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('conflict'))

    await expect(
      createAgent({
        clientId: 'client-1',
        name: 'x',
        channels: { web: { resourceId: 'bot-1' }, voice: { resourceId: 'voice-1' } },
      })
    ).rejects.toThrow('conflict')

    expect(removeAgentBinding).toHaveBeenCalledWith('bot-1')
    expect(createAgentRecord).not.toHaveBeenCalled()
  })
})

describe('getAgent', () => {
  it("throws 'Agent not found' for a non-owned or missing agent", async () => {
    getAgentById.mockResolvedValue(null)
    await expect(getAgent('a', 'client-1')).rejects.toThrow('Agent not found')
  })
})

describe('deleteAgent', () => {
  it('releases every channel binding, then deletes the Agent record', async () => {
    getAgentById.mockResolvedValue({
      agentId: 'a',
      clientId: 'client-1',
      name: 'x',
      channels: { web: { resourceId: 'bot-1' }, voice: { resourceId: 'voice-1' } },
      createdAt: 'x',
      updatedAt: 'x',
    })

    await deleteAgent('a', 'client-1')

    expect(removeAgentBinding).toHaveBeenCalledWith('bot-1')
    expect(removeAgentBinding).toHaveBeenCalledWith('voice-1')
    expect(deleteAgentRecord).toHaveBeenCalledWith('a', 'client-1')
  })
})

describe('setAgentScriptedOnly', () => {
  it('writes the flag on an Agent the caller owns', async () => {
    getAgentById.mockResolvedValueOnce({ agentId: 'agent-1', clientId: 'client-1', name: 'A', channels: {} })
    updateAgentRecord.mockResolvedValueOnce({ agentId: 'agent-1', scriptedOnly: true })

    const result = await setAgentScriptedOnly('agent-1', 'client-1', true)

    expect(updateAgentRecord).toHaveBeenCalledWith('agent-1', 'client-1', { scriptedOnly: true })
    expect(result.scriptedOnly).toBe(true)
  })

  it('turns the flag back off', async () => {
    getAgentById.mockResolvedValueOnce({ agentId: 'agent-1', clientId: 'client-1', name: 'A', channels: {} })
    updateAgentRecord.mockResolvedValueOnce({ agentId: 'agent-1', scriptedOnly: false })

    await setAgentScriptedOnly('agent-1', 'client-1', false)

    expect(updateAgentRecord).toHaveBeenCalledWith('agent-1', 'client-1', { scriptedOnly: false })
  })

  // A safety control that one tenant could apply to another's Agent would be a
  // denial-of-service dressed as a feature.
  it('refuses an Agent the caller does not own, and writes nothing', async () => {
    getAgentById.mockResolvedValueOnce(null)

    await expect(setAgentScriptedOnly('agent-1', 'someone-else', true)).rejects.toThrow('Agent not found')
    expect(updateAgentRecord).not.toHaveBeenCalled()
  })
})
