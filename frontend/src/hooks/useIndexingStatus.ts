import { useCallback, useEffect, useRef, useState } from 'react'
import type { IndexingJob } from '../types/index'

interface UseIndexingStatusResult {
  job: IndexingJob | undefined
  isLoading: boolean
  refresh: () => void
}

const POLL_INTERVAL_MS = 2500
const ACTIVE_STATUSES: ReadonlySet<IndexingJob['status']> = new Set(['pending', 'queued', 'processing'])

// fetchFn is stashed in a ref rather than taken as a dependency of the effect/
// callbacks below, so callers don't need to memoize it with useCallback
// themselves — a fresh inline arrow function passed on every render won't tear
// down and restart the poll loop.
export function useIndexingStatus(
  agentId: string,
  fetchFn: () => Promise<IndexingJob | undefined>,
  enabled = true
): UseIndexingStatusResult {
  const [job, setJob] = useState<IndexingJob | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)
  const fetchFnRef = useRef(fetchFn)
  fetchFnRef.current = fetchFn
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const stopPolling = useCallback(() => {
    if (intervalRef.current !== undefined) {
      clearInterval(intervalRef.current)
      intervalRef.current = undefined
    }
  }, [])

  const tick = useCallback(async () => {
    const result = await fetchFnRef.current()
    setJob(result)
    setIsLoading(false)

    const isActive = result !== undefined && ACTIVE_STATUSES.has(result.status)
    if (!isActive) stopPolling()
  }, [stopPolling])

  const startPolling = useCallback(() => {
    stopPolling()
    setIsLoading(true)
    tick()
    intervalRef.current = setInterval(tick, POLL_INTERVAL_MS)
  }, [stopPolling, tick])

  useEffect(() => {
    if (!enabled) {
      stopPolling()
      return
    }
    startPolling()
    return stopPolling
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, enabled])

  const refresh = useCallback(() => {
    startPolling()
  }, [startPolling])

  return { job, isLoading, refresh }
}
