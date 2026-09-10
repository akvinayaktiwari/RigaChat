import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Lead } from '../types/index.js'

const send = vi.fn()
vi.mock('./dynamo-client.js', () => ({
  dynamoClient: { send },
  getTableName: () => 'test-leads',
}))

const { getLeadsByClientId } = await import('./lead-repository.js')

function lead(leadId: string): Lead {
  return {
    leadId,
    botId: 'bot-1',
    clientId: 'client-1',
    name: leadId,
    phone: '+919876543210',
    chatTranscript: '',
    sourceUrl: 'https://example.com',
    createdAt: '2026-09-01T00:00:00.000Z',
  }
}

beforeEach(() => {
  send.mockReset()
  // Cleared, not just re-spied: vi.spyOn on an already-spied console.error
  // hands back the SAME spy with its call history intact, so the
  // "does not warn" case would see the previous test's warning.
  vi.spyOn(console, 'error').mockImplementation(() => {}).mockClear()
})

describe('getLeadsByClientId pagination', () => {
  it('returns the single page when there is no more to read', async () => {
    send.mockResolvedValue({ Items: [lead('a'), lead('b')] })

    await expect(getLeadsByClientId('client-1')).resolves.toHaveLength(2)
    expect(send).toHaveBeenCalledTimes(1)
  })

  // The bug this replaces: DynamoDB caps a Query at 1MB and hands back a
  // cursor. Ignoring it returned the first page as though it were the whole
  // answer, so a phone-number match could miss a lead that exists.
  it('follows LastEvaluatedKey until the list is complete', async () => {
    send
      .mockResolvedValueOnce({ Items: [lead('a')], LastEvaluatedKey: { leadId: 'a' } })
      .mockResolvedValueOnce({ Items: [lead('b')], LastEvaluatedKey: { leadId: 'b' } })
      .mockResolvedValueOnce({ Items: [lead('c')] })

    const leads = await getLeadsByClientId('client-1')

    expect(leads.map((l) => l.leadId)).toEqual(['a', 'b', 'c'])
    expect(send).toHaveBeenCalledTimes(3)
  })

  it('passes the cursor back as ExclusiveStartKey, not a fresh query', async () => {
    send
      .mockResolvedValueOnce({ Items: [lead('a')], LastEvaluatedKey: { leadId: 'a' } })
      .mockResolvedValueOnce({ Items: [lead('b')] })

    await getLeadsByClientId('client-1')

    expect(send.mock.calls[0][0].input.ExclusiveStartKey).toBeUndefined()
    expect(send.mock.calls[1][0].input.ExclusiveStartKey).toEqual({ leadId: 'a' })
  })

  it('keeps newest-first ordering across pages', async () => {
    // The identity join's tiebreak is "most recent contact", so page order is
    // part of the answer, not a detail.
    send
      .mockResolvedValueOnce({ Items: [lead('newest')], LastEvaluatedKey: { leadId: 'newest' } })
      .mockResolvedValueOnce({ Items: [lead('older')] })

    const leads = await getLeadsByClientId('client-1')

    expect(leads.map((l) => l.leadId)).toEqual(['newest', 'older'])
    expect(send.mock.calls[0][0].input.ScanIndexForward).toBe(false)
  })

  it('stops at the page guard rather than reading forever', async () => {
    // Always another cursor: a pathological client must not turn one inbound
    // message into an unbounded read.
    send.mockResolvedValue({ Items: [lead('x')], LastEvaluatedKey: { leadId: 'x' } })

    const leads = await getLeadsByClientId('client-1')

    expect(send).toHaveBeenCalledTimes(50)
    expect(leads).toHaveLength(50)
  })

  it('says so when the guard truncates, because a quiet truncation is the bug', async () => {
    send.mockResolvedValue({ Items: [lead('x')], LastEvaluatedKey: { leadId: 'x' } })

    await getLeadsByClientId('client-1')

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('unreliable'))
  })

  it('does not warn on a complete read', async () => {
    send.mockResolvedValue({ Items: [lead('a')] })

    await getLeadsByClientId('client-1')

    expect(console.error).not.toHaveBeenCalled()
  })

  it('returns an empty list when the client has no leads', async () => {
    send.mockResolvedValue({})

    await expect(getLeadsByClientId('client-1')).resolves.toEqual([])
  })

  it('surfaces a failure mid-pagination rather than returning a partial list', async () => {
    // Returning what was read so far would be the silent-truncation bug again,
    // wearing a different hat.
    send
      .mockResolvedValueOnce({ Items: [lead('a')], LastEvaluatedKey: { leadId: 'a' } })
      .mockRejectedValueOnce(new Error('ProvisionedThroughputExceeded'))

    await expect(getLeadsByClientId('client-1')).rejects.toThrow('Failed to get leads for client client-1')
  })
})
