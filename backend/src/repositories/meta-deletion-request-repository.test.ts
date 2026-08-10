import { beforeEach, describe, expect, it, vi } from 'vitest'

const send = vi.fn()
vi.mock('./dynamo-client.js', () => ({
  dynamoClient: { send },
  getTableName: () => 'test-meta-deletion-requests-table',
}))

const {
  createMetaDeletionRequest,
  getMetaDeletionRequest,
  markMetaDeletionRequestNotified,
} = await import('./meta-deletion-request-repository.js')

// Reaches into the command handed to DynamoDB. For this table the condition
// expression IS the behaviour: without it a colliding write would silently
// erase somebody's deletion request, which is the one failure this endpoint
// must never have.
function lastCommandInput(): Record<string, unknown> {
  const call = send.mock.calls.at(-1)
  return (call?.[0] as { input: Record<string, unknown> }).input
}

const RECORD = {
  confirmationCode: 'mdr_abc',
  metaUserId: '4512644655638994',
  status: 'received' as const,
  requestedAt: '2026-08-10T00:00:00.000Z',
  notified: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  send.mockResolvedValue({})
})

describe('createMetaDeletionRequest', () => {
  it('writes the record under the confirmation code', async () => {
    const result = await createMetaDeletionRequest(RECORD)

    expect(result).toEqual(RECORD)
    const input = lastCommandInput()
    expect(input.TableName).toBe('test-meta-deletion-requests-table')
    expect(input.Item).toEqual(RECORD)
  })

  it('refuses to overwrite an existing request', async () => {
    await createMetaDeletionRequest(RECORD)

    expect(lastCommandInput().ConditionExpression).toBe(
      'attribute_not_exists(confirmationCode)'
    )
  })

  it('surfaces a write failure instead of reporting success', async () => {
    send.mockRejectedValue(new Error('ConditionalCheckFailedException'))

    await expect(createMetaDeletionRequest(RECORD)).rejects.toThrow(
      /Failed to create Meta deletion request: ConditionalCheckFailedException/
    )
  })
})

describe('getMetaDeletionRequest', () => {
  it('returns the stored request', async () => {
    send.mockResolvedValue({ Item: RECORD })

    expect(await getMetaDeletionRequest('mdr_abc')).toEqual(RECORD)
    expect(lastCommandInput().Key).toEqual({ confirmationCode: 'mdr_abc' })
  })

  // null, not undefined and not a throw: the public status page distinguishes
  // "no such request" from "the lookup broke", and only a clean null lets it.
  it('returns null for a code that was never issued', async () => {
    send.mockResolvedValue({})

    expect(await getMetaDeletionRequest('mdr_nope')).toBeNull()
  })

  it('throws when the read itself fails', async () => {
    send.mockRejectedValue(new Error('Dynamo down'))

    await expect(getMetaDeletionRequest('mdr_abc')).rejects.toThrow(
      /Failed to fetch Meta deletion request mdr_abc: Dynamo down/
    )
  })
})

describe('markMetaDeletionRequestNotified', () => {
  it('sets notified without touching the rest of the row', async () => {
    await markMetaDeletionRequestNotified('mdr_abc')

    const input = lastCommandInput()
    expect(input.Key).toEqual({ confirmationCode: 'mdr_abc' })
    expect(input.UpdateExpression).toBe('SET notified = :notified')
    expect(input.ExpressionAttributeValues).toEqual({ ':notified': true })
  })

  it('throws when the flag write fails', async () => {
    send.mockRejectedValue(new Error('Dynamo down'))

    await expect(markMetaDeletionRequestNotified('mdr_abc')).rejects.toThrow(
      /Failed to mark Meta deletion request mdr_abc as notified: Dynamo down/
    )
  })
})
