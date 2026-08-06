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

const resolveOwningAgentId = vi.fn()
vi.mock('./agent-service.js', () => ({ resolveOwningAgentId }))

// journey-compiler-service is deliberately NOT mocked: compiling for real is
// what makes these tests prove the whole create/update validation chain
// (palette -> toolbox coverage -> step-graph structure) rather than just the
// bookkeeping around it.
const { createJourneyBundle, JourneyValidationError, updateJourneyBundle } = await import('./journey-service.js')
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
})

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
