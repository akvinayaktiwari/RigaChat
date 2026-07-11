import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen,
  Bot as BotIcon,
  Check,
  Code,
  Copy,
  Globe,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  Users,
  X,
  Zap,
} from 'lucide-react'
import { confirmBotIndexing, deleteBot, getMyBots, startBotIndexing } from '../services/api'
import { IndexingProgress } from '../components/IndexingProgress'
import type { BotConfig } from '../types/index'

const WIDGET_TRIGGER_LABELS: Record<BotConfig['widgetTrigger'], string> = {
  immediate: 'Immediate',
  delay_5s: '5 Second Delay',
  scroll_50: 'Scroll 50%',
  exit_intent: 'Exit Intent',
}

const URL_MAX_LENGTH = 40

function truncateUrl(url: string): string {
  return url.length > URL_MAX_LENGTH ? `${url.slice(0, URL_MAX_LENGTH)}…` : url
}

function getEmbedSnippet(botId: string): string {
  const cdnUrl = import.meta.env.VITE_CDN_URL
  return `<script
  src="${cdnUrl}/widget.js"
  data-bot-id="${botId}"
  async>
</script>`
}

function CardsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
      {[0, 1].map((i) => (
        <div key={i} className="bg-white rounded-2xl p-6 border border-slate-100 animate-pulse">
          <div className="h-12 w-12 bg-slate-200 rounded-full mb-4" />
          <div className="h-6 w-32 bg-slate-200 rounded mb-2" />
          <div className="h-4 w-48 bg-slate-100 rounded mb-4" />
          <div className="h-8 w-full bg-slate-100 rounded" />
        </div>
      ))}
    </div>
  )
}

export default function BotsPage() {
  const navigate = useNavigate()
  const [bots, setBots] = useState<BotConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBotForEmbed, setSelectedBotForEmbed] = useState<BotConfig | null>(null)
  const [botToDelete, setBotToDelete] = useState<BotConfig | null>(null)
  const [copySuccess, setCopySuccess] = useState(false)
  const [startingResyncBotId, setStartingResyncBotId] = useState<string | null>(null)
  const [indexingBotId, setIndexingBotId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    getMyBots().then((res) => {
      setBots(res.data ?? [])
      setLoading(false)
    })
  }, [])

  async function handleConfirmDelete() {
    if (!botToDelete) return
    setDeleting(true)
    try {
      const res = await deleteBot(botToDelete.botId)
      if (res.success) {
        setBots((prev) => prev.filter((b) => b.botId !== botToDelete.botId))
      }
    } catch (error) {
      console.error('Failed to delete bot:', error)
    } finally {
      setDeleting(false)
      setBotToDelete(null)
    }
  }

  async function handleResync(bot: BotConfig) {
    setStartingResyncBotId(bot.botId)
    try {
      const res = await startBotIndexing(bot.botId, bot.websiteUrl)
      if (res.success && res.data) {
        // Large-site confirmation is a no-op here — the list view has no
        // per-card dialog, so auto-confirm the top 50 pages rather than
        // leaving the job silently stuck awaiting confirmation.
        if (res.data.status === 'confirmation_required') {
          await confirmBotIndexing(bot.botId, res.data.jobId)
        }
        setIndexingBotId(bot.botId)
      }
    } catch (error) {
      console.error('Failed to resync bot:', error)
    } finally {
      setStartingResyncBotId(null)
    }
  }

  function handleResyncComplete() {
    setIndexingBotId(null)
    getMyBots().then((res) => setBots(res.data ?? []))
  }

  function handleResyncError(botId: string, error: string) {
    console.error(`Resync failed for bot ${botId}:`, error)
  }

  async function handleCopyEmbed() {
    if (!selectedBotForEmbed) return
    await navigator.clipboard.writeText(getEmbedSnippet(selectedBotForEmbed.botId))
    setCopySuccess(true)
    setTimeout(() => setCopySuccess(false), 2000)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-2xl text-slate-800">Chatbots</h1>
        <button
          type="button"
          onClick={() => navigate('/dashboard/bots/new')}
          className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2"
        >
          <Plus size={16} />
          New Chatbot
        </button>
      </div>

      {loading ? (
        <CardsSkeleton />
      ) : bots.length === 0 ? (
        <div className="py-20 flex flex-col items-center text-center">
          <BotIcon className="text-indigo-300 mb-4" size={64} />
          <h2 className="text-2xl font-bold text-slate-800 mb-2">No Chatbots Yet</h2>
          <p className="text-slate-500 mb-6 max-w-md">
            Create your first AI chatbot and start capturing leads from your website
          </p>
          <button
            type="button"
            onClick={() => navigate('/dashboard/bots/new')}
            className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-indigo-700 transition-colors"
          >
            + Create Your First Bot
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {bots.map((bot) => (
            <div
              key={bot.botId}
              className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-linear-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white font-bold text-lg shrink-0">
                    {bot.name.charAt(0).toUpperCase()}
                  </div>
                  <h3 className="font-bold text-lg text-slate-800">{bot.name}</h3>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="bg-emerald-100 text-emerald-700 text-xs px-2 py-1 rounded-full">Active</span>
                  <button
                    type="button"
                    onClick={() => setBotToDelete(bot)}
                    title="Delete bot"
                    className="text-slate-400 hover:text-red-600 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-2">
                <Globe size={14} className="text-slate-400 shrink-0" />
                <span className="text-sm text-slate-500">{truncateUrl(bot.websiteUrl)}</span>
              </div>

              <div className="flex items-center gap-2 mb-4">
                <Zap size={14} className="text-indigo-400 shrink-0" />
                <span className="text-sm text-slate-600">{WIDGET_TRIGGER_LABELS[bot.widgetTrigger]}</span>
              </div>

              <div className="flex items-center gap-2 mb-4">
                <span className="bg-slate-100 text-slate-600 text-xs px-3 py-1 rounded-full">0 Leads</span>
                <span className="bg-emerald-100 text-emerald-600 text-xs px-3 py-1 rounded-full">Active</span>
              </div>

              <div className="flex items-center justify-between mb-4">
                <button
                  type="button"
                  onClick={() => navigate(`/dashboard/leads?botId=${bot.botId}`)}
                  className="flex items-center gap-1 text-sm text-slate-600 hover:text-indigo-600 transition-colors px-3 py-2 hover:bg-indigo-50 rounded-lg"
                >
                  <Users size={14} />
                  Leads
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/dashboard/kb/${bot.botId}`)}
                  className="flex items-center gap-1 text-sm text-slate-600 hover:text-indigo-600 transition-colors px-3 py-2 hover:bg-indigo-50 rounded-lg"
                >
                  <BookOpen size={14} />
                  Knowledge Base
                </button>
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => navigate(`/dashboard/bots/${bot.botId}`)}
                    className="flex items-center gap-1 text-sm text-slate-600 hover:text-indigo-600 transition-colors px-3 py-2 hover:bg-indigo-50 rounded-lg"
                  >
                    <Settings size={14} />
                    Settings
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResync(bot)}
                    disabled={startingResyncBotId === bot.botId || indexingBotId === bot.botId}
                    title="Resync website content"
                    className="text-slate-400 hover:text-indigo-600 transition-colors p-2 disabled:opacity-50"
                  >
                    <RefreshCw size={14} className={startingResyncBotId === bot.botId ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>

              {indexingBotId === bot.botId && (
                <div className="mb-4">
                  <IndexingProgress
                    botId={bot.botId}
                    onComplete={handleResyncComplete}
                    onError={(err) => handleResyncError(bot.botId, err)}
                  />
                </div>
              )}

              <button
                type="button"
                onClick={() => setSelectedBotForEmbed(bot)}
                className="w-full border border-indigo-200 text-indigo-600 rounded-xl py-2 text-sm font-medium hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2"
              >
                <Code size={16} />
                Get Embed Code
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Embed Code Modal */}
      {selectedBotForEmbed && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl relative">
            <button
              type="button"
              onClick={() => setSelectedBotForEmbed(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
              title="Close"
            >
              <X size={20} />
            </button>

            <h2 className="text-lg font-bold text-slate-800">Embed Your Chatbot</h2>
            <p className="text-sm text-slate-500 mt-1">
              Paste this code before the closing &lt;/body&gt; tag on your website
            </p>

            <ol className="text-sm text-slate-600 mt-4 space-y-1 list-decimal list-inside">
              <li>Copy the embed code below</li>
              <li>Open your website&apos;s HTML file</li>
              <li>Paste before the &lt;/body&gt; tag</li>
              <li>Your chatbot will appear automatically</li>
            </ol>

            <pre className="bg-slate-900 text-emerald-400 rounded-xl p-4 font-mono text-sm overflow-x-auto mt-4">
              {getEmbedSnippet(selectedBotForEmbed.botId)}
            </pre>

            <button
              type="button"
              onClick={handleCopyEmbed}
              className="mt-4 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
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
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {botToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h2 className="text-lg font-bold text-slate-800">Delete {botToDelete.name}?</h2>
            <p className="text-sm text-slate-500 mt-2">
              This will permanently delete the chatbot and all associated data.
            </p>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setBotToDelete(null)}
                disabled={deleting}
                className="text-slate-600 hover:text-slate-800 transition-colors px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
