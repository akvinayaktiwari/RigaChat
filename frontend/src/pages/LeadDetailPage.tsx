import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Bot as BotIcon,
  Calendar,
  ChevronLeft,
  DollarSign,
  Globe,
  Home,
  Mail,
  MessageSquare,
  Phone,
} from 'lucide-react'
import { getLeadById, getMyBots } from '../services/api'
import type { Lead } from '../types/index'

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

  const transcriptLines = parseTranscript(lead.chatTranscript)

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
        <div className="lg:col-span-1 bg-white rounded-2xl border border-black/5 p-6 shadow-sm">
          <div className="w-16 h-16 rounded-full bg-linear-to-br from-violet-600 to-purple-500 flex items-center justify-center mx-auto mb-4">
            <span className="text-xl font-bold text-white" style={JAKARTA_FONT}>
              {getInitials(lead.name)}
            </span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 text-center mb-1" style={JAKARTA_FONT}>
            {lead.name}
          </h1>
          <p className="text-sm text-gray-500 text-center mb-6">{botName}</p>

          <div>
            <InfoRow icon={Phone} label="Phone" value={lead.phone} />
            <InfoRow icon={Mail} label="Email" value={lead.email} />
            <InfoRow icon={Globe} label="Source URL" value={lead.sourceUrl} />
            <InfoRow icon={Calendar} label="Date" value={formatFullDate(lead.createdAt)} />
            <InfoRow icon={BotIcon} label="Bot name" value={botName} />
          </div>

          {(lead.propertyInterest || lead.budgetRange) && (
            <div className="mt-2">
              <p className="text-sm font-medium text-gray-500 mt-4 mb-2">Additional Info</p>
              {lead.propertyInterest && <InfoRow icon={Home} label="Property Interest" value={lead.propertyInterest} />}
              {lead.budgetRange && <InfoRow icon={DollarSign} label="Budget Range" value={lead.budgetRange} />}
            </div>
          )}
        </div>

        <div className="lg:col-span-2 bg-white rounded-2xl border border-black/5 p-6 shadow-sm">
          <h2 className="font-bold text-lg text-gray-900 mb-5" style={JAKARTA_FONT}>
            Conversation
          </h2>

          {transcriptLines.length === 0 ? (
            <div className="flex flex-col items-center text-center py-8">
              <MessageSquare size={32} className="text-gray-300 mb-2" />
              <p className="text-gray-400 text-sm">No conversation transcript available</p>
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
  )
}
