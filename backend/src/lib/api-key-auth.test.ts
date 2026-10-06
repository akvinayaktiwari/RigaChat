import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

const authenticateApiKey = vi.fn()
vi.mock('../services/api-key-service.js', () => ({
  authenticateApiKey,
  isWriteScope: (scope: string) => scope.endsWith(':write'),
}))

const { requireApiKey } = await import('./api-key-auth.js')

const app = new Hono()
  .get('/leads', requireApiKey('leads:read'), (c) => c.json({ data: c.get('apiPrincipal').clientId }))
  .post('/forms', requireApiKey('forms:write'), (c) => c.json({ data: c.get('apiPrincipal').clientId }, 201))

function get(headers: Record<string, string> = {}) {
  return app.request('/leads', { headers })
}

const PRINCIPAL = { clientId: 'client-1', keyId: 'key-1', scopes: ['leads:read'], access: 'full' }
const WRITER = { ...PRINCIPAL, scopes: ['forms:write'] }

function postForm() {
  return app.request('/forms', { method: 'POST', headers: { Authorization: 'Bearer vy_live_abc' } })
}

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

  it('serves a write on a plan with full API access', async () => {
    authenticateApiKey.mockResolvedValue({ ok: true, principal: WRITER })

    expect((await postForm()).status).toBe(201)
  })

  it('403s a write on a read-only plan even though the key holds the scope', async () => {
    authenticateApiKey.mockResolvedValue({ ok: true, principal: { ...WRITER, access: 'read' } })

    const res = await postForm()

    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('write_access_disabled')
  })

  it('still serves reads on a read-only plan', async () => {
    authenticateApiKey.mockResolvedValue({ ok: true, principal: { ...PRINCIPAL, access: 'read' } })

    expect((await get({ Authorization: 'Bearer vy_live_abc' })).status).toBe(200)
  })

  it('names the missing scope, not the plan, when a read-only plan\'s key also lacks the scope', async () => {
    authenticateApiKey.mockResolvedValue({ ok: true, principal: { ...PRINCIPAL, access: 'read' } })

    expect((await (await postForm()).json()).error.code).toBe('insufficient_scope')
  })

  it('429s with Retry-After when the key is over its limit', async () => {
    authenticateApiKey.mockResolvedValue({ ok: false, reason: 'rate_limited', retryAfterSeconds: 60 })

    const res = await get({ Authorization: 'Bearer vy_live_abc' })

    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('60')
  })
})
