import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen,
  Bot as BotIcon,
  Check,
  Code,
  Copy,
  Globe,
  MoreVertical,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { confirmBotIndexing, deleteBot, getBotIndexingStatus, getMyBots, startBotIndexing } from '../services/api'
import IndexingProgressCard from '../components/IndexingProgressCard'
import { useIndexingStatus } from '../hooks/useIndexingStatus'
import type { BotConfig, BotStatus } from '../types/index'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }
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

function formatCreatedDate(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const STATUS_BADGES: Record<'active' | 'processing' | 'crawl_failed' | 'kb_only', { label: string; classes: string }> = {
  active: { label: 'Active', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  processing: { label: 'Processing', classes: 'bg-violet-50 text-violet-700 border-violet-200' },
  crawl_failed: { label: 'Failed', classes: 'bg-red-50 text-red-700 border-red-200' },
  kb_only: { label: 'KB Only', classes: 'bg-blue-50 text-blue-700 border-blue-200' },
}

function getStatusBadge(status?: BotStatus): { label: string; classes: string } {
  return STATUS_BADGES[status ?? 'active']
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
  const [openMenuBotId, setOpenMenuBotId] = useState<string | null>(null)

  useEffect(() => {
    getMyBots().then((res) => {
      setBots(res.data ?? [])
      setLoading(false)
    })
  }, [])

  const activeIndexingFetchFn = useCallback(async () => {
    if (!indexingBotId) return undefined
    const res = await getBotIndexingStatus(indexingBotId)
    return res.success && res.data && 'jobId' in res.data ? res.data : undefined
  }, [indexingBotId])

  const { job: activeIndexingJob, refresh: refreshIndexingJob } = useIndexingStatus(
    indexingBotId ?? '',
    activeIndexingFetchFn,
    !!indexingBotId
  )

  useEffect(() => {
    if (activeIndexingJob?.status === 'complete') {
      handleResyncComplete()
    }
  }, [activeIndexingJob?.status])

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
    setOpenMenuBotId(null)
    setStartingResyncBotId(bot.botId)
    try {
      const res = await startBotIndexing(bot.botId, bot.websiteUrl ?? '')
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

  const handleResyncRetry = useCallback(
    async (bot: BotConfig) => {
      await handleResync(bot)
      refreshIndexingJob()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [refreshIndexingJob]
  )

  async function handleCopyEmbed() {
    if (!selectedBotForEmbed) return
    await navigator.clipboard.writeText(getEmbedSnippet(selectedBotForEmbed.botId))
    setCopySuccess(true)
    setTimeout(() => setCopySuccess(false), 2000)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-extrabold text-2xl text-gray-900" style={JAKARTA_FONT}>
          Chatbots
        </h1>
        <button
          type="button"
          onClick={() => navigate('/dashboard/bots/new')}
          className="inline-flex items-center gap-2 bg-linear-to-r from-violet-600 to-purple-500 text-white font-semibold px-4 py-2.5 rounded-xl text-sm shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity"
        >
          <Plus size={16} />
          Create New Bot
        </button>
      </div>

      {loading ? (
        <CardsSkeleton />
      ) : bots.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center mb-4">
            <BotIcon className="w-7 h-7 text-violet-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2" style={JAKARTA_FONT}>
            No Chatbots Yet
          </h2>
          <p className="text-sm text-gray-500 text-center max-w-xs mb-6">
            Create your first AI chatbot and start capturing leads from your website
          </p>
          <button
            type="button"
            onClick={() => navigate('/dashboard/bots/new')}
            className="inline-flex items-center gap-2 bg-linear-to-r from-violet-600 to-purple-500 text-white font-semibold px-4 py-2.5 rounded-xl text-sm shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity"
          >
            <Plus size={16} />
            Create your first bot
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {bots.map((bot) => {
            const statusBadge = getStatusBadge(bot.status)
            return (
              <div
                key={bot.botId}
                className="bg-white rounded-2xl border border-black/5 p-5 hover:shadow-md transition-all duration-200"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0"
                      style={{ backgroundColor: bot.brandColor }}
                    >
                      {bot.name.charAt(0).toUpperCase()}
                    </div>
                    <h3 className="font-bold text-gray-900 truncate" style={JAKARTA_FONT}>
                      {bot.name}
                    </h3>
                  </div>
                  <span
                    className={`shrink-0 border text-xs font-semibold px-2.5 py-1 rounded-full ${statusBadge.classes}`}
                  >
                    {statusBadge.label}
                  </span>
                </div>

                <div className="flex items-center gap-2 mb-1.5">
                  <Globe size={14} className="text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-500 truncate">
                    {bot.websiteUrl ? truncateUrl(bot.websiteUrl) : 'Knowledge Base only'}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mb-4">Created {formatCreatedDate(bot.createdAt)}</p>

                {indexingBotId === bot.botId && (
                  <div className="mb-4">
                    <IndexingProgressCard
                      job={activeIndexingJob}
                      surface="bot"
                      onRetry={() => handleResyncRetry(bot)}
                    />
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/dashboard/bots/${bot.botId}`)}
                    className="flex-1 text-gray-600 font-medium px-3 py-2 rounded-xl text-sm hover:bg-gray-100 transition-colors text-center"
                  >
                    View
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedBotForEmbed(bot)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 bg-white text-gray-700 font-medium px-3 py-2 rounded-xl text-sm border border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    <Code size={14} />
                    Embed
                  </button>
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setOpenMenuBotId(openMenuBotId === bot.botId ? null : bot.botId)}
                      title="More actions"
                      className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                    >
                      <MoreVertical size={16} />
                    </button>

                    {openMenuBotId === bot.botId && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setOpenMenuBotId(null)} />
                        <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl border border-gray-100 shadow-lg shadow-black/6 py-1 z-20">
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuBotId(null)
                              navigate(`/dashboard/leads?botId=${bot.botId}`)
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <Users size={14} />
                            Leads
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuBotId(null)
                              navigate(`/dashboard/kb/${bot.botId}`)
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <BookOpen size={14} />
                            Knowledge Base
                          </button>
                          <button
                            type="button"
                            onClick={() => handleResync(bot)}
                            disabled={startingResyncBotId === bot.botId || indexingBotId === bot.botId}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                          >
                            <RefreshCw size={14} className={startingResyncBotId === bot.botId ? 'animate-spin' : ''} />
                            Resync Website
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuBotId(null)
                              navigate(`/dashboard/bots/${bot.botId}`)
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <Settings size={14} />
                            Settings
                          </button>
                          <div className="border-t border-gray-100 my-1" />
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuBotId(null)
                              setBotToDelete(bot)
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={14} />
                            Delete Bot
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Embed Code Modal */}
      {selectedBotForEmbed && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl shadow-black/8 border border-gray-100 max-w-lg w-full mx-4 p-6 relative">
            <button
              type="button"
              onClick={() => setSelectedBotForEmbed(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
              title="Close"
            >
              <X size={20} />
            </button>

            <h2 className="font-bold text-xl text-gray-900 mb-4" style={JAKARTA_FONT}>
              Embed Your Chatbot
            </h2>
            <p className="text-sm text-gray-500 -mt-3 mb-4">
              Paste this code before the closing &lt;/body&gt; tag on your website
            </p>

            <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside mb-4">
              <li>Copy the embed code below</li>
              <li>Open your website&apos;s HTML file</li>
              <li>Paste before the &lt;/body&gt; tag</li>
              <li>Your chatbot will appear automatically</li>
            </ol>

            <pre className="bg-gray-900 text-green-400 font-mono text-xs rounded-xl p-4 overflow-x-auto">
              {getEmbedSnippet(selectedBotForEmbed.botId)}
            </pre>

            <button
              type="button"
              onClick={handleCopyEmbed}
              className="mt-4 inline-flex items-center gap-2 bg-linear-to-r from-violet-600 to-purple-500 text-white font-semibold px-4 py-2.5 rounded-xl text-sm shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity"
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
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl shadow-black/8 border border-gray-100 max-w-sm w-full mx-4 p-6">
            <h2 className="font-bold text-xl text-gray-900" style={JAKARTA_FONT}>
              Delete {botToDelete.name}?
            </h2>
            <p className="text-sm text-gray-500 mt-2">
              This will permanently delete the chatbot and all associated data.
            </p>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setBotToDelete(null)}
                disabled={deleting}
                className="text-gray-600 font-medium px-3 py-2 rounded-xl text-sm hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="bg-red-500 text-white font-semibold px-4 py-2.5 rounded-xl text-sm hover:bg-red-600 transition-colors disabled:opacity-50"
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
