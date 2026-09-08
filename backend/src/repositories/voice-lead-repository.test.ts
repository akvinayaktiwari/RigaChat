import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the DynamoDB boundary. getTableName runs at module load, so it is
// stubbed here rather than depending on the prefix vitest.config.ts sets.
const send = vi.fn()
vi.mock('./dynamo-client.js', () => ({
  dynamoClient: { send },
  getTableName: () => 'test-voice_leads',
}))

vi.mock('uuid', () => ({ v4: () => 'generated-lead-id' }))

const { createVoiceLead, getVoiceLeadById, getVoiceLeadsByClientId, deleteVoiceLead } =
  await import('./voice-lead-repository.js')

const INPUT = {
  agentId: 'agent-1',
  clientId: 'client-1',
  phone: '+919876543210',
  dialledNumber: '+912240000000',
  callId: 'call-1',
}

beforeEach(() => {
  send.mockReset()
})

describe('createVoiceLead', () => {
  it('writes to voice_leads and returns the row it wrote', async () => {
    send.mockResolvedValue({})

    const lead = await createVoiceLead(INPUT)

    const command = send.mock.calls[0][0]
    expect(command.input.TableName).toBe('test-voice_leads')
    expect(command.input.Item).toMatchObject({ ...INPUT, source: 'voice', leadId: 'generated-lead-id' })
    expect(lead.leadId).toBe('generated-lead-id')
  })

  it('stamps source and createdAt rather than trusting the caller for them', async () => {
    send.mockResolvedValue({})

    const lead = await createVoiceLead(INPUT)

    expect(lead.source).toBe('voice')
    expect(Number.isNaN(Date.parse(lead.createdAt))).toBe(false)
  })

  it('surfaces a write failure instead of returning a lead that was never stored', async () => {
    // The caller is a live phone call whose CRM writes are deliberately
    // swallowed upstream. Returning a phantom lead here would have every
    // later write address a row that does not exist.
    send.mockRejectedValue(new Error('ProvisionedThroughputExceeded'))

    await expect(createVoiceLead(INPUT)).rejects.toThrow('Failed to create voice lead for client client-1')
  })
})

describe('getVoiceLeadById', () => {
  it('reads by clientId and leadId, the table’s actual key', async () => {
    // agentId is a discriminator on the LeadRef, never an address. A Key built
    // from a non-key attribute is rejected outright by DynamoDB, which is how
    // the equivalent Meta bug threw on every detail page.
    send.mockResolvedValue({ Item: { leadId: 'lead-1' } })

    await getVoiceLeadById('client-1', 'lead-1')

    expect(send.mock.calls[0][0].input.Key).toEqual({ clientId: 'client-1', leadId: 'lead-1' })
  })

  it('returns null for a lead that is not there', async () => {
    send.mockResolvedValue({})

    await expect(getVoiceLeadById('client-1', 'gone')).resolves.toBeNull()
  })

  it('surfaces a read failure rather than reporting the lead missing', async () => {
    // Reporting null here would turn a table outage into a 404, and the caller
    // would create a duplicate lead for someone already known.
    send.mockRejectedValue(new Error('DynamoDB unavailable'))

    await expect(getVoiceLeadById('client-1', 'lead-1')).rejects.toThrow('Failed to get voice lead lead-1')
  })
})

describe('getVoiceLeadsByClientId', () => {
  it('queries the createdAt index newest first', async () => {
    send.mockResolvedValue({ Items: [] })

    await getVoiceLeadsByClientId('client-1')

    const input = send.mock.calls[0][0].input
    expect(input.IndexName).toBe('clientId-createdAt-index')
    expect(input.ScanIndexForward).toBe(false)
    expect(input.ExpressionAttributeValues).toEqual({ ':clientId': 'client-1' })
  })

  it('caps the page, and lets a caller raise it', async () => {
    // The inbox asks for more than the default; the identity join does not.
    // An uncapped query here would be an unbounded read on a hot path.
    send.mockResolvedValue({ Items: [] })

    await getVoiceLeadsByClientId('client-1')
    expect(send.mock.calls[0][0].input.Limit).toBe(50)

    await getVoiceLeadsByClientId('client-1', 500)
    expect(send.mock.calls[1][0].input.Limit).toBe(500)
  })

  it('returns an empty list when the query returns no Items key', async () => {
    send.mockResolvedValue({})

    await expect(getVoiceLeadsByClientId('client-1')).resolves.toEqual([])
  })

  it('surfaces a query failure instead of reporting the client has no calls', async () => {
    send.mockRejectedValue(new Error('DynamoDB unavailable'))

    await expect(getVoiceLeadsByClientId('client-1')).rejects.toThrow(
      'Failed to list voice leads for client client-1'
    )
  })
})

describe('deleteVoiceLead', () => {
  // Not dead code: this is what eraseLead calls for a voice lead. It sat
  // unreferenced while the erasure switch silently skipped voice, so an
  // erasure destroyed everything keyed by the leadId and left the row.
  it('deletes by the table’s key', async () => {
    send.mockResolvedValue({})

    await deleteVoiceLead('client-1', 'lead-1')

    const command = send.mock.calls[0][0]
    expect(command.input.TableName).toBe('test-voice_leads')
    expect(command.input.Key).toEqual({ clientId: 'client-1', leadId: 'lead-1' })
  })

  it('surfaces a delete failure, because a silent one means data survives an erasure', async () => {
    send.mockRejectedValue(new Error('AccessDeniedException'))

    await expect(deleteVoiceLead('client-1', 'lead-1')).rejects.toThrow('Failed to delete voice lead lead-1')
  })
})
