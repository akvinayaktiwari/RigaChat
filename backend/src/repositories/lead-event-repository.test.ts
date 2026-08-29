import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LeadEvent } from '../types/index.js'

const send = vi.fn()
vi.mock('./dynamo-client.js', async () => {
  const actual = await vi.importActual<typeof import('../lib/table-names.js')>('../lib/table-names.js')
  return { dynamoClient: { send }, getTableName: actual.getTableName }
})

const { appendLeadEvent, getLeadEvents, getEventByWamid, getClientEvents, getEventsByBundleId } = await import(
  './lead-event-repository.js'
)

function lastItem(): Record<string, unknown> {
  return send.mock.calls.at(-1)?.[0].input.Item as Record<string, unknown>
}

beforeEach(() => {
  send.mockReset().mockResolvedValue({})
})

describe('appendLeadEvent', () => {
  it('writes to the lead_events table with leadId as the partition key', async () => {
    await appendLeadEvent({
      leadId: 'lead-1',
      clientId: 'client-1',
      botId: 'bot-1',
      type: 'message_in',
      body: 'hello',
    })

    // Prefixed because vitest.config.ts sets DYNAMODB_TABLE_PREFIX=test- so an
    // unmocked write can never reach the real table. Asserting the prefixed name
    // keeps that boundary visible rather than papering over it.
    const input = send.mock.calls[0]?.[0].input
    expect(input.TableName).toBe('test-lead_events')
    expect(input.Item.leadId).toBe('lead-1')
  })

  // The ISO prefix is what makes a Query come back in order without sorting.
  it('builds a sort key of isoTimestamp#uuid', async () => {
    await appendLeadEvent({
      leadId: 'lead-1',
      clientId: 'client-1',
      botId: 'bot-1',
      type: 'message_in',
      occurredAt: '2026-08-16T10:00:00.000Z',
    })

    expect(lastItem().ts).toMatch(/^2026-08-16T10:00:00\.000Z#[0-9a-f-]{36}$/)
  })

  // Two events in the same millisecond must not collide on the key. Without the
  // uuid suffix the second silently overwrites the first, which is exactly what
  // a burst of delivery statuses looks like.
  it('keeps two events in the same millisecond distinct', async () => {
    const at = '2026-08-16T10:00:00.000Z'
    await appendLeadEvent({ leadId: 'l', clientId: 'c', botId: 'b', type: 'message_out', occurredAt: at })
    const first = lastItem().ts
    await appendLeadEvent({ leadId: 'l', clientId: 'c', botId: 'b', type: 'message_out', occurredAt: at })
    const second = lastItem().ts

    expect(first).not.toBe(second)
    expect(String(first).slice(0, 24)).toBe(String(second).slice(0, 24))
  })

  // DynamoDB rejects undefined attribute values, and this shape is mostly
  // optional fields.
  it('strips undefined fields rather than sending them', async () => {
    await appendLeadEvent({
      leadId: 'lead-1',
      clientId: 'client-1',
      botId: 'bot-1',
      type: 'message_out',
      wamid: 'wamid-1',
      templateName: undefined,
      body: undefined,
    })

    const item = lastItem()
    expect(item).toHaveProperty('wamid', 'wamid-1')
    expect(item).not.toHaveProperty('templateName')
    expect(item).not.toHaveProperty('body')
  })

  it('does not carry occurredAt through as an attribute', async () => {
    await appendLeadEvent({
      leadId: 'lead-1',
      clientId: 'client-1',
      botId: 'bot-1',
      type: 'message_in',
      occurredAt: '2026-08-16T10:00:00.000Z',
    })

    expect(lastItem()).not.toHaveProperty('occurredAt')
  })

  // The contract the whole design rests on: an audit write must never take down
  // the thing it is auditing. A send, a capture or a webhook is worth more than
  // its record.
  it('never throws when the write fails', async () => {
    send.mockRejectedValue(new Error('ProvisionedThroughputExceeded'))

    await expect(
      appendLeadEvent({ leadId: 'lead-1', clientId: 'c', botId: 'b', type: 'message_out' })
    ).resolves.toBeUndefined()
  })
})

describe('getLeadEvents', () => {
  it('queries by leadId in chronological order', async () => {
    send.mockResolvedValue({ Items: [] })

    await getLeadEvents('lead-1')

    const input = send.mock.calls[0]?.[0].input
    expect(input.KeyConditionExpression).toBe('leadId = :leadId')
    expect(input.ScanIndexForward).toBe(true)
  })

  // A fresh lead has no events. The timeline must render empty, not error.
  it('returns an empty array when the lead has no events', async () => {
    send.mockResolvedValue({})

    await expect(getLeadEvents('lead-1')).resolves.toEqual([])
  })

  it('throws when the query itself fails', async () => {
    send.mockRejectedValue(new Error('boom'))

    await expect(getLeadEvents('lead-1')).rejects.toThrow('Failed to read events for lead lead-1')
  })
})

describe('getEventByWamid', () => {
  // A Meta status webhook carries a wamid and a recipient, never a leadId. This
  // sparse GSI is the only way to attach a delivery status to its message.
  it('queries the wamid index', async () => {
    send.mockResolvedValue({ Items: [{ leadId: 'lead-1' } as LeadEvent] })

    const found = await getEventByWamid('wamid-1')

    const input = send.mock.calls[0]?.[0].input
    expect(input.IndexName).toBe('wamid-index')
    expect(found?.leadId).toBe('lead-1')
  })

  // Statuses arrive for sends that have no lead behind them: the client
  // notification template, manual smoke tests. Not an error.
  it('returns null for a wamid that is not ours', async () => {
    send.mockResolvedValue({ Items: [] })

    await expect(getEventByWamid('someone-elses')).resolves.toBeNull()
  })

  it('returns null rather than throwing when the lookup fails', async () => {
    send.mockRejectedValue(new Error('index not ready'))

    await expect(getEventByWamid('wamid-1')).resolves.toBeNull()
  })
})

describe('getClientEvents', () => {
  it('queries the client index newest first with a bounded limit', async () => {
    send.mockResolvedValue({ Items: [] })

    await getClientEvents('client-1', 25)

    const input = send.mock.calls[0]?.[0].input
    expect(input.IndexName).toBe('clientId-ts-index')
    expect(input.ScanIndexForward).toBe(false)
    expect(input.Limit).toBe(25)
  })

  it('bounds the read even when the caller passes no limit', async () => {
    send.mockResolvedValue({ Items: [] })

    await getClientEvents('client-1')

    expect(send.mock.calls[0]?.[0].input.Limit).toBe(100)
  })
})

describe('getEventsByBundleId', () => {
  it('queries the sparse bundle index newest first', async () => {
    send.mockResolvedValue({ Items: [] })

    await getEventsByBundleId('bundle-1', 50)

    const input = send.mock.calls[0]?.[0].input
    expect(input.IndexName).toBe('bundleId-ts-index')
    expect(input.KeyConditionExpression).toBe('bundleId = :bundleId')
    expect(input.ScanIndexForward).toBe(false)
    expect(input.Limit).toBe(50)
  })

  // The audit table has no TTL by design, so this query grows forever. An
  // unbounded default would eventually be an unbounded read inside a Lambda.
  it('bounds the read even when the caller passes no limit', async () => {
    send.mockResolvedValue({ Items: [] })

    await getEventsByBundleId('bundle-1')

    expect(send.mock.calls[0]?.[0].input.Limit).toBe(200)
  })

  // Unlike the wamid lookup, this one throws rather than returning []: an empty
  // executions list means "no lead ever entered this journey", and quietly
  // returning that for a broken query would be a lie the operator acts on.
  it('throws rather than reporting an empty journey when the query fails', async () => {
    send.mockRejectedValue(new Error('index not ready'))

    await expect(getEventsByBundleId('bundle-1')).rejects.toThrow(/index not ready/)
  })
})
