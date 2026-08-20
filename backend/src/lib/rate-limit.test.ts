import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

const incrementChatRate = vi.fn()
vi.mock('../repositories/redis-repository.js', () => ({
  incrementChatRate: (...args: unknown[]) => incrementChatRate(...args),
}))

vi.mock('./client-ip.js', () => ({
  getClientIp: () => '203.0.113.7',
}))

const { rateLimit } = await import('./rate-limit.js')

function appWith(max: number) {
  const app = new Hono()
  app.post(
    '/chat',
    rateLimit({ bucket: 'start', max, windowSeconds: 300, message: 'Slow down please.' }),
    (c) => c.json({ success: true, data: 'served' })
  )
  return app
}

beforeEach(() => {
  incrementChatRate.mockReset()
})

describe('inside the limit', () => {
  it('serves the request', async () => {
    incrementChatRate.mockResolvedValue(1)

    const res = await appWith(10).request('/chat', { method: 'POST' })

    expect(res.status).toBe(200)
  })

  it('serves the request that exactly reaches the limit', async () => {
    // `max` is the number allowed, so the Nth request must still be served.
    // An off-by-one here silently costs a real visitor their last message.
    incrementChatRate.mockResolvedValue(10)

    const res = await appWith(10).request('/chat', { method: 'POST' })

    expect(res.status).toBe(200)
  })
})

describe('over the limit', () => {
  it('rejects with 429 and does not reach the handler', async () => {
    incrementChatRate.mockResolvedValue(11)

    const res = await appWith(10).request('/chat', { method: 'POST' })
    const body = (await res.json()) as { success: boolean; error: string }

    expect(res.status).toBe(429)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Slow down please.')
  })

  it('tells the caller when to come back', async () => {
    incrementChatRate.mockResolvedValue(99)

    const res = await appWith(10).request('/chat', { method: 'POST' })

    expect(res.headers.get('Retry-After')).toBe('300')
  })

  // The message reaches a real person who tripped a limit meant for scripts,
  // so it must say what to do rather than name the rule.
  it('does not leak the rule in the message', async () => {
    incrementChatRate.mockResolvedValue(11)

    const res = await appWith(10).request('/chat', { method: 'POST' })
    const body = (await res.json()) as { error: string }

    expect(body.error).not.toMatch(/rate|limit|bucket|redis/i)
  })
})

// THE PART MOST LIKELY TO BE WRONG, so it is pinned hardest.
//
// If Redis is unreachable this must ALLOW. Failing closed would turn a cache
// dependency into an availability dependency for every client's chat widget --
// one bad minute at Upstash and no visitor anywhere gets an answer. Spend
// inside a conversation is still bounded by MESSAGE_CEILING_PER_CONVERSATION,
// which is enforced from DynamoDB and needs no Redis.
describe('when the counter cannot be read', () => {
  it('allows the request through rather than failing closed', async () => {
    incrementChatRate.mockResolvedValue(null)

    const res = await appWith(10).request('/chat', { method: 'POST' })

    expect(res.status).toBe(200)
  })

  it('allows it even when the limit would otherwise be long exceeded', async () => {
    incrementChatRate.mockResolvedValue(null)

    const res = await appWith(1).request('/chat', { method: 'POST' })

    expect(res.status).toBe(200)
  })
})

describe('what it counts', () => {
  it('counts per bucket, per caller, over the configured window', async () => {
    incrementChatRate.mockResolvedValue(1)

    await appWith(10).request('/chat', { method: 'POST' })

    expect(incrementChatRate).toHaveBeenCalledWith('start', '203.0.113.7', 300)
  })

  it('counts the blocked request too, so a script cannot outrun the window', async () => {
    incrementChatRate.mockResolvedValue(11)

    await appWith(10).request('/chat', { method: 'POST' })

    expect(incrementChatRate).toHaveBeenCalledTimes(1)
  })
})
