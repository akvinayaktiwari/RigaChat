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

export function writeSubscriptionCache(clientId: string, data: SubscriptionSummary): void {
  try {
    const payload: CachedSubscription = { fetchedAt: Date.now(), data }
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
