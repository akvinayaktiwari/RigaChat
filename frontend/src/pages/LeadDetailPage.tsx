import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Bot as BotIcon,
  Calendar,
  DollarSign,
  Globe,
  Home,
  Mail,
  MessageSquare,
  Phone,
} from 'lucide-react'
import { getLeadById, getMyBots } from '../services/api'
import type { Lead } from '../types/index'

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

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function formatFullDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function LoadingSkeleton() {
  return (
    <div>
      <div className="h-4 w-24 bg-slate-100 rounded animate-pulse mb-6" />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 bg-white rounded-2xl p-6 border border-slate-100 animate-pulse">
          <div className="w-[72px] h-[72px] rounded-full bg-slate-200 mx-auto mb-4" />
          <div className="h-6 w-40 bg-slate-200 rounded mx-auto mb-6" />
          <div className="space-y-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-4 bg-slate-100 rounded" />
            ))}
          </div>
        </div>
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-100 animate-pulse">
          <div className="h-4 w-32 bg-slate-200 rounded mb-4" />
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 bg-slate-100 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LeadDetailPage() {
  const { leadId } = useParams<{ leadId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const botId = searchParams.get('botId') ?? ''

  const [lead, setLead] = useState<Lead | null>(null)
  const [botName, setBotName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!leadId || !botId) {
      setError(true)
      setLoading(false)
      return
    }

    Promise.all([getLeadById(botId, leadId), getMyBots()])
      .then(([leadRes, botsRes]) => {
        if (leadRes.success && leadRes.data) {
          setLead(leadRes.data)
        } else {
          setError(true)
        }
        const bots = botsRes.data ?? []
        setBotName(bots.find((b) => b.botId === botId)?.name ?? 'Unknown Bot')
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }, [botId, leadId])

  if (loading) {
    return <LoadingSkeleton />
  }

  if (error || !lead) {
    return (
      <div className="flex flex-col items-center text-center py-16">
        <p className="text-slate-800 font-medium">Lead not found</p>
        <button
          type="button"
          onClick={() => navigate('/dashboard/leads')}
          className="mt-4 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm hover:bg-indigo-700 transition-colors"
        >
          Back to Leads
        </button>
      </div>
    )
  }

  const transcriptLines = parseTranscript(lead.chatTranscript)

  return (
    <div>
      <button
        type="button"
        onClick={() => navigate('/dashboard/leads')}
        className="flex items-center gap-1 text-slate-500 text-sm hover:text-slate-700 transition-colors"
      >
        <ArrowLeft size={16} />
        Back to Leads
      </button>

      <div className="flex items-start justify-between mt-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{lead.name}</h1>
          <p className="text-slate-500">Lead Details</p>
        </div>
        <div className="text-right">
          <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
            New
          </span>
          <p className="text-xs text-slate-400 mt-1">Captured {formatFullDate(lead.createdAt)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mt-6">
        <div className="lg:col-span-3 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <div className="w-[72px] h-[72px] rounded-full bg-indigo-600 text-white text-2xl font-bold flex items-center justify-center mx-auto">
            {getInitials(lead.name)}
          </div>
          <h2 className="text-xl font-bold text-slate-800 mt-4 text-center">{lead.name}</h2>

          <div className="mt-4">
            <div className="flex items-center gap-3 py-3 border-b border-slate-50">
              <Mail size={16} className="text-slate-400 shrink-0" />
              <span className="text-sm text-slate-500 w-32 shrink-0">Email</span>
              <span className="text-sm text-slate-800">{lead.email}</span>
            </div>
            <div className="flex items-center gap-3 py-3 border-b border-slate-50">
              <Phone size={16} className="text-slate-400 shrink-0" />
              <span className="text-sm text-slate-500 w-32 shrink-0">Phone</span>
              <span className="text-sm text-slate-800">{lead.phone}</span>
            </div>
            <div className="flex items-center gap-3 py-3 border-b border-slate-50">
              <Globe size={16} className="text-slate-400 shrink-0" />
              <span className="text-sm text-slate-500 w-32 shrink-0">Source URL</span>
              <a
                href={lead.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-indigo-600 hover:underline truncate"
              >
                {lead.sourceUrl}
              </a>
            </div>
            <div className="flex items-center gap-3 py-3 border-b border-slate-50">
              <BotIcon size={16} className="text-slate-400 shrink-0" />
              <span className="text-sm text-slate-500 w-32 shrink-0">Bot</span>
              <span className="text-sm text-slate-800">{botName}</span>
            </div>
            <div className="flex items-center gap-3 py-3">
              <Calendar size={16} className="text-slate-400 shrink-0" />
              <span className="text-sm text-slate-500 w-32 shrink-0">Captured</span>
              <span className="text-sm text-slate-800">{formatFullDate(lead.createdAt)}</span>
            </div>
          </div>

          {(lead.propertyInterest || lead.budgetRange) && (
            <div className="mt-4">
              <p className="text-sm font-medium text-slate-500 mt-4 mb-2">Additional Info</p>
              {lead.propertyInterest && (
                <div className="flex items-center gap-3 py-3 border-b border-slate-50">
                  <Home size={16} className="text-slate-400 shrink-0" />
                  <span className="text-sm text-slate-500 w-32 shrink-0">Property Interest</span>
                  <span className="text-sm text-slate-800">{lead.propertyInterest}</span>
                </div>
              )}
              {lead.budgetRange && (
                <div className="flex items-center gap-3 py-3">
                  <DollarSign size={16} className="text-slate-400 shrink-0" />
                  <span className="text-sm text-slate-500 w-32 shrink-0">Budget Range</span>
                  <span className="text-sm text-slate-800">{lead.budgetRange}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare size={18} className="text-slate-500" />
            <h3 className="font-semibold text-slate-800">Conversation Transcript</h3>
          </div>

          {transcriptLines.length === 0 ? (
            <div className="flex flex-col items-center text-center py-8">
              <MessageSquare size={32} className="text-slate-300 mb-2" />
              <p className="text-slate-400 text-sm">No conversation transcript available</p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto space-y-3">
              {transcriptLines.map((line, i) => (
                <div key={i} className={line.role === 'user' ? 'ml-auto max-w-xs' : 'max-w-xs'}>
                  <div
                    className={
                      line.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 py-2 text-sm ml-auto'
                        : 'bg-slate-100 text-slate-800 rounded-2xl rounded-tl-sm px-4 py-2 text-sm'
                    }
                  >
                    {line.text}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
