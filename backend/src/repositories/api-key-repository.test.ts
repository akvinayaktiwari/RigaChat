import { beforeEach, describe, expect, it, vi } from 'vitest'

const send = vi.fn()
vi.mock('./dynamo-client.js', () => ({
  dynamoClient: { send },
  getTableName: () => 'test-api_keys',
}))

const { putApiKey, getApiKeyByHash, getApiKeysForClient, deleteApiKey, touchApiKeyLastUsed } = await import(
  './api-key-repository.js'
)

const RECORD = {
  keyHash: 'hash-1',
  keyId: 'key-1',
  clientId: 'client-1',
  name: 'Sync job',
  last4: 'abcd',
  scopes: ['leads:read' as const],
  createdAt: '2026-10-05T00:00:00.000Z',
}

function conditionalCheckFailed(): Error {
  const err = new Error('The conditional request failed')
  err.name = 'ConditionalCheckFailedException'
  return err
}

beforeEach(() => {
  send.mockReset()
})

describe('putApiKey', () => {
  it('refuses to overwrite an existing hash', async () => {
    send.mockResolvedValueOnce({})

    await putApiKey(RECORD)

    expect(send.mock.calls[0][0].input).toMatchObject({
      Item: RECORD,
      ConditionExpression: 'attribute_not_exists(keyHash)',
    })
  })
})

describe('getApiKeyByHash', () => {
  it('reads consistently, so a revoked key fails on the very next request', async () => {
    send.mockResolvedValueOnce({ Item: RECORD })

    expect(await getApiKeyByHash('hash-1')).toEqual(RECORD)
    expect(send.mock.calls[0][0].input).toMatchObject({ Key: { keyHash: 'hash-1' }, ConsistentRead: true })
  })

  it('returns null for a hash nobody holds', async () => {
    send.mockResolvedValueOnce({})

    expect(await getApiKeyByHash('nope')).toBeNull()
  })
})

describe('getApiKeysForClient', () => {
  it('queries the client index newest first', async () => {
    send.mockResolvedValueOnce({ Items: [RECORD] })

    expect(await getApiKeysForClient('client-1')).toEqual([RECORD])
    expect(send.mock.calls[0][0].input).toMatchObject({
      IndexName: 'clientId-createdAt-index',
      ExpressionAttributeValues: { ':clientId': 'client-1' },
      ScanIndexForward: false,
    })
  })
})

describe('deleteApiKey', () => {
  it('deletes only when the row belongs to the caller', async () => {
    send.mockResolvedValueOnce({})

    expect(await deleteApiKey('hash-1', 'client-1')).toBe(true)
    expect(send.mock.calls[0][0].input).toMatchObject({
      ConditionExpression: 'clientId = :clientId',
      ExpressionAttributeValues: { ':clientId': 'client-1' },
    })
  })

  it('reports false for a key owned by someone else, rather than throwing', async () => {
    send.mockRejectedValueOnce(conditionalCheckFailed())

    expect(await deleteApiKey('hash-1', 'client-2')).toBe(false)
  })
})

describe('touchApiKeyLastUsed', () => {
  it('only updates a row that still exists', async () => {
    // UpdateItem creates a missing item. Without this condition a request that
    // raced a revocation would write the revoked key back as a bare row.
    send.mockResolvedValueOnce({})

    await touchApiKeyLastUsed('hash-1', '2026-10-05T01:00:00.000Z')

    expect(send.mock.calls[0][0].input.ConditionExpression).toBe('attribute_exists(keyHash)')
  })

  it('is a no-op when the key was revoked in the meantime', async () => {
    send.mockRejectedValueOnce(conditionalCheckFailed())

    await expect(touchApiKeyLastUsed('hash-1', '2026-10-05T01:00:00.000Z')).resolves.toBeUndefined()
  })
})
