import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

const createApiKeyForClient = vi.fn()
const listApiKeysForClient = vi.fn()
const revokeApiKeyForClient = vi.fn()
const updateApiKeyScopesForClient = vi.fn()

vi.mock('../services/api-key-service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api-key-service.js')>()
  return { ...actual, createApiKeyForClient, listApiKeysForClient, revokeApiKeyForClient, updateApiKeyScopesForClient }
})
vi.mock('../repositories/api-key-repository.js', () => ({}))
vi.mock('../repositories/redis-repository.js', () => ({}))

class EntitlementError extends Error {}
vi.mock('../services/entitlement-service.js', () => ({ EntitlementError, resolveApiAccess: vi.fn() }))

// See voice-phone-routes.test.ts for why this is replaced wholesale.
vi.mock('../lib/cognito.js', async () => {
  const { createMiddleware } = await import('hono/factory')
  return {
    requireAuth: createMiddleware(async (c, next) => {
      c.set('user', { sub: 'client-1', email: 'owner@example.com', name: 'Owner' })
      await next()
    }),
  }
})

const { ApiKeyLimitError, ApiKeyNotFoundError, ApiKeyValidationError } = await import('../services/api-key-service.js')
const { apiKeyRoutes } = await import('./api-key-routes.js')

const app = new Hono().route('/api/api-keys', apiKeyRoutes)
app.onError((err, c) => c.json({ thrown: err.constructor.name }, 403))

const CREATED = {
  keyId: 'key-1',
  name: 'Sync',
  last4: 'abcd',
  scopes: ['leads:read'],
  createdAt: '2026-10-05T00:00:00.000Z',
  key: 'vy_live_secret',
}

function post(body: unknown) {
  return app.request('/api/api-keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  createApiKeyForClient.mockResolvedValue(CREATED)
})

describe('POST /', () => {
  it('creates a key for the caller and returns the secret', async () => {
    const res = await post({ name: 'Sync', scopes: ['leads:read'] })

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ success: true, data: CREATED })
    expect(createApiKeyForClient).toHaveBeenCalledWith('client-1', { name: 'Sync', scopes: ['leads:read'] })
  })

  it('400s an unknown scope before reaching the service', async () => {
    const res = await post({ name: 'Sync', scopes: ['leads:delete'] })

    expect(res.status).toBe(400)
    expect(createApiKeyForClient).not.toHaveBeenCalled()
  })

  it('409s at the key ceiling', async () => {
    createApiKeyForClient.mockRejectedValue(new ApiKeyLimitError('too many'))

    expect((await post({ name: 'Sync', scopes: ['leads:read'] })).status).toBe(409)
  })

  it('hands a plan refusal to the app-level handler rather than answering 500', async () => {
    createApiKeyForClient.mockRejectedValue(new EntitlementError('FEATURE_DISABLED'))

    const res = await post({ name: 'Sync', scopes: ['leads:read'] })

    expect(await res.json()).toEqual({ thrown: 'EntitlementError' })
  })
})

describe('GET /', () => {
  it('lists the caller\'s keys', async () => {
    listApiKeysForClient.mockResolvedValue([])

    const res = await app.request('/api/api-keys')

    expect(res.status).toBe(200)
    expect(listApiKeysForClient).toHaveBeenCalledWith('client-1')
  })
})

describe('PATCH /:keyId', () => {
  function patch(body: unknown) {
    return app.request('/api/api-keys/key-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('updates the caller\'s key and returns it without a secret', async () => {
    const { key: _secret, ...summary } = CREATED
    updateApiKeyScopesForClient.mockResolvedValue({ ...summary, scopes: ['forms:write'] })

    const res = await patch({ scopes: ['forms:write'] })

    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual({ ...summary, scopes: ['forms:write'] })
    expect(updateApiKeyScopesForClient).toHaveBeenCalledWith('client-1', 'key-1', { scopes: ['forms:write'] })
  })

  it('400s a refused scope set', async () => {
    updateApiKeyScopesForClient.mockRejectedValue(new ApiKeyValidationError('scopes must be a non-empty array'))

    expect((await patch({ scopes: [] })).status).toBe(400)
  })

  it('404s a key that is not the caller\'s', async () => {
    updateApiKeyScopesForClient.mockRejectedValue(new ApiKeyNotFoundError('API key not found'))

    expect((await patch({ scopes: ['leads:read'] })).status).toBe(404)
  })

  it('hands a plan refusal to the app-level handler', async () => {
    updateApiKeyScopesForClient.mockRejectedValue(new EntitlementError('FEATURE_DISABLED'))

    expect(await (await patch({ scopes: ['leads:read'] })).json()).toEqual({ thrown: 'EntitlementError' })
  })
})

describe('DELETE /:keyId', () => {
  it('revokes', async () => {
    revokeApiKeyForClient.mockResolvedValue(undefined)

    const res = await app.request('/api/api-keys/key-1', { method: 'DELETE' })

    expect(res.status).toBe(200)
    expect(revokeApiKeyForClient).toHaveBeenCalledWith('client-1', 'key-1')
  })

  it('404s a key that is not the caller\'s', async () => {
    revokeApiKeyForClient.mockRejectedValue(new ApiKeyNotFoundError('API key not found'))

    expect((await app.request('/api/api-keys/nope', { method: 'DELETE' })).status).toBe(404)
  })
})
