import { AlertTriangle, Check, RefreshCw } from 'lucide-react'
import type { IndexingJob } from '../types/index'

interface IndexingProgressCardProps {
  job: IndexingJob | undefined
  surface: 'bot' | 'voice'
  onRetry: () => void
}

// Matches the inline font-family style used elsewhere for Plus Jakarta Sans
// headings (e.g. VoiceAgentDetailPage's JAKARTA_FONT) — no Tailwind arbitrary
// class in use for it in this codebase, so following the same convention.
const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

const STALL_THRESHOLD_MS = 45_000

type DerivedState = 'QUEUED' | 'CRAWLING' | 'INDEXING' | 'READY' | 'FAILED' | 'STALLED'

const CHECKLIST_PHASES: Array<{ key: 'queued' | 'crawling' | 'indexing' | 'ready'; label: string }> = [
  { key: 'queued', label: 'Queued' },
  { key: 'crawling', label: 'Reading website' },
  { key: 'indexing', label: 'Building knowledge base' },
  { key: 'ready', label: 'Ready' },
]

function deriveState(job: IndexingJob): DerivedState {
  if (job.status === 'failed' || job.phase === 'failed') return 'FAILED'
  if (job.status === 'complete' || job.phase === 'ready') return 'READY'

  if (job.status === 'processing') {
    const isStalled =
      job.updatedAt !== undefined && Date.now() - new Date(job.updatedAt).getTime() > STALL_THRESHOLD_MS
    if (isStalled) return 'STALLED'
    return job.phase === 'indexing' ? 'INDEXING' : 'CRAWLING'
  }

  // status 'pending' | 'queued' | 'confirmation_required' (or phase 'queued') — none of
  // these have indexing work underway yet, so QUEUED is the safe default. Not explicitly
  // listed in the 6-state spec ('confirmation_required' is bot-only, page-selection step
  // that precedes indexing) — flagged in the Phase 3 report rather than guessed silently.
  return 'QUEUED'
}

function checklistIndex(state: DerivedState, job: IndexingJob): number {
  switch (state) {
    case 'QUEUED':
      return 0
    case 'CRAWLING':
      return 1
    case 'INDEXING':
      return 2
    case 'STALLED':
      return job.phase === 'indexing' ? 2 : 1
    case 'READY':
      return 3
    case 'FAILED':
      return -1
  }
}

function ProgressBar({ fraction }: { fraction: number | undefined }) {
  if (fraction === undefined) {
    return (
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-primary to-primary-container animate-pulse" />
      </div>
    )
  }
  const pct = Math.min(100, Math.max(0, fraction * 100))
  return (
    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
      <div
        className="h-full rounded-full bg-gradient-to-r from-primary to-primary-container transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function PhaseHeading({ heading, counter }: { heading: string; counter: string | undefined }) {
  return (
    <p className="text-base text-on-surface mb-3">
      <span className="font-semibold" style={JAKARTA_FONT}>
        {heading}
      </span>
      {counter !== undefined && <span className="text-on-surface-variant"> — {counter}</span>}
    </p>
  )
}

function PhaseChecklist({ state, job }: { state: DerivedState; job: IndexingJob }) {
  const activeIndex = checklistIndex(state, job)

  return (
    <ol className="flex items-center mb-6">
      {CHECKLIST_PHASES.map((phase, i) => {
        const isDone = state === 'READY' || activeIndex > i
        const isActive = activeIndex === i && state !== 'READY'
        const isLast = i === CHECKLIST_PHASES.length - 1

        return (
          <li key={phase.key} className={`flex items-center ${isLast ? '' : 'flex-1'}`}>
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <div
                className={[
                  'flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold shrink-0',
                  isDone
                    ? 'bg-success text-white'
                    : isActive
                      ? 'bg-gradient-to-br from-primary to-primary-container text-white vyostra-logo-glow'
                      : 'bg-gray-100 text-gray-400',
                ].join(' ')}
              >
                {isDone ? <Check size={14} /> : i + 1}
              </div>
              <span
                className={`text-xs whitespace-nowrap ${isActive ? 'text-on-surface font-medium' : 'text-gray-400'}`}
                style={isActive ? JAKARTA_FONT : undefined}
              >
                {phase.label}
              </span>
            </div>
            {!isLast && <div className={`h-px flex-1 mx-2 mb-5 ${isDone ? 'bg-success' : 'bg-gray-200'}`} />}
          </li>
        )
      })}
    </ol>
  )
}

export default function IndexingProgressCard({ job, surface, onRetry }: IndexingProgressCardProps) {
  if (!job) return null

  const state = deriveState(job)
  const readyCopy =
    surface === 'bot' ? 'Your chatbot can now answer questions.' : 'Your voice agent is ready to take calls.'

  return (
    <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-6">
      {state !== 'FAILED' && <PhaseChecklist state={state} job={job} />}

      {state === 'QUEUED' && (
        <div>
          <p className="text-base font-semibold text-on-surface" style={JAKARTA_FONT}>
            Queued
          </p>
          <p className="text-sm text-on-surface-variant mt-1">Waiting for a worker to pick this job up…</p>
        </div>
      )}

      {state === 'CRAWLING' && (
        <div>
          <PhaseHeading
            heading="Reading your website"
            counter={`${job.crawledPages} of ${job.selectedPages || 0} pages`}
          />
          <ProgressBar fraction={job.selectedPages > 0 ? job.crawledPages / job.selectedPages : undefined} />
        </div>
      )}

      {state === 'INDEXING' && (
        <div>
          <PhaseHeading
            heading="Building the knowledge base"
            counter={
              job.chunksDone !== undefined && job.totalChunks > 0
                ? `${job.chunksDone} of ${job.totalChunks} passages`
                : undefined
            }
          />
          <ProgressBar
            fraction={
              job.chunksDone !== undefined && job.totalChunks > 0 ? job.chunksDone / job.totalChunks : undefined
            }
          />
        </div>
      )}

      {state === 'READY' && (
        <div>
          <p className="text-base font-semibold text-success" style={JAKARTA_FONT}>
            Ready
          </p>
          <p className="text-sm text-on-surface-variant mt-1">
            {job.summary
              ? `${job.summary.pages} pages · ${job.summary.passages} passages · ready`
              : `${job.crawledPages} pages · ${job.totalChunks} passages · ready`}
          </p>
          <p className="text-sm text-on-surface-variant mt-1">{readyCopy}</p>
        </div>
      )}

      {state === 'STALLED' && (
        <div>
          <p className="text-base font-semibold text-warning" style={JAKARTA_FONT}>
            This is taking longer than expected
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-hover"
          >
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      )}

      {state === 'FAILED' && (
        <div>
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-rose-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-base font-semibold text-rose-600" style={JAKARTA_FONT}>
                Indexing failed
              </p>
              <p className="text-sm text-on-surface-variant mt-1">
                {job.errorDetail?.message ?? job.error ?? 'Unknown error'}
              </p>
            </div>
          </div>
          {job.errorDetail?.retryable !== false && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-hover"
            >
              <RefreshCw size={14} /> Retry
            </button>
          )}
        </div>
      )}
    </div>
  )
}
