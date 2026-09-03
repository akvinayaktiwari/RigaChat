import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the DynamoDB boundary. getTableName also runs at module load, so it is
// stubbed here to avoid needing the table env var.
const send = vi.fn()
vi.mock('./dynamo-client.js', () => ({
  dynamoClient: { send },
  getTableName: () => 'test-meta-page-lookup',
}))

const {
  setPageClientMapping,
  getPageRegistration,
  listPagesForClient,
  getClientIdForPage,
  getClientIdsForPages,
  removePageClientMapping,
  markPageVerified,
  MetaPageConflictError,
} = await import('./meta-lead-repository.js')

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
    expect(input.Key).toEqual({ pageId: 'page-1' })
    expect(input.ExpressionAttributeValues).toMatchObject({
      ':clientId': 'client-1',
      ':pageName': 'Skyline Homes',
      ':pageAccessTokenEncrypted': 'enc-page-1',
    })
    // Ships from day one so the grant-drift pass needs no migration.
    expect(input.UpdateExpression).toContain('lastVerifiedAt = :lastVerifiedAt')
  })

  it('still writes a bare mapping when no Page detail is supplied', async () => {
    // The pre-registry single-Page connect path calls this with two arguments
    // and must keep working unchanged.
    send.mockResolvedValue({})

    await setPageClientMapping('page-1', 'client-1')

    const input = send.mock.calls[0][0].input
    expect(input.UpdateExpression).not.toContain('pageName')
    expect(input.UpdateExpression).not.toContain('pageAccessTokenEncrypted')
    expect(input.ExpressionAttributeValues[':clientId']).toBe('client-1')
  })

  // The original bug: this was a Put, and a Put REPLACES the item, so any
  // caller that forgot to thread connectedAt back in silently reset it to now
  // -- rewriting the real connection date and, since connectedAt is the GSI
  // sort key, reordering the client's Page list. The backfill got it wrong
  // once, then connectMetaPages got it wrong again on the re-connect path.
  // if_not_exists moves the guarantee into the write itself so no caller can
  // reintroduce it.
  it('cannot reset an existing connectedAt, whatever the caller passes', async () => {
    send.mockResolvedValue({})

    await setPageClientMapping('page-1', 'client-1', {
      pageName: 'Skyline Homes',
      pageAccessTokenEncrypted: 'enc-page-1',
    })

    const input = send.mock.calls[0][0].input
    expect(input.UpdateExpression).toContain('connectedAt = if_not_exists(connectedAt, :connectedAt)')
  })

  it('uses the supplied connectedAt only when the row has none', async () => {
    send.mockResolvedValue({})

    await setPageClientMapping('page-1', 'client-1', {
      pageName: 'Skyline Homes',
      pageAccessTokenEncrypted: 'enc-page-1',
      connectedAt: '2026-08-15T11:46:51.648Z',
    })

    expect(send.mock.calls[0][0].input.ExpressionAttributeValues[':connectedAt']).toBe(
      '2026-08-15T11:46:51.648Z'
    )
  })

  it('stamps now as the fallback for a genuinely new connection', async () => {
    send.mockResolvedValue({})
    const before = new Date().toISOString()

    await setPageClientMapping('page-1', 'client-1', {
      pageName: 'Skyline Homes',
      pageAccessTokenEncrypted: 'enc-page-1',
    })

    const written = send.mock.calls[0][0].input.ExpressionAttributeValues[':connectedAt'] as string
    expect(written >= before).toBe(true)
  })

  it('always refreshes lastVerifiedAt, even while preserving connectedAt', async () => {
    // The two dates answer different questions: when the client connected the
    // Page, and when we last confirmed Meta still grants it.
    send.mockResolvedValue({})

    await setPageClientMapping('page-1', 'client-1', {
      pageName: 'Skyline Homes',
      pageAccessTokenEncrypted: 'enc-page-1',
      connectedAt: '2026-08-15T11:46:51.648Z',
    })

    const values = send.mock.calls[0][0].input.ExpressionAttributeValues
    expect(values[':lastVerifiedAt']).not.toBe('2026-08-15T11:46:51.648Z')
    expect(values[':lastVerifiedAt']).toEqual(expect.any(String))
  })

  it('keeps the atomic claim that one Page maps to at most one client', async () => {
    // A plain read-then-write has a race window where two clients completing
    // OAuth for the same Page concurrently both pass the read check. This
    // condition makes DynamoDB reject the loser instead.
    send.mockResolvedValue({})

    await setPageClientMapping('page-1', 'client-1')

    expect(send.mock.calls[0][0].input.ConditionExpression).toBe(
      'attribute_not_exists(pageId) OR clientId = :clientId'
    )
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

describe('getClientIdForPage', () => {
  it('returns the owning clientId for a known Page', async () => {
    send.mockResolvedValue({ Item: { pageId: 'page-1', clientId: 'client-1' } })

    await expect(getClientIdForPage('page-1')).resolves.toBe('client-1')
  })

  it('returns null for an unmapped Page rather than throwing', async () => {
    // Routine on the shared webhook: a leadgen event for a Page nobody has
    // connected is not an error condition.
    send.mockResolvedValue({})

    await expect(getClientIdForPage('page-unknown')).resolves.toBeNull()
  })

  it('reads the base table by pageId, not the GSI', async () => {
    send.mockResolvedValue({ Item: { pageId: 'page-1', clientId: 'client-1' } })

    await getClientIdForPage('page-1')

    const call = send.mock.calls[0][0]
    expect(call.constructor.name).toBe('GetCommand')
    expect(call.input.Key).toEqual({ pageId: 'page-1' })
  })
})

describe('removePageClientMapping', () => {
  it('deletes the Page row by pageId', async () => {
    send.mockResolvedValue({})

    await removePageClientMapping('page-1')

    const call = send.mock.calls[0][0]
    expect(call.constructor.name).toBe('DeleteCommand')
    expect(call.input.Key).toEqual({ pageId: 'page-1' })
  })

  it('wraps a DynamoDB failure with the pageId for diagnosability', async () => {
    send.mockRejectedValue(new Error('ProvisionedThroughputExceededException'))

    await expect(removePageClientMapping('page-1')).rejects.toThrow(/Failed to remove Meta page mapping page-1/)
  })
})

describe('markPageVerified', () => {
  it('stamps lastVerifiedAt by pageId without touching anything else on the row', async () => {
    send.mockResolvedValue({})
    const before = new Date().toISOString()

    await markPageVerified('page-1')

    const input = send.mock.calls[0][0].input
    expect(input.TableName).toBe('test-meta-page-lookup')
    expect(input.Key).toEqual({ pageId: 'page-1' })
    expect(input.UpdateExpression).toBe('SET lastVerifiedAt = :now')
    const written = input.ExpressionAttributeValues[':now'] as string
    expect(written >= before).toBe(true)
  })

  it('guards the write so it cannot resurrect a row deleted between the read and here', async () => {
    send.mockResolvedValue({})

    await markPageVerified('page-1')

    expect(send.mock.calls[0][0].input.ConditionExpression).toBe('attribute_exists(pageId)')
  })

  // The row this call was about to verify was removed (disconnected, or erased)
  // in the gap between the reconcile pass reading it and this write landing.
  // That is not a failure the reconcile pass should report or retry -- the
  // Page is gone, so there is nothing left to mark.
  it('swallows a ConditionalCheckFailedException instead of throwing', async () => {
    send.mockRejectedValue(conditionalCheckFailed())

    await expect(markPageVerified('page-1')).resolves.toBeUndefined()
  })

  it('wraps any other DynamoDB failure with the pageId for diagnosability', async () => {
    send.mockRejectedValue(new Error('ProvisionedThroughputExceededException'))

    await expect(markPageVerified('page-1')).rejects.toThrow(/Failed to mark Meta page page-1 verified/)
  })
})

describe('failure wrapping', () => {
  // Without the pageId/clientId in the message, a throttled read in production
  // is an anonymous "Failed" line with nothing to grep for.
  it('names the page when the registration read fails', async () => {
    send.mockRejectedValue(new Error('ProvisionedThroughputExceededException'))

    await expect(getPageRegistration('page-1')).rejects.toThrow(
      /Failed to read Meta page registration page-1/
    )
  })

  it('names the client when the page list fails', async () => {
    send.mockRejectedValue(new Error('ResourceNotFoundException'))

    await expect(listPagesForClient('client-1')).rejects.toThrow(
      /Failed to list Meta pages for client client-1/
    )
  })
})

describe('getClientIdsForPages', () => {
  it('answers for many pages in one request instead of one read each', async () => {
    send.mockResolvedValue({
      Responses: {
        'test-meta-page-lookup': [
          { pageId: 'page-1', clientId: 'client-1' },
          { pageId: 'page-2', clientId: 'client-2' },
        ],
      },
    })

    const owners = await getClientIdsForPages(['page-1', 'page-2'])

    expect(send).toHaveBeenCalledTimes(1)
    expect(owners.get('page-1')).toBe('client-1')
    expect(owners.get('page-2')).toBe('client-2')
  })

  it('makes no request at all for an empty list', async () => {
    await expect(getClientIdsForPages([])).resolves.toEqual(new Map())
    expect(send).not.toHaveBeenCalled()
  })

  it('de-duplicates keys, which DynamoDB rejects outright', async () => {
    send.mockResolvedValue({ Responses: { 'test-meta-page-lookup': [] } })

    await getClientIdsForPages(['page-1', 'page-1'])

    expect(send.mock.calls[0][0].input.RequestItems['test-meta-page-lookup'].Keys).toEqual([
      { pageId: 'page-1' },
    ])
  })

  it('splits past the 100-key BatchGet limit', async () => {
    send.mockResolvedValue({ Responses: { 'test-meta-page-lookup': [] } })

    await getClientIdsForPages(Array.from({ length: 150 }, (_, i) => `page-${i}`))

    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[0][0].input.RequestItems['test-meta-page-lookup'].Keys).toHaveLength(100)
    expect(send.mock.calls[1][0].input.RequestItems['test-meta-page-lookup'].Keys).toHaveLength(50)
  })

  // BatchGetItem can return UnprocessedKeys and still succeed. Treating the
  // first response as complete is how a Page reads back as unowned -- shown as
  // selectable, then rejected by the atomic claim after the client hit Connect.
  it('retries the keys DynamoDB did not process', async () => {
    send
      .mockResolvedValueOnce({
        Responses: { 'test-meta-page-lookup': [{ pageId: 'page-1', clientId: 'client-1' }] },
        UnprocessedKeys: { 'test-meta-page-lookup': { Keys: [{ pageId: 'page-2' }] } },
      })
      .mockResolvedValueOnce({
        Responses: { 'test-meta-page-lookup': [{ pageId: 'page-2', clientId: 'client-2' }] },
      })

    const owners = await getClientIdsForPages(['page-1', 'page-2'])

    expect(send).toHaveBeenCalledTimes(2)
    expect(owners.get('page-2')).toBe('client-2')
  })

  it('gives up loudly rather than reporting a Page as unowned', async () => {
    send.mockResolvedValue({
      Responses: { 'test-meta-page-lookup': [] },
      UnprocessedKeys: { 'test-meta-page-lookup': { Keys: [{ pageId: 'page-2' }] } },
    })

    await expect(getClientIdsForPages(['page-2'])).rejects.toThrow(/still unprocessed/)
  })
})
