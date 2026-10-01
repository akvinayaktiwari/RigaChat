import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

// The service is covered in whatsapp-template-service.test.ts. What is checked
// here is the HTTP contract: which typed error becomes which status code.
const listWhatsAppTemplates = vi.fn()
const createWhatsAppTemplate = vi.fn()

// The real error classes, not fakes: the routes branch on `instanceof`.
const { UnknownWhatsAppTemplateError, WhatsAppNotConnectedError, WhatsAppTemplateCreateError } = await import(
  '../services/whatsapp-template-service.js'
)

vi.mock('../services/whatsapp-template-service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/whatsapp-template-service.js')>()
  return { ...actual, listWhatsAppTemplates, createWhatsAppTemplate }
})

// Replaced wholesale for the reason voice-phone-routes.test.ts gives:
// lib/cognito.js validates its env at import.
vi.mock('../lib/cognito.js', async () => {
  const { createMiddleware } = await import('hono/factory')
  return {
    requireAuth: createMiddleware(async (c, next) => {
      c.set('user', { sub: 'client-1', email: 'owner@example.com', name: 'Owner' })
      await next()
    }),
  }
})

const { whatsAppTemplateRoutes } = await import('./whatsapp-template-routes.js')

const PATH = '/api/integrations/meta-whatsapp/templates'
const app = new Hono().route(PATH, whatsAppTemplateRoutes)

const TEMPLATE = {
  name: 'lead_notification_1',
  language: 'en',
  category: 'UTILITY',
  body: 'New lead from {{1}}',
  status: 'PENDING',
}

function post(body: unknown) {
  return app.request(PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  listWhatsAppTemplates.mockResolvedValue([TEMPLATE])
  createWhatsAppTemplate.mockResolvedValue(TEMPLATE)
})

describe('GET /', () => {
  it("returns the caller's templates", async () => {
    const res = await app.request(PATH)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, data: [TEMPLATE] })
    expect(listWhatsAppTemplates).toHaveBeenCalledWith('client-1')
  })

  it('409s a client that has not connected WhatsApp, not 500', async () => {
    listWhatsAppTemplates.mockRejectedValue(new WhatsAppNotConnectedError())

    expect((await app.request(PATH)).status).toBe(409)
  })

  it('500s an unexpected failure', async () => {
    listWhatsAppTemplates.mockRejectedValue(new Error('Listing templates failed: status 500'))

    expect((await app.request(PATH)).status).toBe(500)
  })
})

describe('POST /', () => {
  it('creates the named template for the caller', async () => {
    const res = await post({ name: 'lead_notification_1' })

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ success: true, data: TEMPLATE })
    expect(createWhatsAppTemplate).toHaveBeenCalledWith('client-1', 'lead_notification_1')
  })

  it.each([[{}], [{ name: '   ' }], [{ name: 42 }], ['not json']])('400s a body with no usable name: %j', async (body) => {
    const res = await post(body)

    expect(res.status).toBe(400)
    expect(createWhatsAppTemplate).not.toHaveBeenCalled()
  })

  it('404s a name outside the library', async () => {
    createWhatsAppTemplate.mockRejectedValue(new UnknownWhatsAppTemplateError('free_iphone'))

    expect((await post({ name: 'free_iphone' })).status).toBe(404)
  })

  it('409s a client that has not connected WhatsApp', async () => {
    createWhatsAppTemplate.mockRejectedValue(new WhatsAppNotConnectedError())

    expect((await post({ name: 'lead_notification_1' })).status).toBe(409)
  })

  it("502s a refusal from Meta and passes Meta's reason through", async () => {
    createWhatsAppTemplate.mockRejectedValue(new WhatsAppTemplateCreateError('Template name already exists'))

    const res = await post({ name: 'lead_notification_1' })

    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ success: false, error: 'Template name already exists' })
  })
})
