import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentConfig, JourneyDefinition } from '../types/index.js'

const createJourneyBundleRepo = vi.fn()
const deleteJourneyBundleRepo = vi.fn()
const getJourneyBundleById = vi.fn()
const getJourneyBundlesByBotId = vi.fn()
const updateJourneyBundleRepo = vi.fn()
class JourneyBundleStateConflictError extends Error {
  constructor(
    readonly bundleId: string,
    readonly expectedStatus: string
  ) {
    super(`Journey bundle ${bundleId} is no longer ${expectedStatus}`)
    this.name = 'JourneyBundleStateConflictError'
  }
}
vi.mock('../repositories/journey-repository.js', () => ({
  createJourneyBundle: createJourneyBundleRepo,
  deleteJourneyBundle: deleteJourneyBundleRepo,
  getJourneyBundleById,
  getJourneyBundlesByBotId,
  updateJourneyBundle: updateJourneyBundleRepo,
  JourneyBundleStateConflictError,
}))

const getBotConfig = vi.fn()
vi.mock('./bot-service.js', () => ({ getBotConfig }))

const getBotsByClientId = vi.fn()
vi.mock('../repositories/bot-repository.js', () => ({ getBotsByClientId }))

const getEventsByBundleId = vi.fn()
vi.mock('../repositories/lead-event-repository.js', () => ({ getEventsByBundleId }))

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
  pauseJourneyBundle,
  summariseExecutions,
  getActiveJourneys,
  getJourneyExecutions,
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
  getBotsByClientId.mockReset()
  getEventsByBundleId.mockReset()
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
    expect(updateJourneyBundleRepo).toHaveBeenCalledWith(
      'bot-1',
      'bundle-1',
      {
        status: 'published',
        compiledStateMachineArn: 'arn:aws:states:ap-south-1:1:stateMachine:sm',
        compiledStateMachineVersionArn: 'arn:aws:states:ap-south-1:1:stateMachine:sm:1',
        publishedVersion: 1,
      },
      // The status this call read: the write is conditional on the bundle not
      // having moved underneath it (see the pause/publish race tests below).
      'draft'
    )
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

describe('pauseJourneyBundle', () => {
  it('releases the trigger claim and marks the bundle paused', async () => {
    getJourneyBundleById.mockResolvedValue(publishedBundle)

    await pauseJourneyBundle('bot-1', 'bundle-1', 'client-1')

    expect(releaseJourneyTrigger).toHaveBeenCalledWith('agent:agent-1#lead_captured', 'bundle-1')
    // The 4th argument is the guard, not decoration: it makes the write
    // conditional on the bundle still being published.
    expect(updateJourneyBundleRepo).toHaveBeenCalledWith('bot-1', 'bundle-1', { status: 'paused' }, 'published')
  })

  // REGRESSION (ship review + Codex, both independently). Pause and publish are
  // each a claim write plus a status write, and nothing serialises the four.
  // The interleaving publish-claims -> pause-releases -> pause-writes-paused ->
  // publish-writes-published used to end with status 'published' and NO trigger
  // claim: the dashboard shows a green Live dot on a journey no lead can enter,
  // and nothing surfaces the contradiction. The conditional write turns that
  // silent corruption into a 400.
  it('fails as a validation error when the bundle stopped being published mid-flight', async () => {
    getJourneyBundleById.mockResolvedValue(publishedBundle)
    updateJourneyBundleRepo.mockRejectedValue(new JourneyBundleStateConflictError('bundle-1', 'published'))

    await expect(pauseJourneyBundle('bot-1', 'bundle-1', 'client-1')).rejects.toBeInstanceOf(JourneyValidationError)
  })

  // A genuine infrastructure failure must NOT be laundered into a 400 — that
  // would tell the client their journey was in the wrong state when DynamoDB
  // was simply unreachable.
  it('lets a non-conflict repository failure propagate', async () => {
    getJourneyBundleById.mockResolvedValue(publishedBundle)
    updateJourneyBundleRepo.mockRejectedValue(new Error('DynamoDB unavailable'))

    await expect(pauseJourneyBundle('bot-1', 'bundle-1', 'client-1')).rejects.toThrow('DynamoDB unavailable')
  })

  // The whole point of pause over delete: leads mid-journey keep running,
  // which they cannot do if the state machine is torn down.
  it('leaves the compiled state machine in place', async () => {
    getJourneyBundleById.mockResolvedValue({
      ...publishedBundle,
      compiledStateMachineArn: 'arn:aws:states:ap-south-1:1:stateMachine:sm',
    })

    await pauseJourneyBundle('bot-1', 'bundle-1', 'client-1')

    expect(deleteStateMachine).not.toHaveBeenCalled()
    const patch = updateJourneyBundleRepo.mock.calls[0][2] as Record<string, unknown>
    expect(patch).not.toHaveProperty('compiledStateMachineArn')
    expect(patch).not.toHaveProperty('compiledStateMachineVersionArn')
  })

  // A draft holds no claim, so "pausing" one would release a trigger a
  // different published bundle may legitimately hold.
  it('rejects pausing a bundle that is not published', async () => {
    getJourneyBundleById.mockResolvedValue({ ...publishedBundle, status: 'draft' })

    await expect(pauseJourneyBundle('bot-1', 'bundle-1', 'client-1')).rejects.toBeInstanceOf(JourneyValidationError)
    expect(releaseJourneyTrigger).not.toHaveBeenCalled()
    expect(updateJourneyBundleRepo).not.toHaveBeenCalled()
  })

  // REGRESSION (Codex structured review, P1). The first fix guarded only the
  // pause side, which left the MIRROR interleaving open: publish claims ->
  // pause releases -> pause writes paused -> publish writes published, ending
  // at status 'published' with no trigger claim. Publish's write is now
  // conditional on the status IT read, so the loser fails instead. What the
  // loser then does with the claim is the pair of tests below — it depends on
  // whether anything actually ended up published.
  // REGRESSION (Codex, cycle 3). The cycle-2 compensation released the claim on
  // ANY conflict. But claimJourneyTrigger lets the same bundleId re-claim, so
  // two concurrent publishes of one bundle both hold it — and the loser's blind
  // cleanup deleted the WINNER's claim, producing exactly the published-with-no-
  // claim corruption the guard was added to prevent. The fix re-reads first.
  it('does NOT release the claim when a concurrent publish of the same bundle won', async () => {
    getJourneyBundleById
      .mockResolvedValueOnce({ ...publishedBundle, status: 'paused' })
      .mockResolvedValueOnce(publishedBundle)
    updateJourneyBundleRepo.mockRejectedValue(new JourneyBundleStateConflictError('bundle-1', 'paused'))

    await expect(publishJourneyBundle('bot-1', 'bundle-1', 'client-1')).rejects.toBeInstanceOf(
      JourneyValidationError
    )
    expect(releaseJourneyTrigger).not.toHaveBeenCalled()
  })

  it('releases the claim when the conflict left nothing published', async () => {
    getJourneyBundleById
      .mockResolvedValueOnce({ ...publishedBundle, status: 'draft' })
      .mockResolvedValueOnce({ ...publishedBundle, status: 'paused' })
    updateJourneyBundleRepo.mockRejectedValue(new JourneyBundleStateConflictError('bundle-1', 'draft'))

    await expect(publishJourneyBundle('bot-1', 'bundle-1', 'client-1')).rejects.toBeInstanceOf(
      JourneyValidationError
    )
    expect(releaseJourneyTrigger).toHaveBeenCalledWith('agent:agent-1#lead_captured', 'bundle-1')
  })

  // Publish is entered from draft, paused AND published, so the guard has to be
  // the status this call read — a hardcoded value would break two of the three.
  it('guards the publish write with the status it actually read', async () => {
    getJourneyBundleById.mockResolvedValue({ ...publishedBundle, status: 'paused' })

    await publishJourneyBundle('bot-1', 'bundle-1', 'client-1')

    expect(updateJourneyBundleRepo).toHaveBeenCalledWith(
      'bot-1',
      'bundle-1',
      expect.objectContaining({ status: 'published' }),
      'paused'
    )
  })

  // The claim is released before the status write, so a failed write leaves the
  // one state that lies: reads as published, ignites nothing.
  it('restores the trigger claim when the paused status write fails outright', async () => {
    getJourneyBundleById.mockResolvedValue(publishedBundle)
    updateJourneyBundleRepo.mockRejectedValue(new Error('DynamoDB unavailable'))

    await expect(pauseJourneyBundle('bot-1', 'bundle-1', 'client-1')).rejects.toThrow('DynamoDB unavailable')
    expect(claimJourneyTrigger).toHaveBeenCalledWith('agent:agent-1#lead_captured', {
      bundleId: 'bundle-1',
      botId: 'bot-1',
      clientId: 'client-1',
    })
  })

  // A conflict means someone else legitimately owns the trigger now; putting
  // the claim back would steal it, or resurrect it for a deleted bundle.
  it('does NOT restore the claim when the write lost to another writer', async () => {
    getJourneyBundleById.mockResolvedValue(publishedBundle)
    updateJourneyBundleRepo.mockRejectedValue(new JourneyBundleStateConflictError('bundle-1', 'published'))

    await expect(pauseJourneyBundle('bot-1', 'bundle-1', 'client-1')).rejects.toBeInstanceOf(
      JourneyValidationError
    )
    expect(claimJourneyTrigger).not.toHaveBeenCalled()
  })

  // Resuming is publish again: the claim must come back, or the journey would
  // read as live while nothing ignites into it.
  it('re-claims the trigger when a paused bundle is published again', async () => {
    getJourneyBundleById.mockResolvedValue({ ...publishedBundle, status: 'paused' })

    const result = await publishJourneyBundle('bot-1', 'bundle-1', 'client-1')

    expect(claimJourneyTrigger).toHaveBeenCalledWith('agent:agent-1#lead_captured', {
      bundleId: 'bundle-1',
      botId: 'bot-1',
      clientId: 'client-1',
    })
    expect(result).toMatchObject({ status: 'published' })
  })
})

// The grouping is the only real logic in the executions read path, and it is
// what turns "240 rows" into "12 runs, 3 still going, 1 failed".
describe('summariseExecutions', () => {
  const ev = (leadId: string, iso: string, type: string, extra: Record<string, unknown> = {}) =>
    ({ leadId, ts: `${iso}#${leadId}-${type}`, clientId: 'client-1', botId: 'bot-1', type, bundleId: 'bundle-1', ...extra }) as never

  it('groups events per lead and counts them', () => {
    const out = summariseExecutions(
      [
        ev('lead-a', '2026-08-29T10:00:00.000Z', 'journey_started'),
        ev('lead-a', '2026-08-29T10:01:00.000Z', 'message_out'),
        ev('lead-b', '2026-08-29T09:00:00.000Z', 'journey_started'),
      ],
      'bundle-1'
    )

    expect(out).toHaveLength(2)
    expect(out.find((e) => e.leadId === 'lead-a')?.eventCount).toBe(2)
  })

  // Absent a terminal event this is an INFERENCE, not a fact — a run that died
  // before terminal events existed looks exactly the same. Inventing an outcome
  // here would be the same lie the missing journey_ended write used to tell.
  it('reports running when no terminal event exists', () => {
    const out = summariseExecutions([ev('lead-a', '2026-08-29T10:00:00.000Z', 'journey_started')], 'bundle-1')
    expect(out[0].status).toBe('running')
  })

  it('takes the outcome from the terminal event', () => {
    const out = summariseExecutions(
      [
        ev('lead-a', '2026-08-29T10:00:00.000Z', 'journey_started'),
        ev('lead-a', '2026-08-29T10:05:00.000Z', 'journey_ended', {
          outcome: 'failed',
          errorDetail: 'States.TaskFailed: boom',
          executionArn: 'arn:exec-1',
        }),
      ],
      'bundle-1'
    )

    expect(out[0]).toMatchObject({
      status: 'failed',
      errorDetail: 'States.TaskFailed: boom',
      executionArn: 'arn:exec-1',
      startedAt: '2026-08-29T10:00:00.000Z',
      lastEventAt: '2026-08-29T10:05:00.000Z',
    })
  })

  // getEventsByBundleId returns newest-first, so first/last must not depend on
  // the order the caller happened to receive.
  it('derives startedAt and lastEventAt regardless of input order', () => {
    const out = summariseExecutions(
      [
        ev('lead-a', '2026-08-29T12:00:00.000Z', 'message_out'),
        ev('lead-a', '2026-08-29T08:00:00.000Z', 'journey_started'),
      ],
      'bundle-1'
    )

    expect(out[0].startedAt).toBe('2026-08-29T08:00:00.000Z')
    expect(out[0].lastEventAt).toBe('2026-08-29T12:00:00.000Z')
  })

  it('puts the most recently active run first', () => {
    const out = summariseExecutions(
      [
        ev('old', '2026-08-01T00:00:00.000Z', 'journey_started'),
        ev('new', '2026-08-29T00:00:00.000Z', 'journey_started'),
      ],
      'bundle-1'
    )

    expect(out.map((e) => e.leadId)).toEqual(['new', 'old'])
  })
})

describe('getActiveJourneys', () => {
  it('returns live and paused journeys across every bot, drafts excluded', async () => {
    getBotsByClientId.mockResolvedValue([{ botId: 'bot-1' }, { botId: 'bot-2' }])
    getJourneyBundlesByBotId.mockImplementation(async (botId: string) =>
      botId === 'bot-1'
        ? [
            { ...publishedBundle, bundleId: 'live-1', clientId: 'client-1', status: 'published', updatedAt: '2026-08-02' },
            { ...publishedBundle, bundleId: 'draft-1', clientId: 'client-1', status: 'draft', updatedAt: '2026-08-03' },
          ]
        : [{ ...publishedBundle, bundleId: 'paused-1', clientId: 'client-1', status: 'paused', updatedAt: '2026-08-05' }]
    )

    const out = await getActiveJourneys('client-1')

    // Live before paused, drafts gone entirely.
    expect(out.map((b) => b.bundleId)).toEqual(['live-1', 'paused-1'])
  })

  // The operator is using this to find what is running. One unreadable bot
  // should cost that bot's row, not the whole index.
  it('degrades to a partial answer when one bot fails to read', async () => {
    getBotsByClientId.mockResolvedValue([{ botId: 'bot-1' }, { botId: 'bot-broken' }])
    getJourneyBundlesByBotId.mockImplementation(async (botId: string) => {
      if (botId === 'bot-broken') throw new Error('Dynamo unavailable')
      return [{ ...publishedBundle, bundleId: 'live-1', clientId: 'client-1', status: 'published', updatedAt: '2026-08-02' }]
    })

    const out = await getActiveJourneys('client-1')
    expect(out.map((b) => b.bundleId)).toEqual(['live-1'])
  })
})

describe('getJourneyExecutions — ownership', () => {
  // SECURITY. The bundleId-ts GSI is partitioned by bundleId ALONE, with no
  // clientId in the key. Without this check a caller who guessed or leaked a
  // bundleId would read another client's lead activity straight out of the
  // index. The ownership check must therefore run BEFORE the events are read,
  // not as a filter afterwards.
  it('refuses a bundle the caller does not own, and never touches the index', async () => {
    getJourneyBundleById.mockResolvedValue({ ...publishedBundle, clientId: 'someone-else' })

    await expect(getJourneyExecutions('bot-1', 'bundle-1', 'client-1')).rejects.toThrow('Journey bundle not found')
    expect(getEventsByBundleId).not.toHaveBeenCalled()
  })

  it('refuses a bundle that does not exist', async () => {
    getJourneyBundleById.mockResolvedValue(null)

    await expect(getJourneyExecutions('bot-1', 'bundle-1', 'client-1')).rejects.toThrow('Journey bundle not found')
    expect(getEventsByBundleId).not.toHaveBeenCalled()
  })

  it('reads the index once ownership is established, honouring the limit', async () => {
    getJourneyBundleById.mockResolvedValue(publishedBundle)
    getEventsByBundleId.mockResolvedValue([])

    await getJourneyExecutions('bot-1', 'bundle-1', 'client-1', 25)

    expect(getEventsByBundleId).toHaveBeenCalledWith('bundle-1', 25)
  })
})
