import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { getMySubscription } from '../services/api'
import { readSubscriptionCache, writeSubscriptionCache } from '../lib/subscription-cache'
import type { SubscriptionSummary } from '../types'
import { useAuth } from './useAuth'

// One shared subscription read for the whole dashboard.
//
// Before this, seven pages each called getMySubscription() in their own mount
// effect, and BotsPage gated its entire render on the result. Every navigation
// and every reload paid for a fresh round trip before anything appeared.
//
// The value is cosmetic: it decides whether a page shows the create button or
// the upsell. The real cap is enforced server-side in bot-service.ts's
// checkEntitlement(), which counts actual bots and throws LIMIT_EXCEEDED. That
// is what makes caching safe here -- a stale or hand-edited cache can at worst
// show a button that the server then refuses.
//
//   mount ──> sessionStorage hit? ──yes──> paint immediately (no spinner)
//                   │                            │
//                   no                           └──> revalidate in background
//                   │
//                   └──> fetch, then paint
//
// Staleness is handled by always revalidating, never by trusting the cache:
//   - every mount revalidates in the background
//   - window focus revalidates (plan bought in another tab or on another device)
//   - refresh() forces a bypass, called the moment a checkout confirms
//   - anything past the cache module's max age is not painted at all

export interface SubscriptionContextValue {
  subscription: SubscriptionSummary | null
  // True only when there is nothing to show yet. A cache hit means false on
  // the first render, which is the whole point: no spinner on reload.
  isLoading: boolean
  // A background revalidation is in flight over an already-painted value.
  // Exposed for callers that want a subtle indicator; never gate render on it.
  isValidating: boolean
  // Forces a fresh read, bypassing and then overwriting the cache. Call this
  // after anything that changes the plan -- checkout confirmation above all.
  refresh: () => Promise<SubscriptionSummary | null>
}

const SubscriptionContext = createContext<SubscriptionContextValue | undefined>(undefined)

export function SubscriptionProvider({ children }: { children: ReactNode }): ReactNode {
  const { isAuthenticated, user } = useAuth()
  const clientId = user?.clientId ?? null

  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isValidating, setIsValidating] = useState(false)

  // Lets an in-flight fetch know its account is no longer the current one, so
  // a slow response for account A cannot land after a switch to account B.
  const activeClientRef = useRef<string | null>(null)

  const fetchSubscription = useCallback(
    async (targetClientId: string): Promise<SubscriptionSummary | null> => {
      setIsValidating(true)
      try {
        const res = await getMySubscription()
        if (activeClientRef.current !== targetClientId) return null

        if (res.success && res.data) {
          setSubscription(res.data)
          writeSubscriptionCache(targetClientId, res.data)
          return res.data
        }
        return null
      } catch {
        // Keep whatever is already painted. A failed revalidation must not
        // blank out a working page.
        return null
      } finally {
        if (activeClientRef.current === targetClientId) {
          setIsValidating(false)
          setIsLoading(false)
        }
      }
    },
    []
  )

  useEffect(() => {
    activeClientRef.current = clientId

    if (!isAuthenticated || !clientId) {
      setSubscription(null)
      setIsLoading(false)
      return
    }

    const cached = readSubscriptionCache(clientId)
    if (cached) {
      setSubscription(cached)
      setIsLoading(false)
    } else {
      setSubscription(null)
      setIsLoading(true)
    }

    // Revalidate either way. On a cache hit this is invisible; on a miss it is
    // the only fetch.
    void fetchSubscription(clientId)
  }, [isAuthenticated, clientId, fetchSubscription])

  // A plan bought in another tab, on another device, or through a support
  // action never reaches this tab otherwise. Revalidating when the user comes
  // back is the cheapest way to notice.
  useEffect(() => {
    if (!isAuthenticated || !clientId) return

    const onFocus = (): void => {
      void fetchSubscription(clientId)
    }

    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [isAuthenticated, clientId, fetchSubscription])

  const refresh = useCallback(async (): Promise<SubscriptionSummary | null> => {
    if (!clientId) return null
    return fetchSubscription(clientId)
  }, [clientId, fetchSubscription])

  return createElement(
    SubscriptionContext.Provider,
    { value: { subscription, isLoading, isValidating, refresh } },
    children
  )
}

export function useSubscription(): SubscriptionContextValue {
  const ctx = useContext(SubscriptionContext)
  if (!ctx) {
    throw new Error('useSubscription must be used within a SubscriptionProvider')
  }
  return ctx
}
