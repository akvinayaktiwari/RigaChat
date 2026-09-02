import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the DynamoDB boundary. getTableName also runs at module load, so it is
// stubbed here to avoid needing the table env var.
const send = vi.fn()
vi.mock('./dynamo-client.js', () => ({
  dynamoClient: { send },
  getTableName: () => 'test-meta-page-lookup',
}))

const { setPageClientMapping, getPageRegistration, listPagesForClient, MetaPageConflictError } =
  await import('./meta-lead-repository.js')

function conditionalCheckFailed(): Error {
  const err = new Error('The conditional request failed')
  err.name = 'ConditionalCheckFailedException'
  return err
}

beforeEach(() => {
  send.mockReset()
})

describe('setPageClientMapping', () => {
  it('writes the Page name and its own token so the token is reachable from the pageId', async () => {
    send.mockResolvedValue({})

    await setPageClientMapping('page-1', 'client-1', {
      pageName: 'Skyline Homes',
      pageAccessTokenEncrypted: 'enc-page-1',
    })

    const input = send.mock.calls[0][0].input
    expect(input.Item).toMatchObject({
      pageId: 'page-1',
      clientId: 'client-1',
      pageName: 'Skyline Homes',
      pageAccessTokenEncrypted: 'enc-page-1',
    })
    expect(input.Item.connectedAt).toEqual(expect.any(String))
    // Ships from day one so the M5 grant-drift pass needs no migration.
    expect(input.Item.lastVerifiedAt).toEqual(expect.any(String))
  })

  it('still writes a bare mapping when no Page detail is supplied', async () => {
    // The pre-M1 single-Page connect path calls this with two arguments and must
    // keep working unchanged through the soak week.
    send.mockResolvedValue({})

    await setPageClientMapping('page-1', 'client-1')

    const item = send.mock.calls[0][0].input.Item
    expect(item).toMatchObject({ pageId: 'page-1', clientId: 'client-1' })
    expect(item.pageName).toBeUndefined()
    expect(item.pageAccessTokenEncrypted).toBeUndefined()
  })

  it('keeps the atomic claim that one Page maps to at most one client', async () => {
    // A plain read-then-write has a race window where two clients completing
    // OAuth for the same Page concurrently both pass the read check. This
    // condition makes DynamoDB reject the loser instead.
    send.mockResolvedValue({})

    await setPageClientMapping('page-1', 'client-1')

    const input = send.mock.calls[0][0].input
    expect(input.ConditionExpression).toBe('attribute_not_exists(pageId) OR clientId = :clientId')
    expect(input.ExpressionAttributeValues).toEqual({ ':clientId': 'client-1' })
  })

  it('surfaces a losing claim as MetaPageConflictError, not a generic failure', async () => {
    send.mockRejectedValue(conditionalCheckFailed())

    await expect(setPageClientMapping('page-1', 'client-2')).rejects.toBeInstanceOf(
      MetaPageConflictError
    )
  })
})

describe('getPageRegistration', () => {
  it('returns the whole registration including the Page token', async () => {
    send.mockResolvedValue({
      Item: {
        pageId: 'page-1',
        clientId: 'client-1',
        pageName: 'Skyline Homes',
        pageAccessTokenEncrypted: 'enc-page-1',
        connectedAt: '2026-01-01T00:00:00.000Z',
        lastVerifiedAt: '2026-01-01T00:00:00.000Z',
      },
    })

    const result = await getPageRegistration('page-1')

    expect(result?.pageAccessTokenEncrypted).toBe('enc-page-1')
    expect(result?.clientId).toBe('client-1')
  })

  it('returns null for an unknown Page rather than throwing', async () => {
    // An unmapped pageId is a routine webhook case (a Page we do not serve),
    // not an error condition.
    send.mockResolvedValue({})

    await expect(getPageRegistration('page-unknown')).resolves.toBeNull()
  })
})

describe('listPagesForClient', () => {
  it('queries the GSI and never scans the table', async () => {
    send.mockResolvedValue({ Items: [{ pageId: 'page-1', clientId: 'client-1' }] })

    await listPagesForClient('client-1')

    const call = send.mock.calls[0][0]
    // A Scan here would repeat the per-message full-table Scan that W1 exists
    // to delete on the WhatsApp side. Assert on the command itself, not just
    // the input, so swapping Query for Scan fails loudly.
    expect(call.constructor.name).toBe('QueryCommand')
    expect(call.input.IndexName).toBe('clientId-connectedAt-index')
    expect(call.input.KeyConditionExpression).toBe('clientId = :clientId')
  })

  it('returns an empty list for a client with no Pages', async () => {
    send.mockResolvedValue({})

    await expect(listPagesForClient('client-none')).resolves.toEqual([])
  })
})
