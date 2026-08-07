import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Agent } from '../types/index.js'

const getLeadById = vi.fn()
vi.mock('../repositories/lead-repository.js', () => ({ getLeadById }))

const getFormLeadById = vi.fn()
vi.mock('../repositories/form-lead-repository.js', () => ({ getFormLeadById }))

const getPublicFormConfig = vi.fn()
vi.mock('../repositories/form-repository.js', () => ({ getPublicFormConfig }))

const getMetaLeadById = vi.fn()
vi.mock('../repositories/meta-lead-repository.js', () => ({ getMetaLeadById }))

const getAgentForResource = vi.fn()
vi.mock('../repositories/agent-binding-lookup-repository.js', () => ({ getAgentForResource }))

const getAgents = vi.fn()
vi.mock('./agent-service.js', () => ({ getAgents }))

const { readJourneyLead, resolveLeadAgentContext, toLeadRef } = await import(
  './lead-resolution-service.js'
)

const agentWithWeb: Agent = {
  agentId: 'agent-1',
  clientId: 'client-1',
  name: 'Sales agent',
  channels: { web: { resourceId: 'bot-1' } },
  createdAt: 'now',
  updatedAt: 'now',
}

beforeEach(() => {
  getPublicFormConfig.mockResolvedValue(null)
  vi.clearAllMocks()
})

describe('readJourneyLead — one shape across three tables', () => {
  it('reads a chat lead by its botId', async () => {
    getLeadById.mockResolvedValue({
      leadId: 'lead-1',
      clientId: 'client-1',
      name: 'Asha',
      phone: '+919876543210',
      email: 'asha@example.com',
      propertyInterest: '3BHK',
      budgetRange: '80L-1Cr',
      sourceUrl: 'https://example.com',
    })

    await expect(readJourneyLead({ source: 'chat', botId: 'bot-1', leadId: 'lead-1' })).resolves.toMatchObject({
      leadId: 'lead-1',
      source: 'chat',
      name: 'Asha',
      phone: '+919876543210',
    })
    expect(getLeadById).toHaveBeenCalledWith('bot-1', 'lead-1')
  })

  // The case that was structurally broken before this service existed: a Meta
  // lead lives in meta_leads under a pageId and has no botId at all, so the
  // journey layer's getLeadById(botId, leadId) always returned null for it.
  it('reads a Meta lead by its pageId, which has no botId anywhere', async () => {
    getMetaLeadById.mockResolvedValue({
      leadId: 'lead-2',
      clientId: 'client-1',
      name: 'Ravi',
      phone: '+919812345678',
    })

    await expect(readJourneyLead({ source: 'meta', pageId: 'page-9', leadId: 'lead-2' })).resolves.toMatchObject({
      leadId: 'lead-2',
      source: 'meta',
      phone: '+919812345678',
    })
    expect(getMetaLeadById).toHaveBeenCalledWith('page-9', 'lead-2')
  })

  it('extracts contact fields out of a form lead’s customFields blob', async () => {
    getFormLeadById.mockResolvedValue({
      leadId: 'lead-3',
      clientId: 'client-1',
      customFields: JSON.stringify({
        'Full Name': 'Meera',
        'Mobile Number': '+919000000000',
        'Email Address': 'meera@example.com',
        'Project of interest': 'Riverside Phase 2',
        'Budget': '1Cr+',
      }),
      sourceUrl: 'https://example.com/contact',
    })

    await expect(readJourneyLead({ source: 'form', formId: 'form-1', leadId: 'lead-3' })).resolves.toMatchObject({
      source: 'form',
      name: 'Meera',
      phone: '+919000000000',
      email: 'meera@example.com',
      propertyInterest: 'Riverside Phase 2',
      budgetRange: '1Cr+',
    })
  })

  it('survives a malformed customFields blob instead of failing the journey', async () => {
    getFormLeadById.mockResolvedValue({
      leadId: 'lead-4',
      clientId: 'client-1',
      customFields: '{not json',
      sourceUrl: 'https://example.com',
    })

    const lead = await readJourneyLead({ source: 'form', formId: 'form-1', leadId: 'lead-4' })
    expect(lead).toMatchObject({ leadId: 'lead-4', source: 'form' })
    expect(lead?.phone).toBeUndefined()
  })

  it('returns null for a lead that does not exist', async () => {
    getLeadById.mockResolvedValue(null)
    await expect(readJourneyLead({ source: 'chat', botId: 'bot-1', leadId: 'nope' })).resolves.toBeNull()
  })
})

describe('resolveLeadAgentContext — chat leads resolve exactly', () => {
  it('follows the bot binding to its Agent', async () => {
    getAgentForResource.mockResolvedValue({ resourceId: 'bot-1', agentId: 'agent-1', clientId: 'client-1' })
    getAgents.mockResolvedValue([agentWithWeb])

    await expect(
      resolveLeadAgentContext({ source: 'chat', botId: 'bot-1', leadId: 'lead-1' }, 'client-1')
    ).resolves.toEqual({
      resolved: true,
      context: {
        leadRef: { source: 'chat', botId: 'bot-1', leadId: 'lead-1' },
        leadId: 'lead-1',
        clientId: 'client-1',
        agentId: 'agent-1',
        botId: 'bot-1',
      },
    })
  })

  it('reports no_agent when the bot is not wrapped in an Agent yet', async () => {
    getAgentForResource.mockResolvedValue(null)

    await expect(
      resolveLeadAgentContext({ source: 'chat', botId: 'bot-1', leadId: 'lead-1' }, 'client-1')
    ).resolves.toEqual({ resolved: false, reason: 'no_agent' })
  })

  // Cross-tenant guard: a binding row is global, so following it without
  // checking ownership would hand this client's lead to another client's Agent.
  it('refuses to follow a binding to an Agent this client does not own', async () => {
    getAgentForResource.mockResolvedValue({ resourceId: 'bot-1', agentId: 'someone-elses', clientId: 'client-2' })
    getAgents.mockResolvedValue([agentWithWeb])

    await expect(
      resolveLeadAgentContext({ source: 'chat', botId: 'bot-1', leadId: 'lead-1' }, 'client-1')
    ).resolves.toEqual({ resolved: false, reason: 'no_agent' })
  })
})

describe('resolveLeadAgentContext — sourceless leads resolve by client, and refuse to guess', () => {
  it('uses the client’s only Agent for a Meta lead', async () => {
    getAgents.mockResolvedValue([agentWithWeb])

    await expect(
      resolveLeadAgentContext({ source: 'meta', pageId: 'page-9', leadId: 'lead-2' }, 'client-1')
    ).resolves.toMatchObject({ resolved: true, context: { agentId: 'agent-1', botId: 'bot-1' } })
  })

  it('reports no_agent when the client has none', async () => {
    getAgents.mockResolvedValue([])

    await expect(
      resolveLeadAgentContext({ source: 'meta', pageId: 'page-9', leadId: 'lead-2' }, 'client-1')
    ).resolves.toEqual({ resolved: false, reason: 'no_agent' })
  })

  // Guessing here would put the wrong persona, knowledge base and calendar in
  // front of a real buyer. Refusing is the correct outcome, not a gap.
  it('refuses to guess when the client has more than one Agent', async () => {
    getAgents.mockResolvedValue([agentWithWeb, { ...agentWithWeb, agentId: 'agent-2' }])

    await expect(
      resolveLeadAgentContext({ source: 'meta', pageId: 'page-9', leadId: 'lead-2' }, 'client-1')
    ).resolves.toEqual({ resolved: false, reason: 'ambiguous_agent' })
  })

  it('reports agent_has_no_web_binding rather than inventing a botId', async () => {
    getAgents.mockResolvedValue([{ ...agentWithWeb, channels: { whatsapp: {} } }])

    await expect(
      resolveLeadAgentContext({ source: 'meta', pageId: 'page-9', leadId: 'lead-2' }, 'client-1')
    ).resolves.toEqual({ resolved: false, reason: 'agent_has_no_web_binding' })
  })
})

describe('toLeadRef', () => {
  it('routes a form lead to form_leads by formId', () => {
    expect(toLeadRef({ leadId: 'l1', botId: 'b1', leadSource: 'form', leadParentId: 'f1' })).toEqual({
      source: 'form',
      formId: 'f1',
      leadId: 'l1',
    })
  })

  it('routes a Meta lead to meta_leads by pageId', () => {
    expect(toLeadRef({ leadId: 'l1', botId: 'b1', leadSource: 'meta', leadParentId: 'p1' })).toEqual({
      source: 'meta',
      pageId: 'p1',
      leadId: 'l1',
    })
  })

  // Executions started before leadSource existed are still in flight.
  it('falls back to a chat lead under botId when leadSource is absent', () => {
    expect(toLeadRef({ leadId: 'l1', botId: 'b1' })).toEqual({
      source: 'chat',
      botId: 'b1',
      leadId: 'l1',
    })
  })

  // A source without its parent key cannot address a row, so guessing would
  // read the wrong table. Falling back to chat is at least self-consistent.
  it('falls back to chat when a source arrives without its parent key', () => {
    expect(toLeadRef({ leadId: 'l1', botId: 'b1', leadSource: 'form' })).toEqual({
      source: 'chat',
      botId: 'b1',
      leadId: 'l1',
    })
  })
})
