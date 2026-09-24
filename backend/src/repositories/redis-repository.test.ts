import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RedisProvider } from '../providers/redis/redis-provider.interface.js'

const store = new Map<string, string>()
let failGets = false

const fakeRedis: RedisProvider = {
  get: async (key: string) => {
    if (failGets) throw new Error('redis down')
    return store.get(key) ?? null
  },
  set: async (key: string, value: string) => {
    store.set(key, value)
  },
  delete: async (key: string) => {
    store.delete(key)
  },
  setNX: async () => true,
  incr: async () => 1,
  getProviderName: () => 'upstash',
}

vi.mock('../providers/redis/redis-provider.factory.js', () => ({
  getRedisProvider: () => fakeRedis,
}))

const { getCachedAnswer, setCachedAnswer, deleteCachedAnswer, bumpAnswerCacheGeneration } =
  await import('./redis-repository.js')

describe('answer cache generations', () => {
  beforeEach(() => {
    store.clear()
    failGets = false
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('serves a cached answer until the bot KB changes', async () => {
    await setCachedAnswer('What are your hours?', 'bot-1', 'Nine to five')
    expect(await getCachedAnswer('What are your hours?', 'bot-1')).toBe('Nine to five')

    await bumpAnswerCacheGeneration('bot-1')

    expect(await getCachedAnswer('What are your hours?', 'bot-1')).toBeNull()
  })

  it('leaves other bots cached answers alone', async () => {
    await setCachedAnswer('What are your hours?', 'bot-2', 'Always open')

    await bumpAnswerCacheGeneration('bot-1')

    expect(await getCachedAnswer('What are your hours?', 'bot-2')).toBe('Always open')
  })

  // A counter would reuse a generation after its key expired; a token must not.
  it('never reuses a generation across bumps', async () => {
    await bumpAnswerCacheGeneration('bot-1')
    const first = store.get('kbgen:bot-1')
    await bumpAnswerCacheGeneration('bot-1')

    expect(store.get('kbgen:bot-1')).not.toBe(first)
  })

  it('caches answers written after a bump under the new generation', async () => {
    await bumpAnswerCacheGeneration('bot-1')
    await setCachedAnswer('What are your hours?', 'bot-1', 'Ten to six')

    expect(await getCachedAnswer('What are your hours?', 'bot-1')).toBe('Ten to six')
    await deleteCachedAnswer('What are your hours?', 'bot-1')
    expect(await getCachedAnswer('What are your hours?', 'bot-1')).toBeNull()
  })

  // Falling back to the default generation would file the answer where a later
  // read could serve it after the KB has moved on.
  it('skips the write when the generation cannot be read', async () => {
    failGets = true
    await setCachedAnswer('What are your hours?', 'bot-1', 'Nine to five')

    expect([...store.keys()].filter((key) => key.startsWith('ans:'))).toEqual([])
  })
})
