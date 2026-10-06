import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { ApiScope } from '../types/index.js'

const listLeads = vi.fn()
const getLead = vi.fn()
const listBots = vi.fn()
const getBot = vi.fn()

vi.mock('../services/public-api-service.js', () => {
  class PublicResourceNotFoundError extends Error {}
  return {
    PublicResourceNotFoundError,
    MAX_LEAD_PAGE_SIZE: 200,
    listLeads,
    getLead,
    listBots,
    getBot,
    listForms: vi.fn(),
    getForm: vi.fn(),
    listVoiceAgents: vi.fn(),
    getVoiceAgent: vi.fn(),
  }
})

// Authenticated as client-1 holding whichever scope the route asks for; the
// middleware's own behaviour is covered in lib/api-key-auth.test.ts. The scope
// each route demands is recorded so a route guarded by the wrong one fails here.
const requiredScopes: string[] = []
vi.mock('../lib/api-key-auth.js', async () => {
  const { createMiddleware } = await import('hono/factory')
  return {
    requireApiKey: (scope: ApiScope) =>
      createMiddleware(async (c, next) => {
        requiredScopes.push(`${c.req.path} ${scope}`)
        c.set('apiPrincipal', { clientId: 'client-1', keyId: 'key-1', scopes: [scope], access: 'full' })
        await next()
      }),
  }
})

const { PublicResourceNotFoundError } = await import('../services/public-api-service.js')
const { v1Routes } = await import('./v1-routes.js')

const app = new Hono().route('/v1', v1Routes)

beforeEach(() => {
  vi.clearAllMocks()
  requiredScopes.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET /v1/leads', () => {
  it('returns the page as the body, scoped to the key\'s account', async () => {
    const page = { data: [], nextCursor: null, total: 0 }
    listLeads.mockResolvedValue(page)

    const res = await app.request('/v1/leads?limit=25&cursor=abc&includeArchived=true')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(page)
    expect(listLeads).toHaveBeenCalledWith('client-1', { limit: 25, cursor: 'abc', includeArchived: true })
    expect(requiredScopes).toEqual(['/v1/leads leads:read'])
  })

  it.each(['0', '201', 'ten', '1.5'])('400s limit=%s', async (limit) => {
    const res = await app.request(`/v1/leads?limit=${limit}`)

    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('invalid_request')
    expect(listLeads).not.toHaveBeenCalled()
  })
})

describe('GET /v1/leads/:id', () => {
  it('wraps the lead in data', async () => {
    getLead.mockResolvedValue({ id: 'lead_x' })

    const res = await app.request('/v1/leads/lead_x')

    expect(await res.json()).toEqual({ data: { id: 'lead_x' } })
    expect(getLead).toHaveBeenCalledWith('client-1', 'lead_x')
  })

  it('404s in the v1 error shape', async () => {
    getLead.mockRejectedValue(new PublicResourceNotFoundError('Lead not found'))

    const res = await app.request('/v1/leads/lead_x')

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'Lead not found' } })
  })
})

describe('bots', () => {
  it('guards bot reads with the bots scope, not the leads one', async () => {
    listBots.mockResolvedValue([])
    getBot.mockResolvedValue({ botId: 'bot-1' })

    await app.request('/v1/bots')
    await app.request('/v1/bots/bot-1')

    expect(requiredScopes).toEqual(['/v1/bots bots:read', '/v1/bots/bot-1 bots:read'])
    expect(getBot).toHaveBeenCalledWith('client-1', 'bot-1')
  })

  it('does not leak an internal error message on a 500', async () => {
    listBots.mockRejectedValue(new Error('Failed to query table bots: AccessDenied'))

    const res = await app.request('/v1/bots')

    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('AccessDenied')
  })
})

describe('unknown paths', () => {
  it('404s in the v1 error shape', async () => {
    const res = await app.request('/v1/nope')

    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('not_found')
  })
})
