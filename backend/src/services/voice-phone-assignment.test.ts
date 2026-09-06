import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../repositories/voice-repository.js', () => ({
  createVoiceAgent: vi.fn(),
  createVoiceKBEntry: vi.fn(),
  deleteVoiceAgent: vi.fn(),
  deleteVoiceKBEntry: vi.fn(),
  getVoiceAgentById: vi.fn(),
  getVoiceAgentsByClient: vi.fn(),
  getVoiceCallLogsForAgent: vi.fn(),
  getVoiceKBEntriesByAgent: vi.fn(),
  getVoiceKBEntry: vi.fn(),
  updateVoiceAgent: vi.fn(),
  updateVoiceIndexingJob: vi.fn(),
  updateVoiceKBEntry: vi.fn(),
}))

// normalisePhoneNumber and VoicePhoneConflictError are the real ones: the
// service's contract is defined in terms of both, and faking them would let a
// normalisation change pass these tests while breaking routing.
vi.mock('../repositories/voice-phone-lookup-repository.js', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../repositories/voice-phone-lookup-repository.js')
  >()
  return {
    ...actual,
    claimPhoneNumber: vi.fn(),
    getPhoneNumberForAgent: vi.fn(),
    releasePhoneNumber: vi.fn(),
  }
})

import {
  AgentAlreadyHasNumberError,
  assignVoiceAgentPhoneNumber,
  getVoiceAgentPhoneNumber,
  InvalidPhoneNumberError,
  PhoneNumberInUseError,
  releaseVoiceAgentPhoneNumber,
} from './voice-service.js'
import { getVoiceAgentById } from '../repositories/voice-repository.js'
import {
  claimPhoneNumber,
  getPhoneNumberForAgent,
  releasePhoneNumber,
  VoicePhoneConflictError,
} from '../repositories/voice-phone-lookup-repository.js'
import type { VoiceAgent, VoicePhoneLookup } from '../types/index.js'

const AGENT = {
  agentId: 'agent-1',
  clientId: 'client-1',
  name: 'Ravi',
} as VoiceAgent

const DID = '+912240000000'

const ASSIGNMENT: VoicePhoneLookup = {
  phoneNumber: DID,
  agentId: 'agent-1',
  clientId: 'client-1',
  assignedAt: '2026-09-06T00:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getVoiceAgentById).mockResolvedValue(AGENT)
  vi.mocked(getPhoneNumberForAgent).mockResolvedValue(null)
  vi.mocked(claimPhoneNumber).mockResolvedValue(ASSIGNMENT)
  vi.mocked(releasePhoneNumber).mockResolvedValue(undefined)
})

// Every one of these goes through the same ownership check, and the repository
// layer has none -- it is shared with the inbound-call path, which has no
// authenticated client. If this stops holding, a client can point someone
// else's agent at a number they control and take their calls.
describe('ownership', () => {
  const cases = [
    ['read', () => getVoiceAgentPhoneNumber('agent-1', 'client-b')],
    ['assign', () => assignVoiceAgentPhoneNumber('agent-1', 'client-b', DID)],
    ['release', () => releaseVoiceAgentPhoneNumber('agent-1', 'client-b')],
  ] as const

  it.each(cases)('refuses to %s a number on another client\'s agent', async (_name, act) => {
    await expect(act()).rejects.toThrow('Voice agent not found')

    expect(claimPhoneNumber).not.toHaveBeenCalled()
    expect(releasePhoneNumber).not.toHaveBeenCalled()
  })

  it.each(cases)('refuses to %s for an agent that does not exist', async (_name, act) => {
    vi.mocked(getVoiceAgentById).mockResolvedValue(null)

    await expect(act()).rejects.toThrow('Voice agent not found')

    expect(claimPhoneNumber).not.toHaveBeenCalled()
    expect(releasePhoneNumber).not.toHaveBeenCalled()
  })
})

describe('reading the assignment', () => {
  it('returns the number the agent answers on', async () => {
    vi.mocked(getPhoneNumberForAgent).mockResolvedValue(ASSIGNMENT)

    await expect(getVoiceAgentPhoneNumber('agent-1', 'client-1')).resolves.toEqual(ASSIGNMENT)
  })

  it('returns null for a browser-only agent rather than throwing', async () => {
    // Most agents have no number and never will. That is not an error state.
    await expect(getVoiceAgentPhoneNumber('agent-1', 'client-1')).resolves.toBeNull()
  })
})

describe('assigning a number', () => {
  it('claims the number for the agent and its owner', async () => {
    const result = await assignVoiceAgentPhoneNumber('agent-1', 'client-1', DID)

    expect(claimPhoneNumber).toHaveBeenCalledWith(DID, 'agent-1', 'client-1')
    expect(result).toEqual(ASSIGNMENT)
  })

  it('normalises before claiming, so one number cannot become two rows', async () => {
    // The partition key is an exact-match lookup: an unnormalised write and a
    // normalised read miss each other, and the call is silently unroutable.
    await assignVoiceAgentPhoneNumber('agent-1', 'client-1', '  0091 22 4000 0000  ')

    expect(claimPhoneNumber).toHaveBeenCalledWith(DID, 'agent-1', 'client-1')
  })

  it('returns what the claim wrote rather than reading it back', async () => {
    // The agentId index is eventually consistent, so a read-after-write there
    // can hand back the state from before this very claim.
    await assignVoiceAgentPhoneNumber('agent-1', 'client-1', DID)

    expect(getPhoneNumberForAgent).toHaveBeenCalledTimes(1)
  })

  it('rejects a malformed number without touching the table', async () => {
    await expect(
      assignVoiceAgentPhoneNumber('agent-1', 'client-1', 'not-a-number')
    ).rejects.toBeInstanceOf(InvalidPhoneNumberError)

    expect(claimPhoneNumber).not.toHaveBeenCalled()
  })

  it('reports a number another agent already holds as a conflict', async () => {
    vi.mocked(claimPhoneNumber).mockRejectedValue(new VoicePhoneConflictError(DID))

    await expect(assignVoiceAgentPhoneNumber('agent-1', 'client-1', DID)).rejects.toBeInstanceOf(
      PhoneNumberInUseError
    )
  })

  it('lets an agent re-claim the number it already has', async () => {
    // The claim is idempotent on purpose, so re-running an assignment is safe.
    vi.mocked(getPhoneNumberForAgent).mockResolvedValue(ASSIGNMENT)

    await expect(assignVoiceAgentPhoneNumber('agent-1', 'client-1', DID)).resolves.toEqual(ASSIGNMENT)
  })

  it('treats a differently-spelled re-claim as the same number', async () => {
    vi.mocked(getPhoneNumberForAgent).mockResolvedValue(ASSIGNMENT)

    await expect(
      assignVoiceAgentPhoneNumber('agent-1', 'client-1', '912240000000')
    ).resolves.toEqual(ASSIGNMENT)
  })

  it('refuses to silently move an agent already answering on another number', async () => {
    // A swap is a release plus a claim with no transaction around it. Half of
    // one leaves the agent answering on neither number, on a line the client
    // still pays for.
    vi.mocked(getPhoneNumberForAgent).mockResolvedValue(ASSIGNMENT)

    const error = await assignVoiceAgentPhoneNumber('agent-1', 'client-1', '+912299999999').catch(
      (e: unknown) => e
    )

    expect(error).toBeInstanceOf(AgentAlreadyHasNumberError)
    expect((error as AgentAlreadyHasNumberError).currentNumber).toBe(DID)
    expect(claimPhoneNumber).not.toHaveBeenCalled()
    expect(releasePhoneNumber).not.toHaveBeenCalled()
  })

  it('does not swallow an unexpected repository failure as a conflict', async () => {
    vi.mocked(claimPhoneNumber).mockRejectedValue(new Error('DynamoDB unavailable'))

    await expect(assignVoiceAgentPhoneNumber('agent-1', 'client-1', DID)).rejects.toThrow(
      'DynamoDB unavailable'
    )
  })
})

describe('releasing a number', () => {
  it('releases the number the server knows the agent holds', async () => {
    vi.mocked(getPhoneNumberForAgent).mockResolvedValue(ASSIGNMENT)

    await releaseVoiceAgentPhoneNumber('agent-1', 'client-1')

    expect(releasePhoneNumber).toHaveBeenCalledWith(DID)
  })

  it('is a no-op for an agent with no number', async () => {
    await releaseVoiceAgentPhoneNumber('agent-1', 'client-1')

    expect(releasePhoneNumber).not.toHaveBeenCalled()
  })
})
