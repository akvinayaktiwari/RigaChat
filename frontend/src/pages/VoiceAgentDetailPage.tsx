import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BookOpen, Check, ChevronLeft, Code, Copy, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import {
  deleteVoiceAgent,
  getMyBots,
  getVoiceAgent,
  getVoiceAgentUsage,
  setupVoiceAgent,
  updateVoiceAgent,
} from '../services/api'
import type { BotConfig, VoiceAgent, VoiceAgentVoice, VoiceUsageSummary } from '../types/index'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

const VOICE_OPTIONS: { value: VoiceAgentVoice; label: string }[] = [
  { value: 'alloy', label: 'Alloy' },
  { value: 'echo', label: 'Echo' },
  { value: 'shimmer', label: 'Shimmer' },
  { value: 'nova', label: 'Nova' },
  { value: 'onyx', label: 'Onyx' },
  { value: 'fable', label: 'Fable' },
]

const WIDGET_POSITION_OPTIONS: { value: VoiceAgent['widgetPosition']; label: string }[] = [
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'bottom-right', label: 'Bottom Right' },
  { value: 'bottom-center', label: 'Bottom Center' },
]

const SESSION_DURATION_OPTIONS: { value: VoiceAgent['maxSessionDuration']; label: string }[] = [
  { value: 5, label: '5 minutes' },
  { value: 10, label: '10 minutes' },
  { value: 15, label: '15 minutes' },
]

function getEmbedSnippet(agentId: string): string {
  const cdnUrl = import.meta.env.VITE_CDN_URL
  return `<script src="${cdnUrl}/voice-widget.js"
  data-agent-id="${agentId}" async></script>`
}

function formatCreatedDate(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const inputClasses =
  'w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 bg-white outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-colors'
const labelClasses = 'block text-sm font-medium text-gray-700 mb-1.5'
const hintClasses = 'text-xs text-gray-400 mt-1'

const SYSTEM_PROMPT_MAX_LENGTH = 500

const primaryButtonClasses =
  'bg-linear-to-r from-violet-600 to-purple-500 text-white font-semibold rounded-xl shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed'
const secondaryButtonClasses =
  'bg-white text-gray-700 font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50'
const dangerButtonClasses =
  'bg-red-500 text-white font-semibold rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50'

interface FormData {
  name: string
  greetingMessage: string
  systemPrompt: string
  botId: string
  voice: VoiceAgentVoice
  brandColor: string
  widgetPosition: VoiceAgent['widgetPosition']
  maxSessionDuration: VoiceAgent['maxSessionDuration']
  isEnabled: boolean
}

function buildDefaultSystemPrompt(agent: VoiceAgent): string {
  return `You are ${agent.name}, a voice assistant for this business. Always use the search_knowledge_base tool when asked about pricing, features, or details. Answer directly using only what the tool returns — don't ask broadening questions like "which product" unless the knowledge base itself lists multiple distinct options. If nothing relevant is found, say so honestly. Greet callers with: "${agent.greetingMessage}" Keep responses to 2-3 sentences.`
}

function toFormData(agent: VoiceAgent): FormData {
  return {
    name: agent.name,
    greetingMessage: agent.greetingMessage,
    systemPrompt:
      agent.systemPrompt && agent.systemPrompt.length > 0 ? agent.systemPrompt : buildDefaultSystemPrompt(agent),
    botId: agent.botId ?? '',
    voice: agent.voice,
    brandColor: agent.brandColor,
    widgetPosition: agent.widgetPosition,
    maxSessionDuration: agent.maxSessionDuration,
    isEnabled: agent.isEnabled,
  }
}

function LoadingSkeleton() {
  return (
    <div>
      <div className="h-4 w-24 bg-gray-100 rounded animate-pulse mb-6" />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 bg-white rounded-2xl p-6 border border-black/5 animate-pulse space-y-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 bg-gray-100 rounded-xl" />
          ))}
        </div>
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-black/5 animate-pulse h-32" />
          <div className="bg-white rounded-2xl p-6 border border-black/5 animate-pulse h-32" />
        </div>
      </div>
    </div>
  )
}

export default function VoiceAgentDetailPage() {
  const { agentId } = useParams<{ agentId: string }>()
  const navigate = useNavigate()

  const [agent, setAgent] = useState<VoiceAgent | null>(null)
  const [formData, setFormData] = useState<FormData | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [bots, setBots] = useState<BotConfig[]>([])
  const [usage, setUsage] = useState<VoiceUsageSummary | null>(null)

  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [reindexing, setReindexing] = useState(false)
  const [reindexError, setReindexError] = useState<string | null>(null)
  const [justQueued, setJustQueued] = useState(false)
  const [resyncSuccess, setResyncSuccess] = useState(false)

  const [copySuccess, setCopySuccess] = useState(false)

  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    if (!agentId) {
      setLoading(false)
      return
    }
    getVoiceAgent(agentId).then((res) => {
      if (res.success && res.data) {
        setAgent(res.data)
        setFormData(toFormData(res.data))
      } else {
        setFetchError(res.error ?? 'Voice agent not found')
      }
      setLoading(false)
    })
  }, [agentId])

  useEffect(() => {
    getMyBots().then((res) => {
      if (res.success && res.data) {
        setBots(res.data)
      }
    })
  }, [])

  useEffect(() => {
    if (!agentId) return
    getVoiceAgentUsage(agentId).then((res) => {
      if (res.success && res.data) {
        setUsage(res.data)
      }
    })
  }, [agentId])

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setFormData((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  async function handleSave() {
    if (!agentId || !formData) return
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      const res = await updateVoiceAgent(agentId, formData)
      if (res.success && res.data) {
        setAgent(res.data)
        setFormData(toFormData(res.data))
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 2000)
      } else {
        setSaveError(res.error ?? 'Failed to save settings')
      }
    } catch (err) {
      console.error('Failed to save voice agent settings:', err)
      setSaveError('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  async function handleReindex() {
    if (!agentId) return
    setReindexing(true)
    setReindexError(null)
    setResyncSuccess(false)
    try {
      const res = await setupVoiceAgent(agentId)
      if (res.success) {
        // The setup response reflects the agent as it was before the new
        // indexingJob was written, so we can't read the queued status back
        // from it. The actual isIndexed flip happens async via SQS — reflect
        // that a job was queued optimistically instead of waiting for it.
        setJustQueued(true)
        setResyncSuccess(true)
        setTimeout(() => setResyncSuccess(false), 3000)
      } else {
        setReindexError(res.error ?? 'Failed to re-index website')
      }
    } catch (err) {
      console.error('Failed to re-index voice agent:', err)
      setReindexError('Failed to re-index website')
    } finally {
      setReindexing(false)
    }
  }

  async function handleCopyEmbed() {
    if (!agentId) return
    await navigator.clipboard.writeText(getEmbedSnippet(agentId))
    setCopySuccess(true)
    setTimeout(() => setCopySuccess(false), 2000)
  }

  async function handleDelete() {
    if (!agentId) return
    if (!window.confirm('Are you sure you want to delete this voice agent? This cannot be undone.')) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await deleteVoiceAgent(agentId)
      if (res.success) {
        navigate('/dashboard/voice-agents')
      } else {
        setDeleteError(res.error ?? 'Failed to delete voice agent')
      }
    } catch (err) {
      console.error('Failed to delete voice agent:', err)
      setDeleteError('Failed to delete voice agent')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return <LoadingSkeleton />
  }

  if (!agent || !formData || !agentId) {
    return (
      <div className="flex flex-col items-center text-center py-16">
        <p className="text-gray-900 font-medium">{fetchError ?? 'Voice agent not found'}</p>
        <button
          type="button"
          onClick={() => navigate('/dashboard/voice-agents')}
          className={`mt-4 px-4 py-2.5 text-sm ${primaryButtonClasses}`}
        >
          Back to Voice Agents
        </button>
      </div>
    )
  }

  const jobStatus = agent.indexingJob?.status
  const isIndexingInProgress = justQueued || jobStatus === 'queued' || jobStatus === 'processing'
  const isIndexingFailed = !justQueued && jobStatus === 'failed'

  return (
    <div>
      <button
        type="button"
        onClick={() => navigate('/dashboard/voice-agents')}
        className="flex items-center gap-1 text-gray-500 text-sm hover:text-gray-900 transition-colors mb-2"
      >
        <ChevronLeft size={16} />
        All Voice Agents
      </button>
      <h1 className="font-extrabold text-2xl text-gray-900 mb-6" style={JAKARTA_FONT}>
        {agent.name}
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl p-6 border border-black/5 shadow-sm">
            <h2 className="font-bold text-lg text-gray-900 mb-6" style={JAKARTA_FONT}>
              Settings
            </h2>

            <div className="space-y-4">
              <div>
                <label className={labelClasses}>Agent Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => update('name', e.target.value)}
                  className={inputClasses}
                />
              </div>

              <div>
                <label className={labelClasses}>Greeting Message</label>
                <textarea
                  rows={3}
                  value={formData.greetingMessage}
                  onChange={(e) => update('greetingMessage', e.target.value)}
                  className={inputClasses}
                />
              </div>

              <div>
                <label className={labelClasses}>System Prompt (optional)</label>
                <textarea
                  rows={5}
                  value={formData.systemPrompt}
                  onChange={(e) => update('systemPrompt', e.target.value)}
                  className={inputClasses}
                />
                <p className={hintClasses}>
                  Customize how the AI voice agent behaves. Leave empty for default behavior. Max{' '}
                  {SYSTEM_PROMPT_MAX_LENGTH} characters.
                </p>
                <p
                  className={`text-xs mt-1 text-right ${
                    formData.systemPrompt.length >= SYSTEM_PROMPT_MAX_LENGTH ? 'text-red-500' : 'text-gray-400'
                  }`}
                >
                  {formData.systemPrompt.length}/{SYSTEM_PROMPT_MAX_LENGTH}
                </p>
              </div>

              <div>
                <label className={labelClasses}>Link to existing chatbot (optional)</label>
                <select
                  value={formData.botId}
                  onChange={(e) => update('botId', e.target.value)}
                  className={`${inputClasses} cursor-pointer`}
                >
                  <option value="">None — use only this agent's own knowledge base</option>
                  {bots.map((bot) => (
                    <option key={bot.botId} value={bot.botId}>
                      {bot.name}
                    </option>
                  ))}
                </select>
                <p className={hintClasses}>
                  Also search this chatbot's knowledge base when answering voice calls, in addition to this agent's
                  own indexed content.
                </p>
              </div>

              <div>
                <label className={labelClasses}>Voice</label>
                <select
                  value={formData.voice}
                  onChange={(e) => update('voice', e.target.value as VoiceAgentVoice)}
                  className={`${inputClasses} cursor-pointer`}
                >
                  {VOICE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClasses}>Brand Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={formData.brandColor}
                    onChange={(e) => update('brandColor', e.target.value)}
                    className="w-12 h-12 rounded-xl cursor-pointer border-0 shrink-0"
                    aria-label="Brand color picker"
                  />
                  <input
                    type="text"
                    value={formData.brandColor}
                    onChange={(e) => update('brandColor', e.target.value)}
                    className={`flex-1 ${inputClasses}`}
                  />
                </div>
              </div>

              <div>
                <label className={labelClasses}>Widget Position</label>
                <select
                  value={formData.widgetPosition}
                  onChange={(e) => update('widgetPosition', e.target.value as VoiceAgent['widgetPosition'])}
                  className={`${inputClasses} cursor-pointer`}
                >
                  {WIDGET_POSITION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClasses}>Max Session Duration</label>
                <select
                  value={formData.maxSessionDuration}
                  onChange={(e) =>
                    update('maxSessionDuration', Number(e.target.value) as VoiceAgent['maxSessionDuration'])
                  }
                  className={`${inputClasses} cursor-pointer`}
                >
                  {SESSION_DURATION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-sm font-medium text-gray-700">Agent active</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={formData.isEnabled}
                  onClick={() => update('isEnabled', !formData.isEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    formData.isEnabled ? 'bg-violet-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      formData.isEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {saveError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 mt-4">
                <p className="text-sm text-red-700">{saveError}</p>
              </div>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || formData.systemPrompt.length > SYSTEM_PROMPT_MAX_LENGTH}
              className={`w-full mt-6 py-3 flex items-center justify-center gap-2 ${primaryButtonClasses}`}
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              {saving ? 'Saving...' : saveSuccess ? 'Settings saved' : 'Save Changes'}
            </button>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-black/5 shadow-sm">
            <h2 className="font-bold text-lg text-gray-900 mb-4" style={JAKARTA_FONT}>
              Status
            </h2>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Indexing</span>
                {agent.isIndexed ? (
                  <span className="inline-flex items-center gap-1 border text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border-emerald-200">
                    <Check size={12} />
                    Knowledge base indexed
                  </span>
                ) : isIndexingInProgress ? (
                  <span className="inline-flex items-center gap-1 border text-xs font-semibold px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border-violet-200">
                    <Loader2 size={12} className="animate-spin" />
                    Indexing in progress...
                  </span>
                ) : isIndexingFailed ? (
                  <span className="border text-xs font-semibold px-2.5 py-1 rounded-full bg-red-50 text-red-700 border-red-200">
                    Indexing failed
                  </span>
                ) : (
                  <span className="border text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border-amber-200">
                    Not indexed
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Status</span>
                <span
                  className={`border text-xs font-semibold px-2.5 py-1 rounded-full ${
                    agent.isEnabled
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-gray-50 text-gray-600 border-gray-200'
                  }`}
                >
                  {agent.isEnabled ? 'Live' : 'Disabled'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Created</span>
                <span className="text-sm text-gray-700">{formatCreatedDate(agent.createdAt)}</span>
              </div>
            </div>

            {isIndexingFailed && agent.indexingJob?.error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 mt-4">
                <p className="text-sm text-red-700">{agent.indexingJob.error}</p>
              </div>
            )}

            {reindexError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 mt-4">
                <p className="text-sm text-red-700">{reindexError}</p>
              </div>
            )}

            {resyncSuccess && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mt-4">
                <p className="text-sm text-emerald-700">Resync started — this may take a few minutes.</p>
              </div>
            )}

            <button
              type="button"
              onClick={handleReindex}
              disabled={reindexing || isIndexingInProgress}
              className={`w-full mt-4 py-2.5 flex items-center justify-center gap-2 text-sm ${
                isIndexingFailed ? primaryButtonClasses : secondaryButtonClasses
              }`}
            >
              <RefreshCw size={14} className={reindexing ? 'animate-spin' : ''} />
              {reindexing
                ? 'Resyncing...'
                : isIndexingInProgress
                  ? 'Indexing in progress...'
                  : 'Resync Knowledge Base'}
            </button>

            <button
              type="button"
              onClick={() => navigate(`/dashboard/voice-agents/${agentId}/kb`)}
              className={`w-full mt-3 py-2.5 flex items-center justify-center gap-2 text-sm ${secondaryButtonClasses}`}
            >
              <BookOpen size={14} />
              Manage Knowledge Base
            </button>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-black/5 shadow-sm">
            <h2 className="font-bold text-lg text-gray-900 mb-4" style={JAKARTA_FONT}>
              Usage
            </h2>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div>
                <p className="text-xs text-gray-500">Total Calls</p>
                <p className="text-lg font-bold text-gray-900">{usage?.totalCalls ?? 0}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Total Minutes</p>
                <p className="text-lg font-bold text-gray-900">{usage?.totalMinutes ?? 0}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Total Tokens</p>
                <p className="text-lg font-bold text-gray-900">{usage?.totalTokens ?? 0}</p>
              </div>
            </div>

            {usage && usage.recentCalls.length > 0 ? (
              <div className="space-y-2">
                {usage.recentCalls.map((call) => (
                  <div
                    key={call.callId}
                    className="flex items-center justify-between text-sm border-t border-gray-100 pt-2"
                  >
                    <span className="text-gray-700">{formatCreatedDate(call.startedAt)}</span>
                    <span className="text-gray-500">{call.durationSeconds}s</span>
                    <span className="text-gray-500">{call.totalTokens} tokens</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No calls yet</p>
            )}
          </div>

          <div className="bg-white rounded-2xl p-6 border border-black/5 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Code size={18} className="text-gray-500" />
              <h2 className="font-bold text-lg text-gray-900" style={JAKARTA_FONT}>
                Embed your voice agent
              </h2>
            </div>
            <p className="text-gray-500 text-sm mb-4">
              Paste this code before the closing &lt;/body&gt; tag on your website
            </p>

            <pre className="bg-gray-900 text-green-400 rounded-xl p-4 font-mono text-xs overflow-x-auto">
              {getEmbedSnippet(agentId)}
            </pre>

            <div className="flex items-center gap-4 mt-4">
              <button
                type="button"
                onClick={handleCopyEmbed}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm ${primaryButtonClasses}`}
              >
                {copySuccess ? (
                  <>
                    <Check size={16} />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy size={16} />
                    Copy Code
                  </>
                )}
              </button>
              <a
                href={`/voice-test/preview?agentId=${agentId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-600 text-sm hover:underline"
              >
                Test this snippet &rarr;
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-red-50 border border-red-100 rounded-2xl p-6 mt-6">
        <h2 className="font-bold text-red-800 text-lg mb-4" style={JAKARTA_FONT}>
          Danger zone
        </h2>

        <div className="flex items-center gap-2 mb-1">
          <Trash2 size={16} className="text-red-500" />
          <span className="font-medium text-gray-700">Delete Voice Agent</span>
        </div>
        <p className="text-gray-500 text-sm mb-3">Permanently delete this voice agent and all associated data</p>

        {deleteError && (
          <div className="bg-white border border-red-200 rounded-xl p-3 mb-3">
            <p className="text-sm text-red-700">{deleteError}</p>
          </div>
        )}

        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className={`px-4 py-2.5 text-sm ${dangerButtonClasses}`}
        >
          {deleting ? 'Deleting...' : 'Delete voice agent'}
        </button>
      </div>
    </div>
  )
}
