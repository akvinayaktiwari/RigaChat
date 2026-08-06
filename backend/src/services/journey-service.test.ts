import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentConfig, JourneyDefinition } from '../types/index.js'

const createJourneyBundleRepo = vi.fn()
const deleteJourneyBundleRepo = vi.fn()
const getJourneyBundleById = vi.fn()
const getJourneyBundlesByBotId = vi.fn()
const updateJourneyBundleRepo = vi.fn()
vi.mock('../repositories/journey-repository.js', () => ({
  createJourneyBundle: createJourneyBundleRepo,
  deleteJourneyBundle: deleteJourneyBundleRepo,
  getJourneyBundleById,
  getJourneyBundlesByBotId,
  updateJourneyBundle: updateJourneyBundleRepo,
}))

const getBotConfig = vi.fn()
vi.mock('./bot-service.js', () => ({ getBotConfig }))

const createOrUpdateStateMachine = vi.fn()
const deleteStateMachine = vi.fn()
vi.mock('../lib/step-functions.js', () => ({
  createOrUpdateStateMachine,
  deleteStateMachine,
  stateMachineNameFor: (clientId: string, bundleId: string) => `vyostra-${clientId}-${bundleId}`,
}))

const claimJourneyTrigger = vi.fn()
const releaseJourneyTrigger = vi.fn()
class JourneyTriggerConflictError extends Error {
  constructor(readonly heldByBundleId: string) {
    super(`Another published journey already handles this trigger (bundle ${heldByBundleId})`)
    this.name = 'JourneyTriggerConflictError'
  }
}
vi.mock('../repositories/journey-trigger-claim-repository.js', () => ({
  claimJourneyTrigger,
  releaseJourneyTrigger,
  triggerClaimKey: (scope: { agentId?: string; botId: string }, trigger: string) =>
    scope.agentId ? `agent:${scope.agentId}#${trigger}` : `bot:${scope.botId}#${trigger}`,
  JourneyTriggerConflictError,
}))

const resolveOwningAgentId = vi.fn()
vi.mock('./agent-service.js', () => ({ resolveOwningAgentId }))

// journey-compiler-service is deliberately NOT mocked: compiling for real is
// what makes these tests prove the whole create/update validation chain
// (palette -> toolbox coverage -> step-graph structure) rather than just the
// bookkeeping around it.
const {
  createJourneyBundle,
  createJourneyBundleFromTemplate,
  deleteJourneyBundle,
  JourneyTemplateNotFoundError,
  JourneyValidationError,
  publishJourneyBundle,
  updateJourneyBundle,
} = await import('./journey-service.js')
type CreateJourneyBundleInput = Parameters<typeof createJourneyBundle>[0]

const journey: Omit<JourneyDefinition, 'botId' | 'clientId'> = {
  journeyId: 'journey-1',
  name: 'Qualify then book',
  triggerType: 'lead_captured',
  startStepId: 'greet',
  steps: [{ stepId: 'greet', name: 'Greet the lead', type: 'send_message' }],
}

const agent: AgentConfig = {
  personaId: 'persona-1',
  name: 'Lead qualifier',
  systemPrompt: 'Qualify the lead.',
  mcpToolbox: ['booking'],
  channelConfig: {},
}

beforeEach(() => {
  vi.clearAllMocks()
  getBotConfig.mockResolvedValue({ botId: 'bot-1', clientId: 'client-1' })
  resolveOwningAgentId.mockResolvedValue(undefined)
  createJourneyBundleRepo.mockImplementation(async (record: unknown) => ({
    ...(record as object),
    bundleId: 'bundle-1',
    createdAt: 'now',
    updatedAt: 'now',
  }))
  claimJourneyTrigger.mockResolvedValue(undefined)
  releaseJourneyTrigger.mockResolvedValue(undefined)
  deleteStateMachine.mockResolvedValue(undefined)
  createOrUpdateStateMachine.mockResolvedValue({
    stateMachineArn: 'arn:aws:states:ap-south-1:1:stateMachine:sm',
    versionArn: 'arn:aws:states:ap-south-1:1:stateMachine:sm:1',
    version: 1,
  })
  updateJourneyBundleRepo.mockImplementation(async (_b: string, _id: string, patch: unknown) => patch)
})

const publishedBundle = {
  bundleId: 'bundle-1',
  botId: 'bot-1',
  clientId: 'client-1',
  agentId: 'agent-1',
  journey: { ...journey, botId: 'bot-1', clientId: 'client-1' },
  agent,
  status: 'published' as const,
}

describe('createJourneyBundle — isPrebuiltTemplate is server-controlled', () => {
  // REGRESSION (plan-eng-review Issue 4). journey-routes.ts previously passed
  // isPrebuiltTemplate straight from the request body under *client* Cognito
  // auth, so any authenticated client could mint a bundle flagged as a
  // platform template. Prebuilt agents are code-defined seeds authored only by
  // us; a persisted bundle is never a template. If this test fails, that hole
  // has been reopened.
  it('persists isPrebuiltTemplate: false even when a caller tries to force it true', async () => {
    // The extra key is smuggled past the input type on purpose, mimicking a
    // raw request body: the route's interface is a compile-time claim, not a
    // runtime guarantee about what a client actually POSTs.
    const forged = {
      botId: 'bot-1',
      clientId: 'client-1',
      name: 'Client bundle',
      journey,
      agent,
      isPrebuiltTemplate: true,
    } as unknown as CreateJourneyBundleInput

    await createJourneyBundle(forged)

    expect(createJourneyBundleRepo).toHaveBeenCalledTimes(1)
    expect(createJourneyBundleRepo.mock.calls[0]?.[0]).toMatchObject({ isPrebuiltTemplate: false })
  })

  it('does not let a caller forge sourceTemplateId provenance through the client path', async () => {
    await createJourneyBundle({
      botId: 'bot-1',
      clientId: 'client-1',
      name: 'Client bundle',
      journey,
      agent,
    })

    expect(createJourneyBundleRepo.mock.calls[0]?.[0]).toMatchObject({ sourceTemplateId: undefined })
  })
})

describe('createJourneyBundle — toolbox palette validation', () => {
  it('rejects a capability outside the platform palette', async () => {
    await expect(
      createJourneyBundle({
        botId: 'bot-1',
        clientId: 'client-1',
        name: 'Bad toolbox',
        journey,
        agent: { ...agent, mcpToolbox: ['banana'] as never },
      })
    ).rejects.toThrow(JourneyValidationError)

    expect(createJourneyBundleRepo).not.toHaveBeenCalled()
  })

  it('names every offending capability and lists the valid ones', async () => {
    await expect(
      createJourneyBundle({
        botId: 'bot-1',
        clientId: 'client-1',
        name: 'Bad toolbox',
        journey,
        agent: { ...agent, mcpToolbox: ['banana', 'booking', 'kiwi'] as never },
      })
    ).rejects.toThrow(/"banana", "kiwi".*Available: booking, reminder, quotation, brochure/s)
  })

  it('rejects a non-array toolbox rather than throwing on .filter', async () => {
    await expect(
      createJourneyBundle({
        botId: 'bot-1',
        clientId: 'client-1',
        name: 'Bad toolbox',
        journey,
        agent: { ...agent, mcpToolbox: 'booking' as never },
      })
    ).rejects.toThrow(/must be an array/)
  })

  it('accepts every real capability', async () => {
    await createJourneyBundle({
      botId: 'bot-1',
      clientId: 'client-1',
      name: 'Full toolbox',
      journey,
      agent: { ...agent, mcpToolbox: ['booking', 'reminder', 'quotation', 'brochure'] },
    })

    expect(createJourneyBundleRepo).toHaveBeenCalledTimes(1)
  })
})

describe('createJourneyBundle — a tool_call step must be covered by the toolbox', () => {
  it('rejects a step calling a real capability the bundle did not include', async () => {
    await expect(
      createJourneyBundle({
        botId: 'bot-1',
        clientId: 'client-1',
        name: 'Uncovered step',
        journey: {
          ...journey,
          steps: [{ stepId: 'greet', name: 'Book it', type: 'tool_call', toolName: 'reminder' }],
        },
        // toolbox has 'booking' only
        agent,
      })
    ).rejects.toThrow(/not in this Agent's mcpToolbox/)
  })
})

describe('createJourneyBundleFromTemplate — cloning a prebuilt agent', () => {
  const templateId = 'real-estate-lead-qualification-v1'

  it('stamps sourceTemplateId, which the client-facing create path cannot set', async () => {
    await createJourneyBundleFromTemplate({ templateId, botId: 'bot-1', clientId: 'client-1' })

    expect(createJourneyBundleRepo.mock.calls[0]?.[0]).toMatchObject({ sourceTemplateId: templateId })
  })

  it('produces a client-owned bundle, not another template', async () => {
    await createJourneyBundleFromTemplate({ templateId, botId: 'bot-1', clientId: 'client-1' })

    expect(createJourneyBundleRepo.mock.calls[0]?.[0]).toMatchObject({
      isPrebuiltTemplate: false,
      clientId: 'client-1',
      botId: 'bot-1',
      status: 'draft',
    })
  })

  // Two clones of one template must be distinguishable. Reusing the template's
  // own journeyId/personaId would make them identical apart from bundleId.
  it('re-mints journeyId and personaId instead of reusing the template’s', async () => {
    await createJourneyBundleFromTemplate({ templateId, botId: 'bot-1', clientId: 'client-1' })
    await createJourneyBundleFromTemplate({ templateId, botId: 'bot-1', clientId: 'client-1' })

    const [first, second] = createJourneyBundleRepo.mock.calls.map((call) => call[0])
    expect(first.journey.journeyId).not.toBe(templateId)
    expect(first.agent.personaId).not.toBe('real-estate-qualifier-v1')
    expect(first.journey.journeyId).not.toBe(second.journey.journeyId)
    expect(first.agent.personaId).not.toBe(second.agent.personaId)
  })

  it('still enforces bot ownership — a template is trusted, the target bot is not', async () => {
    getBotConfig.mockRejectedValue(new Error('Bot not found'))

    await expect(
      createJourneyBundleFromTemplate({ templateId, botId: 'someone-elses-bot', clientId: 'client-1' })
    ).rejects.toThrow('Bot not found')
    expect(createJourneyBundleRepo).not.toHaveBeenCalled()
  })

  it('rejects an unknown templateId without writing anything', async () => {
    await expect(
      createJourneyBundleFromTemplate({ templateId: 'no-such-template', botId: 'bot-1', clientId: 'client-1' })
    ).rejects.toThrow(JourneyTemplateNotFoundError)
    expect(createJourneyBundleRepo).not.toHaveBeenCalled()
  })

  it('honours a name override but falls back to the template name when blank', async () => {
    await createJourneyBundleFromTemplate({ templateId, botId: 'bot-1', clientId: 'client-1', name: 'My qualifier' })
    expect(createJourneyBundleRepo.mock.calls[0]?.[0]).toMatchObject({ name: 'My qualifier' })

    vi.clearAllMocks()
    getBotConfig.mockResolvedValue({ botId: 'bot-1', clientId: 'client-1' })
    resolveOwningAgentId.mockResolvedValue(undefined)
    createJourneyBundleRepo.mockImplementation(async (record: unknown) => record)

    await createJourneyBundleFromTemplate({ templateId, botId: 'bot-1', clientId: 'client-1', name: '   ' })
    expect(createJourneyBundleRepo.mock.calls[0]?.[0]).toMatchObject({ name: 'Real estate lead qualification' })
  })
})

describe('publishJourneyBundle — ordering is what keeps AWS clean', () => {
  it('creates the state machine and records both arns plus version 1', async () => {
    getJourneyBundleById.mockResolvedValue({ ...publishedBundle, status: 'draft' })

    await publishJourneyBundle('bot-1', 'bundle-1', 'client-1')

    expect(createOrUpdateStateMachine).toHaveBeenCalledWith(
      'vyostra-client-1-bundle-1',
      expect.any(String),
      undefined
    )
    expect(updateJourneyBundleRepo).toHaveBeenCalledWith('bot-1', 'bundle-1', {
      status: 'published',
      compiledStateMachineArn: 'arn:aws:states:ap-south-1:1:stateMachine:sm',
      compiledStateMachineVersionArn: 'arn:aws:states:ap-south-1:1:stateMachine:sm:1',
      publishedVersion: 1,
    })
  })

  it('updates in place on republish rather than creating a second machine', async () => {
    getJourneyBundleById.mockResolvedValue({
      ...publishedBundle,
      status: 'draft',
      compiledStateMachineArn: 'arn:existing',
      publishedVersion: 3,
    })
    createOrUpdateStateMachine.mockResolvedValue({
      stateMachineArn: 'arn:existing',
      versionArn: 'arn:existing:4',
      version: 4,
    })

    await publishJourneyBundle('bot-1', 'bundle-1', 'client-1')

    expect(createOrUpdateStateMachine).toHaveBeenCalledWith('vyostra-client-1-bundle-1', expect.any(String), 'arn:existing')
    expect(updateJourneyBundleRepo.mock.calls[0]?.[2]).toMatchObject({ publishedVersion: 4 })
  })

  // REGRESSION, found by the live end-to-end run on 2026-08-06, not by any
  // unit test. Step Functions does NOT mint a new version when the definition
  // is unchanged, so republishing an unedited bundle legitimately returns the
  // SAME version arn. The old code incremented a local counter regardless, so
  // the record claimed version 2 while compiledStateMachineVersionArn still
  // pointed at ...:1 -- exactly the "the version stamp is a label, not a
  // guarantee" failure this design was supposed to eliminate.
  it('does NOT bump the version when AWS returns the same one (unchanged definition)', async () => {
    getJourneyBundleById.mockResolvedValue({
      ...publishedBundle,
      status: 'draft',
      compiledStateMachineArn: 'arn:existing',
      publishedVersion: 1,
    })
    createOrUpdateStateMachine.mockResolvedValue({
      stateMachineArn: 'arn:existing',
      versionArn: 'arn:existing:1',
      version: 1,
    })

    await publishJourneyBundle('bot-1', 'bundle-1', 'client-1')

    const patch = updateJourneyBundleRepo.mock.calls[0]?.[2]
    expect(patch).toMatchObject({ publishedVersion: 1, compiledStateMachineVersionArn: 'arn:existing:1' })
    // The invariant that matters: the recorded version and the arn it points at
    // must never disagree.
    expect(`arn:existing:${patch.publishedVersion}`).toBe(patch.compiledStateMachineVersionArn)
  })

  // A broken journey must never reach AWS: an orphaned state machine for a
  // bundle that cannot compile is unreachable garbage nobody will clean up.
  it('rejects a bad journey before claiming a trigger or calling AWS', async () => {
    getJourneyBundleById.mockResolvedValue({
      ...publishedBundle,
      status: 'draft',
      journey: { ...publishedBundle.journey, startStepId: 'does-not-exist' },
    })

    await expect(publishJourneyBundle('bot-1', 'bundle-1', 'client-1')).rejects.toThrow(JourneyValidationError)
    expect(claimJourneyTrigger).not.toHaveBeenCalled()
    expect(createOrUpdateStateMachine).not.toHaveBeenCalled()
  })

  // Claim before provision: losing the race must not leave a state machine
  // behind that nothing will ever start an execution on.
  it('does not provision anything when another bundle already holds the trigger', async () => {
    getJourneyBundleById.mockResolvedValue({ ...publishedBundle, status: 'draft' })
    claimJourneyTrigger.mockRejectedValue(new JourneyTriggerConflictError('other-bundle'))

    await expect(publishJourneyBundle('bot-1', 'bundle-1', 'client-1')).rejects.toThrow(JourneyTriggerConflictError)
    expect(createOrUpdateStateMachine).not.toHaveBeenCalled()
    expect(updateJourneyBundleRepo).not.toHaveBeenCalled()
  })

  it('scopes the claim by Agent when the bot is wrapped in one', async () => {
    getJourneyBundleById.mockResolvedValue({ ...publishedBundle, status: 'draft' })

    await publishJourneyBundle('bot-1', 'bundle-1', 'client-1')

    expect(claimJourneyTrigger).toHaveBeenCalledWith('agent:agent-1#lead_captured', {
      bundleId: 'bundle-1',
      botId: 'bot-1',
      clientId: 'client-1',
    })
  })

  it('falls back to bot scope for a bot with no Agent', async () => {
    getJourneyBundleById.mockResolvedValue({ ...publishedBundle, agentId: undefined, status: 'draft' })

    await publishJourneyBundle('bot-1', 'bundle-1', 'client-1')

    expect(claimJourneyTrigger).toHaveBeenCalledWith('bot:bot-1#lead_captured', expect.any(Object))
  })
})

describe('deleteJourneyBundle — cleans up what publish created', () => {
  it('releases the trigger and tears down the state machine', async () => {
    getJourneyBundleById.mockResolvedValue({ ...publishedBundle, compiledStateMachineArn: 'arn:existing' })

    await deleteJourneyBundle('bot-1', 'bundle-1', 'client-1')

    expect(releaseJourneyTrigger).toHaveBeenCalledWith('agent:agent-1#lead_captured', 'bundle-1')
    expect(deleteStateMachine).toHaveBeenCalledWith('arn:existing')
    expect(deleteJourneyBundleRepo).toHaveBeenCalledWith('bot-1', 'bundle-1')
  })

  // The client cannot see or fix an AWS outage; their delete should still work.
  it('still deletes the record when AWS cleanup fails', async () => {
    getJourneyBundleById.mockResolvedValue({ ...publishedBundle, compiledStateMachineArn: 'arn:existing' })
    deleteStateMachine.mockRejectedValue(new Error('AWS is having a day'))
    releaseJourneyTrigger.mockRejectedValue(new Error('AWS is having a day'))

    await expect(deleteJourneyBundle('bot-1', 'bundle-1', 'client-1')).resolves.toBeUndefined()
    expect(deleteJourneyBundleRepo).toHaveBeenCalled()
  })
})

describe('updateJourneyBundle — editing a published bundle frees its trigger', () => {
  it('releases the claim so another journey can take the trigger', async () => {
    getJourneyBundleById.mockResolvedValue(publishedBundle)

    await updateJourneyBundle('bot-1', 'bundle-1', 'client-1', { name: 'Renamed' })

    expect(releaseJourneyTrigger).toHaveBeenCalledWith('agent:agent-1#lead_captured', 'bundle-1')
    expect(updateJourneyBundleRepo.mock.calls[0]?.[2]).toMatchObject({ status: 'draft' })
  })

  it('does not touch the claim when the bundle was already a draft', async () => {
    getJourneyBundleById.mockResolvedValue({ ...publishedBundle, status: 'draft' })

    await updateJourneyBundle('bot-1', 'bundle-1', 'client-1', { name: 'Renamed' })

    expect(releaseJourneyTrigger).not.toHaveBeenCalled()
  })
})

describe('updateJourneyBundle — palette validation applies to edits too', () => {
  it('rejects an edit that introduces an unknown capability', async () => {
    getJourneyBundleById.mockResolvedValue({
      bundleId: 'bundle-1',
      botId: 'bot-1',
      clientId: 'client-1',
      journey: { ...journey, botId: 'bot-1', clientId: 'client-1' },
      agent,
      status: 'published',
    })

    await expect(
      updateJourneyBundle('bot-1', 'bundle-1', 'client-1', {
        agent: { ...agent, mcpToolbox: ['banana'] as never },
      })
    ).rejects.toThrow(JourneyValidationError)

    expect(updateJourneyBundleRepo).not.toHaveBeenCalled()
  })
})
