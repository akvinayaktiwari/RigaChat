import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Check, Loader2 } from 'lucide-react'
import { getBotIndexingStatus, startBotIndexing } from '../services/api'
import type { IndexingJob } from '../types/index'

interface IndexingProgressProps {
  botId: string
  onComplete?: () => void
  onError?: (error: string) => void
}

const POLL_INTERVAL_MS = 3000

type Status = IndexingJob['status']

export function IndexingProgress({ botId, onComplete, onError }: IndexingProgressProps) {
  const [job, setJob] = useState<IndexingJob | null>(null)
  const [status, setStatus] = useState<Status>('pending')
  const [retrying, setRetrying] = useState(false)
  const pollingRef = useRef<number | null>(null)

  function stopPolling() {
    if (pollingRef.current) {
      window.clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }

  async function fetchStatus() {
    const res = await getBotIndexingStatus(botId)
    if (!res.success || !res.data) return

    if ('jobId' in res.data) {
      setJob(res.data)
      setStatus(res.data.status)
      if (res.data.status === 'complete') {
        stopPolling()
        onComplete?.()
      } else if (res.data.status === 'failed') {
        stopPolling()
        onError?.(res.data.error ?? 'Indexing failed')
      }
    }
  }

  useEffect(() => {
    fetchStatus()
    pollingRef.current = window.setInterval(fetchStatus, POLL_INTERVAL_MS)
    return () => stopPolling()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId])

  async function handleTryAgain() {
    if (!job) return
    setRetrying(true)
    try {
      await startBotIndexing(botId, job.websiteUrl)
      setStatus('queued')
      if (!pollingRef.current) {
        pollingRef.current = window.setInterval(fetchStatus, POLL_INTERVAL_MS)
      }
    } finally {
      setRetrying(false)
    }
  }

  if (status === 'complete') {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-2">
        <Check size={18} className="text-emerald-600 shrink-0" />
        <span className="text-sm font-bold text-emerald-700">
          Knowledge base ready — {job?.totalChunks ?? 0} chunks indexed
        </span>
      </div>
    )
  }

  if (status === 'failed') {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
        <div className="flex items-center gap-2">
          <AlertCircle size={18} className="text-rose-600 shrink-0" />
          <span className="text-sm text-rose-700">Indexing failed: {job?.error ?? 'Unknown error'}</span>
        </div>
        <button
          type="button"
          onClick={handleTryAgain}
          disabled={retrying}
          className="mt-3 border border-rose-300 text-rose-600 hover:bg-rose-100 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
        >
          {retrying ? 'Retrying...' : 'Try again'}
        </button>
      </div>
    )
  }

  if (status === 'processing') {
    const pct = job && job.selectedPages > 0 ? Math.min(100, (job.crawledPages / job.selectedPages) * 100) : 0
    return (
      <div className="bg-slate-50 rounded-xl p-4">
        <p className="font-bold text-slate-800 text-sm mb-3">Building Knowledge Base</p>
        <div className="bg-slate-200 rounded-full h-2 w-full mb-2">
          <div className="bg-indigo-600 rounded-full h-2 transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-slate-500">
          {job?.crawledPages ?? 0} of {job?.selectedPages ?? 0} pages processed
        </p>
      </div>
    )
  }

  return (
    <div className="bg-slate-50 rounded-xl p-4 flex items-center gap-2">
      <Loader2 size={16} className="animate-spin text-indigo-600 shrink-0" />
      <span className="text-sm text-slate-500">Queued for processing...</span>
    </div>
  )
}
