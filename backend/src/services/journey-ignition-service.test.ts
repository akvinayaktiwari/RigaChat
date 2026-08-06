import { beforeEach, describe, expect, it, vi } from 'vitest'

const getJourneyBundleById = vi.fn()
vi.mock('../repositories/journey-repository.js', () => ({ getJourneyBundleById }))

const getJourneyTriggerClaim = vi.fn()
vi.mock('../repositories/journey-trigger-claim-repository.js', () => ({
  getJourneyTriggerClaim,
  triggerClaimKey: (scope: { agentId?: string; botId: string }, trigger: string) =>
    scope.agentId ? `agent:${scope.agentId}#${trigger}` : `bot:${scope.botId}#${trigger}`,
}))

const startExecution = vi.fn()
vi.mock('../lib/step-functions.js', () => ({
  startExecution,
  executionNameFor: (leadId: string, bundleId: string, version: number) => `j-${bundleId}-${leadId}-v${version}`,
}))

const resolveLeadAgentContext = vi.fn()
vi.mock('./lead-resolution-service.js', () => ({ resolveLeadAgentContext }))

const { igniteJourneysForLead } = await import('./journey-ignition-service.js')

const resolvedContext = {
  resolved: true as const,
  context: {
    leadRef: { source: 'meta' as const, pageId: 'page-9', leadId: 'lead-1' },
    leadId: 'lead-1',
    clientId: 'client-1',
    agentId: 'agent-1',
    botId: 'bot-1',
  },
}

const publishedBundle = {
  bundleId: 'bundle-1',
  botId: 'bot-1',
  clientId: 'client-1',
  status: 'published',
  publishedVersion: 2,
  compiledStateMachineVersionArn: 'arn:sm:2',
  agent: { channelConfig: { whatsapp: {} } },
}

const metaLeadRef = { source: 'meta' as const, pageId: 'page-9', leadId: 'lead-1' }

beforeEach(() => {
  vi.clearAllMocks()
  resolveLeadAgentContext.mockResolvedValue(resolvedContext)
  getJourneyTriggerClaim.mockResolvedValue({ claimKey: 'agent:agent-1#lead_captured', bundleId: 'bundle-1', botId: 'bot-1' })
  getJourneyBundleById.mockResolvedValue(publishedBundle)
  startExecution.mockResolvedValue({ started: true, executionArn: 'arn:exec:1' })
})

describe('igniteJourneysForLead — the happy path that did not exist before', () => {
  it('starts an execution against the immutable published version arn', async () => {
    const outcome = await igniteJourneysForLead({ leadRef: metaLeadRef, clientId: 'client-1' })

    expect(outcome).toEqual({
      status: 'started',
      bundleId: 'bundle-1',
      executionArn: 'arn:exec:1',
      journeyVersion: 2,
    })
    // Starting against the plain stateMachineArn would let an execution run a
    // stale definition while our records label it version 2.
    expect(startExecution.mock.calls[0]?.[0]).toBe('arn:sm:2')
  })

  it('carries the lead’s source and parent key so a Meta lead is readable downstream', async () => {
    await igniteJourneysForLead({ leadRef: metaLeadRef, clientId: 'client-1' })

    expect(startExecution.mock.calls[0]?.[2]).toEqual({
      botId: 'bot-1',
      bundleId: 'bundle-1',
      clientId: 'client-1',
      leadId: 'lead-1',
      channel: 'whatsapp',
      leadSource: 'meta',
      leadParentId: 'page-9',
      journeyVersion: 2,
    })
  })

  it('uses the right parent key for each lead source', async () => {
    await igniteJourneysForLead({ leadRef: { source: 'chat', botId: 'bot-7', leadId: 'l' }, clientId: 'client-1' })
    expect(startExecution.mock.calls[0]?.[2]).toMatchObject({ leadSource: 'chat', leadParentId: 'bot-7' })

    vi.clearAllMocks()
    resolveLeadAgentContext.mockResolvedValue(resolvedContext)
    getJourneyTriggerClaim.mockResolvedValue({ bundleId: 'bundle-1', botId: 'bot-1' })
    getJourneyBundleById.mockResolvedValue(publishedBundle)
    startExecution.mockResolvedValue({ started: true, executionArn: 'arn:exec:1' })

    await igniteJourneysForLead({ leadRef: { source: 'form', formId: 'form-3', leadId: 'l' }, clientId: 'client-1' })
    expect(startExecution.mock.calls[0]?.[2]).toMatchObject({ leadSource: 'form', leadParentId: 'form-3' })
  })

  it('uses a deterministic execution name so a retry cannot double-message a lead', async () => {
    await igniteJourneysForLead({ leadRef: metaLeadRef, clientId: 'client-1' })
    const firstName = startExecution.mock.calls[0]?.[1]

    await igniteJourneysForLead({ leadRef: metaLeadRef, clientId: 'client-1' })
    expect(startExecution.mock.calls[1]?.[1]).toBe(firstName)
  })

  it('reports already_started rather than treating idempotency as a failure', async () => {
    startExecution.mockResolvedValue({ started: false, reason: 'already_started' })

    await expect(igniteJourneysForLead({ leadRef: metaLeadRef, clientId: 'client-1' })).resolves.toEqual({
      status: 'already_started',
      bundleId: 'bundle-1',
    })
  })
})

describe('igniteJourneysForLead — every miss is reported, never silent', () => {
  it('passes through the resolution failure reason', async () => {
    resolveLeadAgentContext.mockResolvedValue({ resolved: false, reason: 'ambiguous_agent' })

    await expect(igniteJourneysForLead({ leadRef: metaLeadRef, clientId: 'client-1' })).resolves.toEqual({
      status: 'no_match',
      reason: 'ambiguous_agent',
    })
    expect(startExecution).not.toHaveBeenCalled()
  })

  it('reports no_published_journey when nothing holds the trigger', async () => {
    getJourneyTriggerClaim.mockResolvedValue(null)

    await expect(igniteJourneysForLead({ leadRef: metaLeadRef, clientId: 'client-1' })).resolves.toEqual({
      status: 'no_match',
      reason: 'no_published_journey',
    })
  })

  // The claim can outlive its bundle, or the bundle can be edited back to draft
  // between the two reads. Reported, not silently repaired.
  it('reports journey_not_published when the claim outlived its bundle', async () => {
    getJourneyBundleById.mockResolvedValue(null)

    await expect(igniteJourneysForLead({ leadRef: metaLeadRef, clientId: 'client-1' })).resolves.toMatchObject({
      status: 'no_match',
      reason: 'journey_not_published',
    })
  })

  it('reports journey_not_published for a bundle with no published version arn', async () => {
    getJourneyBundleById.mockResolvedValue({ ...publishedBundle, compiledStateMachineVersionArn: undefined })

    await expect(igniteJourneysForLead({ leadRef: metaLeadRef, clientId: 'client-1' })).resolves.toMatchObject({
      status: 'no_match',
      reason: 'journey_not_published',
    })
  })
})

describe('igniteJourneysForLead — never throws, because lead capture depends on it', () => {
  // If this rejected, captureLead's catch would rethrow "Failed to capture
  // lead" and the widget would tell a real visitor their details were lost,
  // when they were already saved.
  it('converts a Step Functions outage into a structured failure', async () => {
    startExecution.mockRejectedValue(new Error('Throttled'))

    await expect(igniteJourneysForLead({ leadRef: metaLeadRef, clientId: 'client-1' })).resolves.toEqual({
      status: 'failed',
      reason: 'Throttled',
    })
  })

  it('converts a resolution outage into a structured failure', async () => {
    resolveLeadAgentContext.mockRejectedValue(new Error('DynamoDB unavailable'))

    await expect(igniteJourneysForLead({ leadRef: metaLeadRef, clientId: 'client-1' })).resolves.toMatchObject({
      status: 'failed',
    })
  })
})
