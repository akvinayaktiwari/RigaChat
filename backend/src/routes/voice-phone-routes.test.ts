import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

// The service layer is exercised thoroughly in voice-phone-assignment.test.ts.
// What is unverified until here is the HTTP contract on top of it: which error
// becomes which status code. A typed error mapped to the wrong status sends a
// client to fix input that was never the problem.
const getVoiceAgentPhoneNumber = vi.fn()
const assignVoiceAgentPhoneNumber = vi.fn()
const releaseVoiceAgentPhoneNumber = vi.fn()

// The real error classes, not fakes: the routes branch on `instanceof`, so a
// stand-in would let a mapping regression pass.
const { InvalidPhoneNumberError, PhoneNumberInUseError, AgentAlreadyHasNumberError } =
  await import('../services/voice-service.js')

vi.mock('../services/voice-service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/voice-service.js')>()
  return {
    ...actual,
    getVoiceAgentPhoneNumber,
    assignVoiceAgentPhoneNumber,
    releaseVoiceAgentPhoneNumber,
  }
})

// Authenticated as client-1. Replaced wholesale rather than through
// importOriginal: lib/cognito.js validates COGNITO_USER_POOL_ID at import and
// rejects the placeholder vitest.config.ts sets, so merely importing the real
// module to spread it throws before any test runs. voice-routes takes only
// requireAuth from here.
vi.mock('../lib/cognito.js', async () => {
  const { createMiddleware } = await import('hono/factory')
  return {
    requireAuth: createMiddleware(async (c, next) => {
      c.set('user', { sub: 'client-1', email: 'owner@example.com', name: 'Owner' })
      await next()
    }),
  }
})

const { voiceRoutes } = await import('./voice-routes.js')

const app = new Hono().route('/api/voice-agents', voiceRoutes)

const ASSIGNMENT = {
  phoneNumber: '+912240000000',
  agentId: 'agent-1',
  clientId: 'client-1',
  assignedAt: '2026-09-06T00:00:00.000Z',
}

function put(body: unknown, agentId = 'agent-1') {
  return app.request(`/api/voice-agents/${agentId}/phone-number`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getVoiceAgentPhoneNumber.mockResolvedValue(null)
  assignVoiceAgentPhoneNumber.mockResolvedValue(ASSIGNMENT)
  releaseVoiceAgentPhoneNumber.mockResolvedValue(undefined)
})

describe('GET /:id/phone-number', () => {
  it('returns the assignment', async () => {
    getVoiceAgentPhoneNumber.mockResolvedValue(ASSIGNMENT)

    const res = await app.request('/api/voice-agents/agent-1/phone-number')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, data: ASSIGNMENT })
    expect(getVoiceAgentPhoneNumber).toHaveBeenCalledWith('agent-1', 'client-1')
  })

  it('returns 200 with null for a browser-only agent, not 404', async () => {
    // Most agents have no number and never will. A 404 here would make the
    // dashboard render an error for the normal case.
    const res = await app.request('/api/voice-agents/agent-1/phone-number')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, data: null })
  })

  it('404s an agent that is not yours', async () => {
    getVoiceAgentPhoneNumber.mockRejectedValue(new Error('Voice agent not found'))

    const res = await app.request('/api/voice-agents/agent-1/phone-number')

    expect(res.status).toBe(404)
  })

  it('500s an unexpected failure rather than reporting no number', async () => {
    getVoiceAgentPhoneNumber.mockRejectedValue(new Error('DynamoDB unavailable'))

    expect((await app.request('/api/voice-agents/agent-1/phone-number')).status).toBe(500)
  })
})

describe('PUT /:id/phone-number', () => {
  it('assigns and returns the row', async () => {
    const res = await put({ phoneNumber: '+912240000000' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, data: ASSIGNMENT })
    expect(assignVoiceAgentPhoneNumber).toHaveBeenCalledWith('agent-1', 'client-1', '+912240000000')
  })

  it('400s a body that is not JSON, without reaching the service', async () => {
    const res = await put('not json at all')

    expect(res.status).toBe(400)
    expect(assignVoiceAgentPhoneNumber).not.toHaveBeenCalled()
  })

  it.each([
    ['missing', {}],
    ['empty', { phoneNumber: '' }],
    ['whitespace', { phoneNumber: '   ' }],
    ['not a string', { phoneNumber: 919876543210 }],
  ])('400s a %s phoneNumber without reaching the service', async (_label, body) => {
    const res = await put(body)

    expect(res.status).toBe(400)
    expect(assignVoiceAgentPhoneNumber).not.toHaveBeenCalled()
  })

  it('400s a malformed number, which the client can fix', async () => {
    assignVoiceAgentPhoneNumber.mockRejectedValue(new InvalidPhoneNumberError('nope'))

    const res = await put({ phoneNumber: 'nope' })

    expect(res.status).toBe(400)
  })

  // 409 rather than 400: the request is well formed and correcting the input
  // cannot fix it. A 400 sends the client editing a number that was fine.
  it('409s a number another agent holds', async () => {
    assignVoiceAgentPhoneNumber.mockRejectedValue(new PhoneNumberInUseError('+912240000000'))

    const res = await put({ phoneNumber: '+912240000000' })

    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/already assigned/i)
  })

  it('409s when this agent already answers on a different number', async () => {
    assignVoiceAgentPhoneNumber.mockRejectedValue(new AgentAlreadyHasNumberError('+912299999999'))

    const res = await put({ phoneNumber: '+912240000000' })

    expect(res.status).toBe(409)
    // The number it already holds is in the message, so the client knows what
    // to release rather than having to go and look.
    expect((await res.json()).error).toContain('+912299999999')
  })

  it('404s an agent that is not yours', async () => {
    assignVoiceAgentPhoneNumber.mockRejectedValue(new Error('Voice agent not found'))

    expect((await put({ phoneNumber: '+912240000000' })).status).toBe(404)
  })

  it('500s an unexpected failure', async () => {
    assignVoiceAgentPhoneNumber.mockRejectedValue(new Error('DynamoDB unavailable'))

    expect((await put({ phoneNumber: '+912240000000' })).status).toBe(500)
  })
})

describe('DELETE /:id/phone-number', () => {
  function del(agentId = 'agent-1') {
    return app.request(`/api/voice-agents/${agentId}/phone-number`, { method: 'DELETE' })
  }

  it('releases and returns 204 with no body', async () => {
    const res = await del()

    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
    expect(releaseVoiceAgentPhoneNumber).toHaveBeenCalledWith('agent-1', 'client-1')
  })

  it('takes no number from the caller', async () => {
    // The server knows which number the agent holds. Accepting one would let a
    // wrong value delete a row for an agent they own but did not mean to touch.
    await del()

    expect(releaseVoiceAgentPhoneNumber).toHaveBeenCalledWith('agent-1', 'client-1')
    expect(releaseVoiceAgentPhoneNumber.mock.calls[0]).toHaveLength(2)
  })

  it('is idempotent for an agent with no number', async () => {
    expect((await del()).status).toBe(204)
  })

  it('404s an agent that is not yours', async () => {
    releaseVoiceAgentPhoneNumber.mockRejectedValue(new Error('Voice agent not found'))

    expect((await del()).status).toBe(404)
  })

  it('500s an unexpected failure', async () => {
    releaseVoiceAgentPhoneNumber.mockRejectedValue(new Error('DynamoDB unavailable'))

    expect((await del()).status).toBe(500)
  })
})
