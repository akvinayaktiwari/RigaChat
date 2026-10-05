import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

const authenticateApiKey = vi.fn()
vi.mock('../services/api-key-service.js', () => ({ authenticateApiKey }))

const { requireApiKey } = await import('./api-key-auth.js')

const app = new Hono().get('/leads', requireApiKey('leads:read'), (c) =>
  c.json({ data: c.get('apiPrincipal').clientId })
)

function get(headers: Record<string, string> = {}) {
  return app.request('/leads', { headers })
}

const PRINCIPAL = { clientId: 'client-1', keyId: 'key-1', scopes: ['leads:read'] }

beforeEach(() => {
  vi.clearAllMocks()
  authenticateApiKey.mockResolvedValue({ ok: true, principal: PRINCIPAL })
})

describe('requireApiKey', () => {
  it('serves a request with a valid key, as the key\'s own account', async () => {
    const res = await get({ Authorization: 'Bearer vy_live_abc' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: 'client-1' })
    expect(authenticateApiKey).toHaveBeenCalledWith('vy_live_abc')
  })

  it('401s with no Authorization header, without a lookup', async () => {
    const res = await get()

    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('missing_api_key')
    expect(authenticateApiKey).not.toHaveBeenCalled()
  })

  it('401s an unknown or revoked key', async () => {
    authenticateApiKey.mockResolvedValue({ ok: false, reason: 'invalid' })

    const res = await get({ Authorization: 'Bearer vy_live_gone' })

    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('invalid_api_key')
  })

  it('403s when the plan no longer includes the API', async () => {
    authenticateApiKey.mockResolvedValue({ ok: false, reason: 'plan' })

    const res = await get({ Authorization: 'Bearer vy_live_abc' })

    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('api_access_disabled')
  })

  it('403s a key that lacks the route\'s scope', async () => {
    authenticateApiKey.mockResolvedValue({ ok: true, principal: { ...PRINCIPAL, scopes: ['bots:read'] } })

    const res = await get({ Authorization: 'Bearer vy_live_abc' })

    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('insufficient_scope')
  })

  it('429s with Retry-After when the key is over its limit', async () => {
    authenticateApiKey.mockResolvedValue({ ok: false, reason: 'rate_limited', retryAfterSeconds: 60 })

    const res = await get({ Authorization: 'Bearer vy_live_abc' })

    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('60')
  })
})
