import { beforeEach, describe, expect, it, vi } from 'vitest'

const deleteLead = vi.fn()
const deleteFormLead = vi.fn()
const deleteMetaLead = vi.fn()
const deleteVoiceLead = vi.fn()
const deleteLeadState = vi.fn()
const deleteAllEventsForLead = vi.fn()
const deleteExecutionCountersForLead = vi.fn()
const deletePendingReply = vi.fn()
const deleteInboundActivity = vi.fn()
const stopExecution = vi.fn()
const getActiveJourneys = vi.fn()
const readJourneyLead = vi.fn()

vi.mock('../repositories/lead-repository.js', () => ({ deleteLead }))
vi.mock('../repositories/form-lead-repository.js', () => ({ deleteFormLead }))
vi.mock('../repositories/meta-lead-repository.js', () => ({ deleteMetaLead }))
vi.mock('../repositories/voice-lead-repository.js', () => ({ deleteVoiceLead }))
vi.mock('../repositories/lead-state-repository.js', () => ({ deleteLeadState }))
vi.mock('../repositories/lead-event-repository.js', () => ({ deleteAllEventsForLead }))
vi.mock('../repositories/journey-execution-repository.js', () => ({ deleteExecutionCountersForLead }))
vi.mock('../repositories/journey-pending-reply-repository.js', () => ({ deletePendingReply }))
vi.mock('../repositories/whatsapp-inbound-activity-repository.js', () => ({ deleteInboundActivity }))
vi.mock('../lib/step-functions.js', () => ({
  stopExecution,
  executionNameFor: (leadId: string, bundleId: string, version: number) => `j-${bundleId}-${leadId}-${version}`,
  executionArnFor: (smArn: string, name: string) => `${smArn.replace(':stateMachine:', ':execution:')}:${name}`,
}))
vi.mock('./journey-service.js', () => ({ getActiveJourneys }))
vi.mock('./lead-resolution-service.js', () => ({ readJourneyLead }))

const { eraseLead, LeadNotFoundError } = await import('./lead-erasure-service.js')

const chatRef = { source: 'chat', botId: 'bot-1', leadId: 'lead-1' } as const

beforeEach(() => {
  vi.clearAllMocks()
  readJourneyLead.mockResolvedValue({ leadId: 'lead-1', clientId: 'client-1' })
  getActiveJourneys.mockResolvedValue([])
  deleteAllEventsForLead.mockResolvedValue(7)
  stopExecution.mockResolvedValue(false)
  deleteLead.mockResolvedValue(true)
})

describe('eraseLead — trust boundary', () => {
  // A delete endpoint that tells a non-owner "this exists but is not yours" is
  // an existence oracle. 404 for both, exactly like getUnifiedLeadDetail.
  it('refuses another client\'s lead without touching anything', async () => {
    readJourneyLead.mockResolvedValue({ leadId: 'lead-1', clientId: 'someone-else' })

    await expect(eraseLead(chatRef, 'client-1')).rejects.toBeInstanceOf(LeadNotFoundError)
    expect(deleteAllEventsForLead).not.toHaveBeenCalled()
    expect(deleteLead).not.toHaveBeenCalled()
  })

  it('refuses a lead that does not exist', async () => {
    readJourneyLead.mockResolvedValue(null)

    await expect(eraseLead(chatRef, 'client-1')).rejects.toBeInstanceOf(LeadNotFoundError)
    expect(deleteLeadState).not.toHaveBeenCalled()
  })
})

describe('eraseLead — ordering is the design', () => {
  // The lead row is the ONLY thing that can still address the side-table rows.
  // Deleting it first would strand every one of them with no way to find them
  // again, turning a retryable partial failure into permanent orphans.
  it('deletes the lead row LAST, after every side table', async () => {
    const order: string[] = []
    deletePendingReply.mockImplementation(async () => void order.push('pending'))
    deleteInboundActivity.mockImplementation(async () => void order.push('whatsapp'))
    deleteExecutionCountersForLead.mockImplementation(async () => void order.push('counters'))
    deleteAllEventsForLead.mockImplementation(async () => {
      order.push('events')
      return 7
    })
    deleteLeadState.mockImplementation(async () => void order.push('state'))
    deleteLead.mockImplementation(async () => {
      order.push('lead')
      return true
    })

    await eraseLead(chatRef, 'client-1')

    expect(order[order.length - 1]).toBe('lead')
    expect(order).toEqual(['pending', 'whatsapp', 'counters', 'events', 'state', 'lead'])
  })

  // Stopping first means nothing writes new rows into tables we are midway
  // through emptying.
  it('stops journeys before it deletes anything', async () => {
    const order: string[] = []
    getActiveJourneys.mockResolvedValue([
      { bundleId: 'b1', publishedVersion: 2, compiledStateMachineArn: 'arn:aws:states:r:a:stateMachine:sm1' },
    ])
    stopExecution.mockImplementation(async () => {
      order.push('stop')
      return true
    })
    deletePendingReply.mockImplementation(async () => void order.push('delete'))

    await eraseLead(chatRef, 'client-1')

    expect(order[0]).toBe('stop')
  })
})

describe('eraseLead — stopping journeys', () => {
  // The execution name is a deterministic hash of leadId:bundleId:version, so
  // it can be recomputed rather than searched for.
  it('derives this lead\'s execution arn per live journey and stops it', async () => {
    getActiveJourneys.mockResolvedValue([
      { bundleId: 'b1', publishedVersion: 3, compiledStateMachineArn: 'arn:aws:states:r:a:stateMachine:sm1' },
    ])
    stopExecution.mockResolvedValue(true)

    const report = await eraseLead(chatRef, 'client-1')

    expect(stopExecution).toHaveBeenCalledWith(
      'arn:aws:states:r:a:execution:sm1:j-b1-lead-1-3',
      expect.stringContaining('erased')
    )
    expect(report.executionsStopped).toBe(1)
  })

  it('skips a journey that was never provisioned', async () => {
    getActiveJourneys.mockResolvedValue([{ bundleId: 'b1', publishedVersion: 1 }])

    await eraseLead(chatRef, 'client-1')

    expect(stopExecution).not.toHaveBeenCalled()
  })

  // The deletion is the obligation; stopping is best-effort cleanup on top. A
  // journey we cannot enumerate must not block someone's erasure.
  it('still erases when journeys cannot be listed', async () => {
    getActiveJourneys.mockRejectedValue(new Error('Dynamo unavailable'))

    const report = await eraseLead(chatRef, 'client-1')

    expect(report.eventsDeleted).toBe(7)
    expect(deleteLead).toHaveBeenCalled()
  })
})

describe('eraseLead — three lead tables, three key shapes', () => {
  it('deletes a chat lead by botId', async () => {
    await eraseLead(chatRef, 'client-1')
    expect(deleteLead).toHaveBeenCalledWith('bot-1', 'lead-1')
  })

  it('deletes a form lead by formId', async () => {
    await eraseLead({ source: 'form', formId: 'form-1', leadId: 'lead-1' }, 'client-1')
    expect(deleteFormLead).toHaveBeenCalledWith('form-1', 'lead-1')
    expect(deleteLead).not.toHaveBeenCalled()
  })

  // Meta leads are partitioned by clientId, NOT by the pageId on the LeadRef --
  // pageId is a discriminator, never an address.
  it('deletes a Meta lead by clientId, not by pageId', async () => {
    await eraseLead({ source: 'meta', pageId: 'page-1', leadId: 'lead-1' }, 'client-1')
    expect(deleteMetaLead).toHaveBeenCalledWith('client-1', 'lead-1')
  })
})

describe('eraseLead — report', () => {
  it('reports how much history was destroyed', async () => {
    deleteAllEventsForLead.mockResolvedValue(23)

    const report = await eraseLead(chatRef, 'client-1')

    expect(report).toMatchObject({ leadId: 'lead-1', source: 'chat', eventsDeleted: 23 })
  })
})

describe('erasing a voice lead', () => {
  const voiceRef = { source: 'voice', agentId: 'agent-1', leadId: 'lead-1' } as const

  it('deletes the voice_leads row', async () => {
    // Missing until 2026-09-08. Without it the row survived an erasure that
    // reported success -- and reported it AFTER destroying the events and
    // state that were the only way to find the leftover.
    await eraseLead(voiceRef, 'client-1')

    expect(deleteVoiceLead).toHaveBeenCalledWith('client-1', 'lead-1')
  })

  it('is addressed by clientId, since voice_leads is partitioned that way', async () => {
    await eraseLead(voiceRef, 'client-1')

    // Not by agentId -- that is a discriminator on the ref, never an address.
    expect(deleteVoiceLead).not.toHaveBeenCalledWith('agent-1', 'lead-1')
  })

  it('clears the side tables too, and reports what it did', async () => {
    const report = await eraseLead(voiceRef, 'client-1')

    expect(deletePendingReply).toHaveBeenCalledWith('lead-1')
    expect(deleteInboundActivity).toHaveBeenCalledWith('lead-1')
    expect(deleteExecutionCountersForLead).toHaveBeenCalledWith('lead-1')
    expect(deleteAllEventsForLead).toHaveBeenCalledWith('lead-1')
    expect(deleteLeadState).toHaveBeenCalledWith('lead-1')
    expect(report).toMatchObject({ leadId: 'lead-1', source: 'voice', eventsDeleted: 7 })
  })

  it('still refuses a voice lead owned by someone else', async () => {
    readJourneyLead.mockResolvedValue({ leadId: 'lead-1', clientId: 'someone-else' })

    await expect(eraseLead(voiceRef, 'client-1')).rejects.toBeInstanceOf(LeadNotFoundError)
    expect(deleteVoiceLead).not.toHaveBeenCalled()
  })

  // Every source the LeadRef union declares must be handled here. The switch
  // returns void, so before the never-guard a missing case compiled cleanly and
  // silently skipped the delete -- which is exactly how voice went unhandled.
  it('handles every source the union declares', async () => {
    const refs = [
      { ref: { source: 'chat', botId: 'bot-1', leadId: 'lead-1' } as const, deleter: deleteLead },
      { ref: { source: 'form', formId: 'form-1', leadId: 'lead-1' } as const, deleter: deleteFormLead },
      { ref: { source: 'meta', pageId: 'page-1', leadId: 'lead-1' } as const, deleter: deleteMetaLead },
      { ref: { source: 'voice', agentId: 'agent-1', leadId: 'lead-1' } as const, deleter: deleteVoiceLead },
    ]

    for (const { ref, deleter } of refs) {
      vi.clearAllMocks()
      readJourneyLead.mockResolvedValue({ leadId: 'lead-1', clientId: 'client-1' })
      getActiveJourneys.mockResolvedValue([])
      deleteAllEventsForLead.mockResolvedValue(0)

      await eraseLead(ref, 'client-1')
      expect(deleter, `${ref.source} lead row deleted`).toHaveBeenCalledTimes(1)
    }
  })
})
