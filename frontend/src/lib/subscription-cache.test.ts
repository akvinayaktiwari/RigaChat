import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearSubscriptionCache,
  readSubscriptionCache,
  subscriptionCacheAgeMs,
  writeSubscriptionCache,
} from './subscription-cache'
import type { SubscriptionSummary } from '../types'

const CLIENT_ID = 'client-1'
const KEY = `bb_subscription:${CLIENT_ID}`
const MAX_AGE_MS = 60 * 60 * 1000

// Only the fields the app actually reads off the cache; the rest of
// SubscriptionSummary is irrelevant to the storage layer's behaviour.
const SUMMARY = {
  plan: 'agency',
  status: 'active',
  trialEndsAt: null,
  features: {
    agents: { limits: { max: null } },
    voice: { enabled: true },
    kbFileSize: { limits: { maxBytes: 10485760 } },
  },
  usage: { chatConversations: 0 },
} as unknown as SubscriptionSummary

beforeEach(() => {
  sessionStorage.clear()
  vi.useRealTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('writeSubscriptionCache / readSubscriptionCache', () => {
  it('round-trips a summary under a clientId-scoped key', () => {
    writeSubscriptionCache(CLIENT_ID, SUMMARY)

    expect(sessionStorage.getItem(KEY)).not.toBeNull()
    expect(readSubscriptionCache(CLIENT_ID)).toEqual(SUMMARY)
  })

  // The reason the key is scoped at all: signing into a second account must
  // never read the first account's entitlements.
  it('does not serve one account the other account cache', () => {
    writeSubscriptionCache(CLIENT_ID, SUMMARY)

    expect(readSubscriptionCache('client-2')).toBeNull()
  })

  it('returns null when nothing is cached', () => {
    expect(readSubscriptionCache(CLIENT_ID)).toBeNull()
  })

  it('returns null rather than throwing on corrupt JSON', () => {
    sessionStorage.setItem(KEY, 'not json{{{')

    expect(readSubscriptionCache(CLIENT_ID)).toBeNull()
  })

  it('returns null when the entry has no usable timestamp', () => {
    sessionStorage.setItem(KEY, JSON.stringify({ data: SUMMARY }))

    expect(readSubscriptionCache(CLIENT_ID)).toBeNull()
  })

  it('returns null when the entry has no data', () => {
    sessionStorage.setItem(KEY, JSON.stringify({ fetchedAt: Date.now() }))

    expect(readSubscriptionCache(CLIENT_ID)).toBeNull()
  })
})

describe('cache expiry', () => {
  it('still serves an entry just inside the max age', () => {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ fetchedAt: Date.now() - (MAX_AGE_MS - 1000), data: SUMMARY })
    )

    expect(readSubscriptionCache(CLIENT_ID)).toEqual(SUMMARY)
  })

  // The boundary that bounds a tab left open for days. Past it the page shows
  // its loading state instead of painting entitlements nobody has revalidated.
  it('refuses an entry past the max age', () => {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ fetchedAt: Date.now() - (MAX_AGE_MS + 1000), data: SUMMARY })
    )

    expect(readSubscriptionCache(CLIENT_ID)).toBeNull()
  })
})

describe('subscriptionCacheAgeMs', () => {
  it('reports roughly how old the entry is', () => {
    sessionStorage.setItem(KEY, JSON.stringify({ fetchedAt: Date.now() - 5000, data: SUMMARY }))

    const age = subscriptionCacheAgeMs(CLIENT_ID)
    expect(age).not.toBeNull()
    expect(age as number).toBeGreaterThanOrEqual(5000)
    expect(age as number).toBeLessThan(6000)
  })

  it('returns null when there is nothing cached', () => {
    expect(subscriptionCacheAgeMs(CLIENT_ID)).toBeNull()
  })

  it('returns null on a malformed entry instead of throwing', () => {
    sessionStorage.setItem(KEY, 'garbage')

    expect(subscriptionCacheAgeMs(CLIENT_ID)).toBeNull()
  })

  // Deliberately NOT age-capped: the focus throttle needs the true age even
  // for an entry the reader would refuse, so it can decide to refetch.
  it('reports the age of an entry older than the read cap', () => {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ fetchedAt: Date.now() - (MAX_AGE_MS + 5000), data: SUMMARY })
    )

    expect(subscriptionCacheAgeMs(CLIENT_ID)).toBeGreaterThan(MAX_AGE_MS)
  })
})

describe('clearSubscriptionCache', () => {
  // The one that matters most. clearSession() calls this on logout, and a
  // greedy implementation (sessionStorage.clear()) would also drop bb_token
  // and bb_user mid-flight.
  it('removes every cached account but touches nothing else', () => {
    writeSubscriptionCache('client-1', SUMMARY)
    writeSubscriptionCache('client-2', SUMMARY)
    sessionStorage.setItem('bb_token', 'jwt')
    sessionStorage.setItem('bb_user', '{}')
    sessionStorage.setItem('unrelated', 'keep me')

    clearSubscriptionCache()

    expect(readSubscriptionCache('client-1')).toBeNull()
    expect(readSubscriptionCache('client-2')).toBeNull()
    expect(sessionStorage.getItem('bb_token')).toBe('jwt')
    expect(sessionStorage.getItem('bb_user')).toBe('{}')
    expect(sessionStorage.getItem('unrelated')).toBe('keep me')
  })

  it('is a no-op when nothing is cached', () => {
    expect(() => clearSubscriptionCache()).not.toThrow()
  })
})

describe('storage failures', () => {
  // Safari private mode throws on setItem. The provider still works from
  // memory; it just pays for a fetch on the next reload.
  it('swallows a write that the browser rejects', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    expect(() => writeSubscriptionCache(CLIENT_ID, SUMMARY)).not.toThrow()

    spy.mockRestore()
  })

  it('swallows a read that the browser rejects', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })

    expect(readSubscriptionCache(CLIENT_ID)).toBeNull()

    spy.mockRestore()
  })
})
