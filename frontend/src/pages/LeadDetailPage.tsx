import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Bot as BotIcon,
  Calendar,
  CalendarClock,
  ChevronLeft,
  DollarSign,
  Globe,
  Home,
  Mail,
  MessageSquare,
  Phone,
  StickyNote,
} from 'lucide-react'
import { addLeadNote, getUnifiedLeadDetail, updateLeadState } from '../services/api'
import { useToast } from '../components/Toast/Toast'
import { parseLeadRef } from '../lib/lead-ref'
import {
  leadInitials,
  OUTCOME_LABELS,
  OUTCOME_ORDER,
  SOURCE_BADGE_CLASSES,
  SOURCE_LABELS,
  STATUS_BADGE_CLASSES,
  STATUS_LABELS,
  STATUS_ORDER,
} from '../lib/lead-display'
import type { LeadOutcome, LeadStatePatch, LeadStatus, UnifiedLeadDetail } from '../types/index'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

interface TranscriptLine {
  role: 'user' | 'bot'
  text: string
}

function parseTranscript(transcript: string): TranscriptLine[] {
  if (!transcript) return []
  return transcript
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      if (line.startsWith('User:')) {
        return { role: 'user' as const, text: line.replace('User:', '').trim() }
      }
      if (line.startsWith('Bot:') || line.startsWith('Assistant:')) {
        return { role: 'bot' as const, text: line.replace(/^(Bot:|Assistant:)/, '').trim() }
      }
      return { role: 'bot' as const, text: line.trim() }
    })
}

function formatFullDate(dateString: string): string {
  if (!dateString) return 'Unknown'
  return new Date(dateString).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// <input type="datetime-local"> wants local wall-clock with no zone, while the
// API stores ISO-8601 UTC. Converting through the epoch keeps the displayed
// time the one the operator actually picked.
function toLocalInputValue(iso: string | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  const offsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

function fromLocalInputValue(value: string): string | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-50">
      <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-gray-400" />
      </div>
      <div className="min-w-0">
        <span className="text-xs text-gray-400 block">{label}</span>
        <span className="text-sm text-gray-700 font-medium truncate block">{value}</span>
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div>
      <div className="h-4 w-24 bg-gray-100 rounded animate-pulse mb-6" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-white rounded-2xl p-6 border border-black/5 animate-pulse">
          <div className="w-16 h-16 rounded-full bg-gray-200 mx-auto mb-4" />
          <div className="h-6 w-40 bg-gray-200 rounded mx-auto mb-6" />
          <div className="space-y-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-4 bg-gray-100 rounded" />
            ))}
          </div>
        </div>
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-black/5 animate-pulse">
          <div className="h-4 w-32 bg-gray-200 rounded mb-4" />
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 bg-gray-100 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const SELECT_CLASSES =
  'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 bg-white cursor-pointer outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-colors disabled:opacity-50'

export default function LeadDetailPage() {
  const { leadId } = useParams<{ leadId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const leadRef = parseLeadRef(leadId, searchParams)

  const [lead, setLead] = useState<UnifiedLeadDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')

  useEffect(() => {
    if (!leadRef) {
      setError(true)
      setLoading(false)
      return
    }

    let cancelled = false
    getUnifiedLeadDetail(leadRef)
      .then((res) => {
        if (cancelled) return
        if (res.success && res.data) setLead(res.data)
        else setError(true)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setError(true)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // leadRef is rebuilt each render from the URL; keying on its parts avoids
    // an infinite refetch loop while still refetching when the URL changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, searchParams])

  async function applyPatch(patch: LeadStatePatch) {
    if (!leadRef) return
    setSaving(true)
    const res = await updateLeadState(leadRef, patch)
    setSaving(false)

    if (!res.success || !res.data) {
      toast.show(res.error ?? 'Could not save this change', 'error')
      return
    }
    const updated = res.data
    setLead((prev) => (prev ? { ...prev, state: updated } : prev))
  }

  async function handleAddNote() {
    if (!leadRef || !noteDraft.trim()) return
    setSaving(true)
    const res = await addLeadNote(leadRef, noteDraft.trim())
    setSaving(false)

    if (!res.success || !res.data) {
      toast.show(res.error ?? 'Could not save this note', 'error')
      return
    }
    const updated = res.data
    setLead((prev) => (prev ? { ...prev, state: updated } : prev))
    setNoteDraft('')
  }

  if (loading) return <LoadingSkeleton />

  if (error || !lead) {
    return (
      <div className="flex flex-col items-center text-center py-16">
        <p className="text-gray-900 font-medium">Lead not found</p>
        <button
          type="button"
          onClick={() => navigate('/dashboard/leads')}
          className="mt-4 inline-flex items-center gap-2 bg-linear-to-r from-violet-600 to-purple-500 text-white font-semibold px-4 py-2.5 rounded-xl text-sm shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity"
        >
          Back to Leads
        </button>
      </div>
    )
  }

  const status: LeadStatus = lead.state?.status ?? 'new'
  const transcriptLines = parseTranscript(lead.chatTranscript ?? '')
  const notes = lead.state?.notes ?? []
  const customFields = Object.entries(lead.customFields ?? {})

  return (
    <div>
      <button
        type="button"
        onClick={() => navigate('/dashboard/leads')}
        className="flex items-center gap-1 text-gray-500 text-sm hover:text-gray-900 transition-colors mb-6"
      >
        <ChevronLeft size={16} />
        Back to Leads
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-2xl border border-black/5 p-6 shadow-sm">
            <div className="w-16 h-16 rounded-full bg-linear-to-br from-violet-600 to-purple-500 flex items-center justify-center mx-auto mb-4">
              <span className="text-xl font-bold text-white" style={JAKARTA_FONT}>
                {leadInitials(lead.name)}
              </span>
            </div>
            <h1 className="text-xl font-bold text-gray-900 text-center mb-2" style={JAKARTA_FONT}>
              {lead.name ?? 'Unnamed lead'}
            </h1>
            <div className="flex justify-center gap-2 mb-5">
              <span
                className={`inline-flex text-xs font-medium px-2.5 py-1 rounded-full border ${SOURCE_BADGE_CLASSES[lead.source]}`}
              >
                {SOURCE_LABELS[lead.source]}
              </span>
              <span
                className={`inline-flex text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_BADGE_CLASSES[status]}`}
              >
                {STATUS_LABELS[status]}
              </span>
            </div>

            {/* The two actions this page exists to make one tap away. */}
            <div className="flex gap-2 mb-5">
              <a
                href={lead.phone ? `tel:${lead.phone}` : undefined}
                aria-disabled={!lead.phone}
                className={`flex-1 inline-flex items-center justify-center gap-2 font-semibold px-3 py-2.5 rounded-xl text-sm transition-opacity ${
                  lead.phone
                    ? 'bg-linear-to-r from-violet-600 to-purple-500 text-white shadow-md shadow-violet-200/50 hover:opacity-90'
                    : 'bg-gray-100 text-gray-400 pointer-events-none'
                }`}
              >
                <Phone size={14} />
                Call
              </a>
              <a
                href={lead.phone ? `https://wa.me/${lead.phone.replace(/[^0-9]/g, '')}` : undefined}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!lead.phone}
                className={`flex-1 inline-flex items-center justify-center gap-2 font-semibold px-3 py-2.5 rounded-xl text-sm border transition-colors ${
                  lead.phone
                    ? 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    : 'bg-gray-100 text-gray-400 border-transparent pointer-events-none'
                }`}
              >
                <MessageSquare size={14} />
                WhatsApp
              </a>
            </div>

            <div>
              <InfoRow icon={Phone} label="Phone" value={lead.phone ?? 'Not provided'} />
              <InfoRow icon={Mail} label="Email" value={lead.email ?? 'Not provided'} />
              <InfoRow icon={Globe} label="Source URL" value={lead.sourceUrl ?? 'Not provided'} />
              <InfoRow icon={Calendar} label="Captured" value={formatFullDate(lead.createdAt)} />
              {lead.state?.lastTouchedAt && (
                <InfoRow
                  icon={CalendarClock}
                  label="Last touched"
                  value={formatFullDate(lead.state.lastTouchedAt)}
                />
              )}
            </div>

            {(lead.propertyInterest || lead.budgetRange) && (
              <div className="mt-2">
                <p className="text-sm font-medium text-gray-500 mt-4 mb-2">Additional Info</p>
                {lead.propertyInterest && (
                  <InfoRow icon={Home} label="Property Interest" value={lead.propertyInterest} />
                )}
                {lead.budgetRange && <InfoRow icon={DollarSign} label="Budget Range" value={lead.budgetRange} />}
              </div>
            )}

            {customFields.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium text-gray-500 mb-2">Submitted answers</p>
                <dl className="space-y-2">
                  {customFields.map(([key, value]) => (
                    <div key={key} className="text-sm">
                      <dt className="text-xs text-gray-400">{key}</dt>
                      <dd className="text-gray-700 font-medium break-words">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-black/5 p-6 shadow-sm">
            <h2 className="font-bold text-base text-gray-900 mb-4" style={JAKARTA_FONT}>
              Where this stands
            </h2>

            <label className="text-xs text-gray-400 block mb-1.5" htmlFor="lead-status">
              Status
            </label>
            <select
              id="lead-status"
              value={status}
              disabled={saving}
              onChange={(e) => applyPatch({ status: e.target.value as LeadStatus })}
              className={SELECT_CLASSES}
            >
              {STATUS_ORDER.map((option) => (
                <option key={option} value={option}>
                  {STATUS_LABELS[option]}
                </option>
              ))}
            </select>

            {status === 'closed' && (
              <>
                <label className="text-xs text-gray-400 block mb-1.5 mt-4" htmlFor="lead-outcome">
                  Outcome
                </label>
                <select
                  id="lead-outcome"
                  value={lead.state?.outcome ?? ''}
                  disabled={saving}
                  onChange={(e) =>
                    applyPatch({ outcome: e.target.value ? (e.target.value as LeadOutcome) : null })
                  }
                  className={SELECT_CLASSES}
                >
                  <option value="">Not recorded</option>
                  {OUTCOME_ORDER.map((option) => (
                    <option key={option} value={option}>
                      {OUTCOME_LABELS[option]}
                    </option>
                  ))}
                </select>
              </>
            )}

            <label className="text-xs text-gray-400 block mb-1.5 mt-4" htmlFor="lead-next-action">
              Next action
            </label>
            <input
              id="lead-next-action"
              type="datetime-local"
              value={toLocalInputValue(lead.state?.nextActionAt)}
              disabled={saving}
              onChange={(e) => applyPatch({ nextActionAt: fromLocalInputValue(e.target.value) })}
              className={SELECT_CLASSES}
            />
            <p className="text-xs text-gray-400 mt-2">
              Leads with an overdue next action are pinned to the top of your inbox.
            </p>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-black/5 p-6 shadow-sm">
            <h2 className="font-bold text-lg text-gray-900 mb-4" style={JAKARTA_FONT}>
              Notes
            </h2>

            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="What happened on the call?"
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-colors resize-y"
            />
            <div className="flex justify-end mt-2">
              <button
                type="button"
                onClick={handleAddNote}
                disabled={saving || !noteDraft.trim()}
                className="bg-linear-to-r from-violet-600 to-purple-500 text-white font-semibold px-4 py-2 rounded-xl text-sm shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add note
              </button>
            </div>

            {notes.length === 0 ? (
              <div className="flex flex-col items-center text-center py-8">
                <StickyNote size={28} className="text-gray-300 mb-2" />
                <p className="text-gray-400 text-sm">No notes yet</p>
              </div>
            ) : (
              <ul className="mt-5 space-y-3">
                {[...notes].reverse().map((note) => (
                  <li key={note.noteId} className="border border-gray-100 rounded-xl px-4 py-3">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.body}</p>
                    <p className="text-xs text-gray-400 mt-1.5">{formatFullDate(note.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-black/5 p-6 shadow-sm">
            <h2 className="font-bold text-lg text-gray-900 mb-5" style={JAKARTA_FONT}>
              Conversation
            </h2>

            {transcriptLines.length === 0 ? (
              <div className="flex flex-col items-center text-center py-8">
                <MessageSquare size={32} className="text-gray-300 mb-2" />
                <p className="text-gray-400 text-sm">
                  {lead.source === 'chat'
                    ? 'No conversation transcript available'
                    : `${SOURCE_LABELS[lead.source]} leads arrive as a submission, not a conversation`}
                </p>
              </div>
            ) : (
              <div className="demo-chat-scrollbar flex flex-col gap-3 max-h-125 overflow-y-auto pr-2">
                {transcriptLines.map((line, i) =>
                  line.role === 'user' ? (
                    <div key={i} className="flex justify-end">
                      <div className="bg-linear-to-br from-violet-600 to-purple-500 text-white rounded-2xl rounded-br-sm px-4 py-3 text-sm max-w-[80%] leading-relaxed">
                        {line.text}
                      </div>
                    </div>
                  ) : (
                    <div key={i} className="flex gap-3 items-end">
                      <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                        <BotIcon className="w-3.5 h-3.5 text-gray-400" />
                      </div>
                      <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-gray-700 max-w-[80%] leading-relaxed">
                        {line.text}
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
