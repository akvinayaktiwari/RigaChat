import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, Globe, Lock, Mail, Mic, Plus, Trash2, Volume2 } from 'lucide-react'
import { deleteVoiceAgent, getMySubscription, getVoiceAgents, updateVoiceAgent } from '../services/api'
import type { VoiceAgent } from '../types/index'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }
const URL_MAX_LENGTH = 40

function truncateUrl(url: string): string {
  return url.length > URL_MAX_LENGTH ? `${url.slice(0, URL_MAX_LENGTH)}…` : url
}

function formatCreatedDate(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function CardsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-white rounded-2xl border border-black/5 p-5 animate-pulse">
          <div className="h-12 w-12 bg-gray-100 rounded-full mb-4" />
          <div className="h-5 w-32 bg-gray-100 rounded mb-2" />
          <div className="h-4 w-48 bg-gray-100 rounded mb-4" />
          <div className="h-8 w-full bg-gray-100 rounded" />
        </div>
      ))}
    </div>
  )
}

function StatusBadge({ isEnabled }: { isEnabled: boolean }) {
  return isEnabled ? (
    <span className="shrink-0 border text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border-emerald-200">
      Live
    </span>
  ) : (
    <span className="shrink-0 border text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-50 text-gray-600 border-gray-200">
      Disabled
    </span>
  )
}

function VoiceUpsellCard() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center mb-4">
        <Lock className="w-7 h-7 text-violet-400" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-2" style={JAKARTA_FONT}>
        Voice Agents are an add-on
      </h2>
      <p className="text-sm text-gray-500 text-center max-w-sm mb-6">
        Voice Agents aren&apos;t included in your current plan. Contact us to enable this for your account.
      </p>
      <a
        href="mailto:admin@drsyeta.in?subject=Enable Voice Agents for my account"
        className="inline-flex items-center gap-2 bg-linear-to-r from-violet-600 to-purple-500 text-white font-semibold px-4 py-2.5 rounded-xl text-sm shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity"
      >
        <Mail size={16} />
        Contact us
      </a>
    </div>
  )
}

function IndexedBadge({ isIndexed }: { isIndexed: boolean }) {
  return isIndexed ? (
    <span className="border text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border-emerald-200">
      Ready
    </span>
  ) : (
    <span className="border text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border-amber-200">
      Not indexed
    </span>
  )
}

export default function VoiceAgentsPage() {
  const navigate = useNavigate()
  const [agents, setAgents] = useState<VoiceAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [togglingAgentId, setTogglingAgentId] = useState<string | null>(null)
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null)
  const [voiceEnabled, setVoiceEnabled] = useState<boolean | null>(null)

  async function fetchSubscription() {
    try {
      const res = await getMySubscription()
      if (res.success && res.data) {
        setVoiceEnabled(res.data.features.voice.enabled)
      }
    } catch (err) {
      console.error('Failed to fetch subscription:', err)
    }
  }

  async function fetchAgents() {
    setLoading(true)
    setError(null)
    try {
      const res = await getVoiceAgents()
      if (res.success) {
        setAgents(res.data ?? [])
      } else {
        setError(res.error ?? 'Failed to load voice agents')
      }
    } catch (err) {
      console.error('Failed to fetch voice agents:', err)
      setError('Failed to load voice agents')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAgents()
    fetchSubscription()
  }, [])

  async function handleToggleEnabled(agent: VoiceAgent) {
    setTogglingAgentId(agent.agentId)
    try {
      const res = await updateVoiceAgent(agent.agentId, { isEnabled: !agent.isEnabled })
      if (res.success) {
        await fetchAgents()
      }
    } catch (err) {
      console.error('Failed to update voice agent:', err)
    } finally {
      setTogglingAgentId(null)
    }
  }

  async function handleDelete(agent: VoiceAgent) {
    if (!window.confirm(`Delete ${agent.name}? This cannot be undone.`)) return
    setDeletingAgentId(agent.agentId)
    try {
      const res = await deleteVoiceAgent(agent.agentId)
      if (res.success) {
        await fetchAgents()
      }
    } catch (err) {
      console.error('Failed to delete voice agent:', err)
    } finally {
      setDeletingAgentId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-extrabold text-2xl text-gray-900" style={JAKARTA_FONT}>
          Voice Agents
        </h1>
        {voiceEnabled !== false && (
          <button
            type="button"
            onClick={() => navigate('/dashboard/voice-agents/new')}
            className="inline-flex items-center gap-2 bg-linear-to-r from-violet-600 to-purple-500 text-white font-semibold px-4 py-2.5 rounded-xl text-sm shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity"
          >
            <Plus size={16} />
            New Voice Agent
          </button>
        )}
      </div>

      {loading ? (
        <CardsSkeleton />
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      ) : agents.length === 0 ? (
        voiceEnabled === false ? (
          <VoiceUpsellCard />
        ) : (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center mb-4">
              <Mic className="w-7 h-7 text-violet-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2" style={JAKARTA_FONT}>
              No voice agents yet
            </h2>
            <p className="text-sm text-gray-500 text-center max-w-xs mb-6">
              Create your first voice agent to get started
            </p>
            <button
              type="button"
              onClick={() => navigate('/dashboard/voice-agents/new')}
              className="inline-flex items-center gap-2 bg-linear-to-r from-violet-600 to-purple-500 text-white font-semibold px-4 py-2.5 rounded-xl text-sm shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity"
            >
              <Plus size={16} />
              Create Voice Agent
            </button>
          </div>
        )
      ) : (
        <>
          {voiceEnabled === false && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 mb-5">
              <Lock className="w-5 h-5 text-amber-500 shrink-0" />
              <p className="text-sm text-amber-700">
                Voice Agents are no longer included in your plan. Existing agents are shown below; contact us to
                re-enable creating new ones.
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {agents.map((agent) => (
            <div
              key={agent.agentId}
              className="bg-white rounded-2xl border border-black/5 p-5 hover:shadow-md transition-all duration-200"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0"
                    style={{ backgroundColor: agent.brandColor }}
                  >
                    {agent.name.charAt(0).toUpperCase()}
                  </div>
                  <h3 className="font-bold text-gray-900 truncate" style={JAKARTA_FONT}>
                    {agent.name}
                  </h3>
                </div>
                <StatusBadge isEnabled={agent.isEnabled} />
              </div>

              <div className="flex items-center gap-2 mb-1.5">
                <Volume2 size={14} className="text-gray-400 shrink-0" />
                <span className="text-sm text-gray-500 capitalize">{agent.voice}</span>
              </div>

              <div className="flex items-center gap-2 mb-3">
                <Globe size={14} className="text-gray-400 shrink-0" />
                <span className="text-sm text-gray-500 truncate">
                  {agent.websiteUrl ? truncateUrl(agent.websiteUrl) : 'Knowledge Base only'}
                </span>
              </div>

              <div className="flex items-center gap-2 mb-3">
                <IndexedBadge isIndexed={agent.isIndexed} />
              </div>

              <p className="text-xs text-gray-400 mb-4">Created {formatCreatedDate(agent.createdAt)}</p>

              <div className="flex items-center gap-2 pt-3 border-t border-gray-50">
                <button
                  type="button"
                  onClick={() => navigate(`/dashboard/voice-agents/${agent.agentId}`)}
                  className="flex-1 text-gray-600 font-medium px-3 py-2 rounded-xl text-sm hover:bg-gray-100 transition-colors text-center"
                >
                  Settings
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleEnabled(agent)}
                  disabled={togglingAgentId === agent.agentId}
                  className="flex-1 bg-white text-gray-700 font-medium px-3 py-2 rounded-xl text-sm border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {agent.isEnabled ? 'Disable' : 'Enable'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(agent)}
                  disabled={deletingAgentId === agent.agentId}
                  title="Delete voice agent"
                  className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-50 shrink-0"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
