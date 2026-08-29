import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, UserRound } from 'lucide-react'
import { getJourneyExecutions } from '../../services/api'
import type { JourneyExecutionSummary } from '../../types/index'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

// Deliberately no percentages anywhere in this component. At the volumes this
// runs at, a conversion rate is noise wearing the costume of a metric, and a
// chart that looks authoritative while being noise is worse than no chart.
const STATUS_STYLES: Record<JourneyExecutionSummary['status'], { label: string; className: string }> = {
  running: { label: 'In flight', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  completed: { label: 'Completed', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  failed: { label: 'Failed', className: 'bg-red-50 text-red-700 border-red-200' },
  handed_off: { label: 'Handed off', className: 'bg-violet-50 text-violet-700 border-violet-200' },
}

function StatusIcon({ status }: { status: JourneyExecutionSummary['status'] }) {
  if (status === 'failed') return <AlertTriangle size={14} />
  if (status === 'completed') return <CheckCircle2 size={14} />
  if (status === 'handed_off') return <UserRound size={14} />
  return <Clock size={14} />
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return iso
  const minutes = Math.round((Date.now() - then) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export default function JourneyExecutions({ botId, bundleId }: { botId: string; bundleId: string }) {
  const [executions, setExecutions] = useState<JourneyExecutionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getJourneyExecutions(botId, bundleId)
      .then((res) => {
        if (cancelled) return
        if (res.success) setExecutions(res.data ?? [])
        else setError(res.error ?? 'Could not load activity')
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setError('Could not load activity')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [botId, bundleId])

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-black/5 p-6 space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-black/5 p-6">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    )
  }

  if (executions.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-black/5 p-10 text-center">
        <Clock className="w-7 h-7 text-gray-300 mx-auto mb-3" />
        <h3 className="font-bold text-gray-900 mb-1" style={JAKARTA_FONT}>
          No leads have entered this journey yet
        </h3>
        <p className="text-sm text-gray-500">
          Activity appears here as soon as a lead triggers it. Nothing to debug means nothing has run.
        </p>
      </div>
    )
  }

  const counts = executions.reduce<Record<string, number>>((acc, execution) => {
    acc[execution.status] = (acc[execution.status] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
      <div className="flex items-center gap-4 flex-wrap px-6 py-4 border-b border-black/5">
        <h3 className="font-bold text-gray-900" style={JAKARTA_FONT}>
          {executions.length} {executions.length === 1 ? 'run' : 'runs'}
        </h3>
        {/* Counts, never rates. */}
        {(Object.keys(STATUS_STYLES) as JourneyExecutionSummary['status'][])
          .filter((status) => counts[status])
          .map((status) => (
            <span key={status} className="text-xs text-gray-500">
              {counts[status]} {STATUS_STYLES[status].label.toLowerCase()}
            </span>
          ))}
      </div>

      <div className="divide-y divide-black/5">
        {executions.map((execution) => (
          <div key={execution.leadId} className="px-6 py-3.5 flex items-start gap-4 hover:bg-gray-50/60 transition-colors">
            <span
              className={`inline-flex items-center gap-1.5 border text-[10px] font-semibold px-2 py-1 rounded-full shrink-0 ${STATUS_STYLES[execution.status].className}`}
            >
              <StatusIcon status={execution.status} />
              {STATUS_STYLES[execution.status].label}
            </span>

            <div className="min-w-0 grow">
              <p className="text-sm font-medium text-gray-900 truncate">
                {execution.lastStepId ? `Step: ${execution.lastStepId}` : execution.lastEventType}
              </p>
              <p className="text-xs text-gray-400 truncate">
                lead {execution.leadId.slice(0, 8)} · {execution.eventCount}{' '}
                {execution.eventCount === 1 ? 'event' : 'events'} · started {relativeTime(execution.startedAt)}
              </p>
              {/* The whole reason the terminal event carries an error: this line
                  is the difference between "it failed" and knowing why. */}
              {execution.errorDetail && (
                <p className="text-xs text-red-600 mt-1 break-words">{execution.errorDetail}</p>
              )}
            </div>

            <span className="text-xs text-gray-400 shrink-0">{relativeTime(execution.lastEventAt)}</span>
          </div>
        ))}
      </div>

      {/* Said plainly rather than implied: an execution that started before the
          terminal event shipped has no ending recorded and will sit at "In
          flight" forever. Presenting that as proof it is alive would recreate
          the exact ambiguity this feature exists to remove. */}
      {executions.some((execution) => execution.status === 'running') && (
        <p className="px-6 py-3 text-xs text-gray-400 border-t border-black/5">
          "In flight" means no ending was recorded. Runs that started before this journey was last published never
          record one, so check the lead's own timeline before assuming it is still going.
        </p>
      )}
    </div>
  )
}
