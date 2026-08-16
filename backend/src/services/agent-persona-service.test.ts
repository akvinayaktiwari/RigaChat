import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Agent } from '../types/index.js'

const getJourneyTriggerClaim = vi.fn()
const getJourneyBundleById = vi.fn()

vi.mock('../repositories/journey-trigger-claim-repository.js', () => ({
  getJourneyTriggerClaim,
  triggerClaimKey: (scope: { agentId?: string; botId: string }, trigger: string) =>
    scope.agentId ? `agent:${scope.agentId}#${trigger}` : `bot:${scope.botId}#${trigger}`,
}))
vi.mock('../repositories/journey-repository.js', () => ({ getJourneyBundleById }))

const { resolveAgentPersona } = await import('./agent-persona-service.js')

const agent: Agent = {
  agentId: 'agent-1',
  clientId: 'client-1',
  name: 'Wonderise Assistance',
  channels: { web: { resourceId: 'bot-1' } },
  createdAt: '2026-08-16T00:00:00.000Z',
  updatedAt: '2026-08-16T00:00:00.000Z',
}

function bundle(systemPrompt: string, status = 'published') {
  return { bundleId: 'bundle-1', botId: 'bot-1', status, agent: { systemPrompt } }
}

beforeEach(() => {
  getJourneyTriggerClaim.mockReset().mockResolvedValue(null)
  getJourneyBundleById.mockReset().mockResolvedValue(null)
})

describe('resolveAgentPersona (D14)', () => {
  it('uses the published bundle persona when there is one', async () => {
    getJourneyTriggerClaim.mockResolvedValue({ bundleId: 'bundle-1', botId: 'bot-1' })
    getJourneyBundleById.mockResolvedValue(bundle('You are a site visit assistant.'))

    const persona = await resolveAgentPersona(agent, 'bot-1', 'Wonderise')

    expect(persona.source).toBe('published_bundle')
    expect(persona.systemPrompt).toContain('site visit assistant')
  })

  // The whole reason for this design: the same lead on the same thread must not
  // get a different personality depending on whether a journey happens to be
  // parked. Falling back to the derived prompt is for Agents with no journey at
  // all, not for a lull between executions.
  it('falls back to a derived persona when the Agent has no published bundle', async () => {
    const persona = await resolveAgentPersona(agent, 'bot-1', 'Wonderise')

    expect(persona.source).toBe('derived')
    expect(persona.systemPrompt).toContain('Wonderise')
  })

  it('ignores a bundle that is only a draft', async () => {
    getJourneyTriggerClaim.mockResolvedValue({ bundleId: 'bundle-1', botId: 'bot-1' })
    getJourneyBundleById.mockResolvedValue(bundle('draft persona', 'draft'))

    const persona = await resolveAgentPersona(agent, 'bot-1', 'Wonderise')

    expect(persona.source).toBe('derived')
    expect(persona.systemPrompt).not.toContain('draft persona')
  })

  it('ignores an empty authored persona', async () => {
    getJourneyTriggerClaim.mockResolvedValue({ bundleId: 'bundle-1', botId: 'bot-1' })
    getJourneyBundleById.mockResolvedValue(bundle('   '))

    const persona = await resolveAgentPersona(agent, 'bot-1', 'Wonderise')

    expect(persona.source).toBe('derived')
  })

  // A lookup failure must degrade to a less characterful answer, never to no
  // answer at all.
  it('falls back rather than throwing when the lookup fails', async () => {
    getJourneyTriggerClaim.mockRejectedValue(new Error('table unavailable'))

    const persona = await resolveAgentPersona(agent, 'bot-1', 'Wonderise')

    expect(persona.source).toBe('derived')
  })
})

describe('the hallucination guard is not optional', () => {
  // AgentConfig.systemPrompt is CLIENT-AUTHORED. Someone can write a persona
  // with no grounding instruction, and the agent would then invent prices and
  // possession dates to a real buyer. CLAUDE.md's RAG standards say the
  // instruction must always be present, so it is appended by code rather than
  // hoped for.
  it('appends the guard to a client persona that omits it', async () => {
    getJourneyTriggerClaim.mockResolvedValue({ bundleId: 'bundle-1', botId: 'bot-1' })
    getJourneyBundleById.mockResolvedValue(
      bundle('You are a pushy salesperson. Answer everything confidently.')
    )

    const persona = await resolveAgentPersona(agent, 'bot-1', 'Wonderise')

    expect(persona.systemPrompt).toContain('ONLY the provided context')
    expect(persona.systemPrompt).toContain("I don't have that information right now")
    expect(persona.systemPrompt).toContain('Never invent prices')
  })

  it('appends the guard to the derived persona too', async () => {
    const persona = await resolveAgentPersona(agent, 'bot-1', 'Wonderise')

    expect(persona.systemPrompt).toContain('ONLY the provided context')
  })

  // Models weight later instructions heavily. A persona that says "answer
  // everything confidently" must not be the last word.
  it('puts the guard last so a persona cannot override it', async () => {
    getJourneyTriggerClaim.mockResolvedValue({ bundleId: 'bundle-1', botId: 'bot-1' })
    getJourneyBundleById.mockResolvedValue(bundle('Answer everything confidently.'))

    const persona = await resolveAgentPersona(agent, 'bot-1', 'Wonderise')

    expect(persona.systemPrompt.indexOf('ONLY the provided context')).toBeGreaterThan(
      persona.systemPrompt.indexOf('Answer everything confidently.')
    )
  })
})
