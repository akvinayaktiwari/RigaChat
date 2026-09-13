import { describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

// What is under test is not the route's status codes -- it is that the BROWSER
// path and the TELEPHONY path describe the same agent identically. The widget
// fetches GET /context/:agentId and sends the result back over the relay
// socket, where it replaces what the relay itself built. So if these two ever
// disagree, the disclosure (or the persona, which is how the drift was found)
// is spoken on a phone call and silently skipped in the widget.
const getVoiceAgentContext = vi.fn()

vi.mock('../services/voice-service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/voice-service.js')>()
  return { ...actual, getVoiceAgentContext }
})

// See voice-phone-routes.test.ts: lib/cognito.js validates its pool id at
// import, so it is replaced wholesale rather than spread from the original.
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
const { buildInstructions } = await import('../voice-relay/relay.js')

const app = new Hono().route('/api/voice-agents', voiceRoutes)

const AGENT = {
  agentId: 'agent-1',
  clientId: 'client-1',
  name: 'Ravi',
  voice: 'alloy' as const,
  greetingMessage: 'Hello, Acme Estates.',
  systemPrompt: 'You are a leasing agent.',
  brandColor: '#000000',
  widgetPosition: 'bottom-right' as const,
  maxSessionDuration: 10 as const,
  isEnabled: true,
  isIndexed: true,
  createdAt: '2026-09-13T00:00:00.000Z',
  updatedAt: '2026-09-13T00:00:00.000Z',
}

async function contextInstructions(): Promise<string> {
  const res = await app.request('/api/voice-agents/context/agent-1')
  expect(res.status).toBe(200)
  const body = (await res.json()) as { instructions: string }
  return body.instructions
}

describe('recording disclosure across both voice paths', () => {
  it('agrees with the relay when no disclosure is set', async () => {
    getVoiceAgentContext.mockResolvedValue(AGENT)
    expect(await contextInstructions()).toBe(buildInstructions(AGENT))
  })

  it('agrees with the relay when one is set, and speaks it first', async () => {
    const agent = { ...AGENT, recordingDisclosure: 'This call is recorded.' }
    getVoiceAgentContext.mockResolvedValue(agent)

    const browser = await contextInstructions()
    expect(browser).toBe(buildInstructions(agent))
    expect(browser).toContain('This call is recorded.')
    expect(browser.indexOf('This call is recorded.')).toBeLessThan(browser.indexOf('You are a leasing agent.'))
  })

  it('says nothing about recording for an agent without the field', async () => {
    getVoiceAgentContext.mockResolvedValue(AGENT)
    expect((await contextInstructions()).toLowerCase()).not.toContain('record')
  })
})

describe('PATCH validation for the disclosure', () => {
  it('rejects a line too long to be spoken as an opening turn', async () => {
    const res = await app.request('/api/voice-agents/agent-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recordingDisclosure: 'x'.repeat(301) }),
    })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'recordingDisclosure must be 300 characters or fewer' })
  })
})
