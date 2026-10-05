import { beforeEach, describe, expect, it, vi } from 'vitest'

const putApiKey = vi.fn()
const getApiKeyByHash = vi.fn()
const getApiKeysForClient = vi.fn()
const deleteApiKey = vi.fn()
const touchApiKeyLastUsed = vi.fn()
vi.mock('../repositories/api-key-repository.js', () => ({
  putApiKey,
  getApiKeyByHash,
  getApiKeysForClient,
  deleteApiKey,
  touchApiKeyLastUsed,
}))

const incrementApiKeyRate = vi.fn()
vi.mock('../repositories/redis-repository.js', () => ({ incrementApiKeyRate }))

const resolveApiAccess = vi.fn()
class EntitlementError extends Error {
  constructor(
    public code: string,
    public feature: string
  ) {
    super(code)
  }
}
vi.mock('./entitlement-service.js', () => ({ resolveApiAccess, EntitlementError }))

const {
  API_KEY_PREFIX,
  ApiKeyLimitError,
  ApiKeyNotFoundError,
  ApiKeyValidationError,
  authenticateApiKey,
  createApiKeyForClient,
  hashApiKey,
  listApiKeysForClient,
  parseCreateApiKeyInput,
  revokeApiKeyForClient,
} = await import('./api-key-service.js')

const KEY = `${API_KEY_PREFIX}${'a'.repeat(48)}`
const RECORD = {
  keyHash: hashApiKey(KEY),
  keyId: 'key-1',
  clientId: 'client-1',
  name: 'Sync job',
  last4: 'aaaa',
  scopes: ['leads:read' as const],
  createdAt: '2026-10-05T00:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  resolveApiAccess.mockResolvedValue('full')
  getApiKeysForClient.mockResolvedValue([])
  getApiKeyByHash.mockResolvedValue(RECORD)
  incrementApiKeyRate.mockResolvedValue(1)
  deleteApiKey.mockResolvedValue(true)
})

describe('parseCreateApiKeyInput', () => {
  it('trims the name and de-duplicates scopes', () => {
    expect(parseCreateApiKeyInput({ name: '  Sync  ', scopes: ['leads:read', 'leads:read'] })).toEqual({
      name: 'Sync',
      scopes: ['leads:read'],
    })
  })

  it.each([
    [null, 'no body'],
    [{ scopes: ['leads:read'] }, 'no name'],
    [{ name: 'x'.repeat(61), scopes: ['leads:read'] }, 'name too long'],
    [{ name: 'Sync', scopes: [] }, 'no scopes'],
    [{ name: 'Sync', scopes: ['leads:delete'] }, 'a scope that does not exist'],
  ] as [unknown, string][])('rejects %j (%s)', (raw, _why) => {
    expect(() => parseCreateApiKeyInput(raw)).toThrow(ApiKeyValidationError)
  })
})

describe('createApiKeyForClient', () => {
  it('returns the secret once and stores only its hash', async () => {
    const created = await createApiKeyForClient('client-1', { name: 'Sync', scopes: ['leads:read'] })

    expect(created.key).toMatch(/^vy_live_[0-9a-f]{48}$/)
    const stored = putApiKey.mock.calls[0][0]
    expect(stored.keyHash).toBe(hashApiKey(created.key))
    expect(JSON.stringify(stored)).not.toContain(created.key)
    expect(stored.last4).toBe(created.key.slice(-4))
    // The response must not leak the hash either.
    expect(created).not.toHaveProperty('keyHash')
    expect(created).not.toHaveProperty('clientId')
  })

  it('refuses an account whose plan has no API access', async () => {
    resolveApiAccess.mockResolvedValue(null)

    await expect(createApiKeyForClient('client-1', { name: 'Sync', scopes: ['leads:read'] })).rejects.toBeInstanceOf(
      EntitlementError
    )
    expect(putApiKey).not.toHaveBeenCalled()
  })

  it('refuses an eleventh key', async () => {
    getApiKeysForClient.mockResolvedValue(Array.from({ length: 10 }, () => RECORD))

    await expect(createApiKeyForClient('client-1', { name: 'Sync', scopes: ['leads:read'] })).rejects.toBeInstanceOf(
      ApiKeyLimitError
    )
  })
})

describe('listApiKeysForClient', () => {
  it('never returns the hash', async () => {
    getApiKeysForClient.mockResolvedValue([RECORD])

    const [summary] = await listApiKeysForClient('client-1')

    expect(summary).toEqual({
      keyId: 'key-1',
      name: 'Sync job',
      last4: 'aaaa',
      scopes: ['leads:read'],
      createdAt: RECORD.createdAt,
    })
  })
})

describe('revokeApiKeyForClient', () => {
  it('deletes the row behind the keyId', async () => {
    getApiKeysForClient.mockResolvedValue([RECORD])

    await revokeApiKeyForClient('client-1', 'key-1')

    expect(deleteApiKey).toHaveBeenCalledWith(RECORD.keyHash, 'client-1')
  })

  it('answers not-found for a keyId the caller does not own', async () => {
    await expect(revokeApiKeyForClient('client-1', 'someone-elses')).rejects.toBeInstanceOf(ApiKeyNotFoundError)
    expect(deleteApiKey).not.toHaveBeenCalled()
  })
})

describe('authenticateApiKey', () => {
  it('resolves a valid key to its owner and scopes', async () => {
    expect(await authenticateApiKey(KEY)).toEqual({
      ok: true,
      principal: { clientId: 'client-1', keyId: 'key-1', scopes: ['leads:read'] },
    })
    expect(getApiKeyByHash).toHaveBeenCalledWith(hashApiKey(KEY))
  })

  it('rejects anything without the prefix before touching the database', async () => {
    expect(await authenticateApiKey('eyJhbGciOi.some.jwt')).toEqual({ ok: false, reason: 'invalid' })
    expect(getApiKeyByHash).not.toHaveBeenCalled()
  })

  it('rejects an unknown or revoked key without spending a rate-limit count', async () => {
    getApiKeyByHash.mockResolvedValue(null)

    expect(await authenticateApiKey(KEY)).toEqual({ ok: false, reason: 'invalid' })
    expect(incrementApiKeyRate).not.toHaveBeenCalled()
  })

  it('stops working when the account loses API access, even though the key still exists', async () => {
    resolveApiAccess.mockResolvedValue(null)

    expect(await authenticateApiKey(KEY)).toEqual({ ok: false, reason: 'plan' })
  })

  it('serves the request that exactly reaches the limit and blocks the next', async () => {
    incrementApiKeyRate.mockResolvedValue(120)
    expect((await authenticateApiKey(KEY)).ok).toBe(true)

    incrementApiKeyRate.mockResolvedValue(121)
    expect(await authenticateApiKey(KEY)).toEqual({ ok: false, reason: 'rate_limited', retryAfterSeconds: 60 })
  })

  it('lets the request through when Redis cannot be read', async () => {
    incrementApiKeyRate.mockResolvedValue(null)

    expect((await authenticateApiKey(KEY)).ok).toBe(true)
  })

  it('records use for a key never used before', async () => {
    await authenticateApiKey(KEY)

    expect(touchApiKeyLastUsed).toHaveBeenCalledWith(RECORD.keyHash, expect.any(String))
  })

  it('does not write on every request', async () => {
    getApiKeyByHash.mockResolvedValue({ ...RECORD, lastUsedAt: new Date().toISOString() })

    await authenticateApiKey(KEY)

    expect(touchApiKeyLastUsed).not.toHaveBeenCalled()
  })

  it('still authenticates when recording use fails', async () => {
    touchApiKeyLastUsed.mockRejectedValue(new Error('dynamo down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect((await authenticateApiKey(KEY)).ok).toBe(true)
  })
})
