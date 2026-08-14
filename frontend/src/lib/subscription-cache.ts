import type { SubscriptionSummary } from '../types'

// Storage layer for the cached subscription summary.
//
// Its own module, rather than living in useSubscription.ts, purely to break an
// import cycle: useSubscription imports useAuth (for the signed-in clientId),
// and useAuth needs to clear the cache on logout. Both import this instead,
// which imports nothing but a type.

const STORAGE_KEY_PREFIX = 'bb_subscription:'

// Bounds the worst case of a tab left open for days. Mount and focus
// revalidation normally correct a stale value long before this matters.
const MAX_CACHE_AGE_MS = 60 * 60 * 1000

interface CachedSubscription {
  fetchedAt: number
  data: SubscriptionSummary
}

// sessionStorage, not localStorage, matching the deliberate choice documented
// in useAuth.ts: it survives a page refresh but dies with the tab and cannot
// be read from other tabs. Entitlements should not outlive the session whose
// token fetched them.
function storageKey(clientId: string): string {
  return `${STORAGE_KEY_PREFIX}${clientId}`
}

// Age of the cached entry, or null when there is nothing usable cached.
// Lets the provider decide whether a revalidation is worth a request.
export function subscriptionCacheAgeMs(clientId: string): number | null {
  try {
    const raw = sessionStorage.getItem(storageKey(clientId))
    if (!raw) return null

    const parsed = JSON.parse(raw) as CachedSubscription
    if (typeof parsed.fetchedAt !== 'number') return null

    return Date.now() - parsed.fetchedAt
  } catch {
    return null
  }
}

export function readSubscriptionCache(clientId: string): SubscriptionSummary | null {
  try {
    const raw = sessionStorage.getItem(storageKey(clientId))
    if (!raw) return null

    const parsed = JSON.parse(raw) as CachedSubscription
    if (!parsed.data || typeof parsed.fetchedAt !== 'number') return null
    if (Date.now() - parsed.fetchedAt > MAX_CACHE_AGE_MS) return null

    return parsed.data
  } catch {
    // Corrupt or unreadable cache is not worth surfacing -- falling back to a
    // fetch is exactly the pre-cache behaviour.
    return null
  }
}

// `usage` is deliberately dropped before storing. Everything else here is an
// entitlement -- what the account is allowed to do -- which changes only when a
// plan changes and is safe to serve from cache for an hour. A usage counter is
// the opposite: it moves with every conversation, so a cached one is wrong
// almost immediately. No page reads it off the provider today, and this keeps
// it that way by construction rather than by convention: a future
// "47 of 100 conversations" display fed from useSubscription() gets `undefined`
// on a cache hit and has to wait for the revalidation, instead of silently
// rendering a stale number that looks authoritative.
export function writeSubscriptionCache(clientId: string, data: SubscriptionSummary): void {
  try {
    const { usage: _usage, ...cacheable } = data
    const payload: CachedSubscription = { fetchedAt: Date.now(), data: cacheable }
    sessionStorage.setItem(storageKey(clientId), JSON.stringify(payload))
  } catch {
    // Quota, or a privacy mode that blocks storage. The provider still works
    // from memory; it just pays for a fetch on the next reload.
  }
}

// Called by useAuth's clearSession() on logout. Clears every cached account,
// not only the current one, because logout is exactly when we know nothing
// should be left for whoever signs in next.
export function clearSubscriptionCache(): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i)
      if (key?.startsWith(STORAGE_KEY_PREFIX)) keys.push(key)
    }
    keys.forEach((key) => sessionStorage.removeItem(key))
  } catch {
    // Storage unavailable -- nothing cached, nothing to clear.
  }
}
