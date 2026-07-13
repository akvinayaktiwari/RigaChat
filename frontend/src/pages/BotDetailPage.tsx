import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Code, Copy, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { confirmBotIndexing, deleteBot, getBotById, getBotIndexingStatus, startBotIndexing, updateBot } from '../services/api'
import type { BotConfig, IndexingJob } from '../types/index'

type LocalIndexingStatus = 'idle' | 'scanning' | IndexingJob['status']

const POLL_INTERVAL_MS = 3000

const WIDGET_TRIGGER_OPTIONS: { value: BotConfig['widgetTrigger']; label: string }[] = [
  { value: 'immediate', label: 'Immediately' },
  { value: 'delay_5s', label: '5 Second Delay' },
  { value: 'scroll_50', label: 'Scroll 50%' },
  { value: 'exit_intent', label: 'Exit Intent' },
]

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/

function isValidHexColor(value: string): boolean {
  return HEX_COLOR_REGEX.test(value)
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value)
}

function getEmbedSnippet(botId: string): string {
  const cdnUrl = import.meta.env.VITE_CDN_URL
  return `<!-- BeepBoop Widget -->
<script
  src="${cdnUrl}/widget.js"
  data-bot-id="${botId}"
  async>
</script>`
}

const inputClasses =
  'w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all'
const labelClasses = 'block text-sm font-medium text-slate-700 mb-2'

function LoadingSkeleton() {
  return (
    <div>
      <div className="h-4 w-24 bg-slate-100 rounded animate-pulse mb-6" />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 bg-white rounded-2xl p-6 border border-slate-100 animate-pulse space-y-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 bg-slate-100 rounded-xl" />
          ))}
        </div>
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-100 animate-pulse space-y-4">
          <div className="h-10 bg-slate-100 rounded-xl" />
          <div className="h-10 bg-slate-100 rounded-xl" />
        </div>
      </div>
    </div>
  )
}

export default function BotDetailPage() {
  const { botId } = useParams<{ botId: string }>()
  const navigate = useNavigate()

  const [bot, setBot] = useState<BotConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resyncUrl, setResyncUrl] = useState('')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)

  const [indexingStatus, setIndexingStatus] = useState<LocalIndexingStatus>('idle')
  const [indexingJob, setIndexingJob] = useState<IndexingJob | null>(null)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [pendingJob, setPendingJob] = useState<{ jobId: string; totalPages: number; selectedPages: number } | null>(
    null
  )
  const pollingRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (pollingRef.current) window.clearInterval(pollingRef.current)
    }
  }, [])

  useEffect(() => {
    if (!botId) {
      setLoading(false)
      return
    }
    getBotById(botId).then((res) => {
      if (res.success && res.data) setBot(res.data)
      setLoading(false)
    })
  }, [botId])

  async function handleSave() {
    if (!bot || !botId) return
    setSaving(true)
    try {
      const trimmedSupportEmail = (bot.supportEmail ?? '').trim()
      const res = await updateBot(botId, {
        name: bot.name,
        greetingMessage: bot.greetingMessage,
        brandColor: bot.brandColor,
        widgetTrigger: bot.widgetTrigger,
        leadTriggerAfterMessages: bot.leadTriggerAfterMessages,
        supportEmail: trimmedSupportEmail && isValidEmail(trimmedSupportEmail) ? trimmedSupportEmail : undefined,
      })
      if (res.success && res.data) setBot(res.data)
    } catch (error) {
      console.error('Failed to save bot settings:', error)
    } finally {
      setSaving(false)
    }
  }

  function startPolling() {
    if (pollingRef.current) window.clearInterval(pollingRef.current)
    pollingRef.current = window.setInterval(async () => {
      if (!botId) return
      const res = await getBotIndexingStatus(botId)
      if (!res.success || !res.data) return

      setIndexingStatus(res.data.status)
      if ('jobId' in res.data) setIndexingJob(res.data)

      if (res.data.status === 'complete' || res.data.status === 'failed') {
        if (pollingRef.current) window.clearInterval(pollingRef.current)
        pollingRef.current = null
        if (res.data.status === 'complete') {
          const refreshed = await getBotById(botId)
          if (refreshed.success && refreshed.data) setBot(refreshed.data)
        }
      }
    }, POLL_INTERVAL_MS)
  }

  async function handleStartIndexing() {
    if (!botId || !resyncUrl.trim()) return
    setIndexingStatus('scanning')
    setIndexingJob(null)
    try {
      const res = await startBotIndexing(botId, resyncUrl.trim())
      if (!res.success || !res.data) {
        setIndexingStatus('failed')
        return
      }
      if (res.data.status === 'confirmation_required') {
        setPendingJob({
          jobId: res.data.jobId,
          totalPages: res.data.totalPages,
          selectedPages: res.data.selectedPages ?? 50,
        })
        setShowConfirmDialog(true)
        setIndexingStatus('confirmation_required')
      } else {
        setIndexingStatus('queued')
        startPolling()
      }
    } catch (error) {
      console.error('Failed to start indexing:', error)
      setIndexingStatus('failed')
    }
  }

  async function handleConfirmIndexing() {
    if (!botId || !pendingJob) return
    setShowConfirmDialog(false)
    try {
      await confirmBotIndexing(botId, pendingJob.jobId)
      setIndexingStatus('queued')
      startPolling()
    } catch (error) {
      console.error('Failed to confirm indexing:', error)
      setIndexingStatus('failed')
    }
  }

  async function handleDelete() {
    if (!botId) return
    setDeleting(true)
    try {
      const res = await deleteBot(botId)
      if (res.success) {
        navigate('/dashboard/bots')
      }
    } catch (error) {
      console.error('Failed to delete bot:', error)
    } finally {
      setDeleting(false)
      setShowDeleteModal(false)
    }
  }

  async function handleCopyEmbed() {
    if (!bot) return
    await navigator.clipboard.writeText(getEmbedSnippet(bot.botId))
    setCopySuccess(true)
    setTimeout(() => setCopySuccess(false), 2000)
  }

  if (loading) {
    return <LoadingSkeleton />
  }

  if (!bot || !botId) {
    return (
      <div className="flex flex-col items-center text-center py-16">
        <p className="text-slate-800 font-medium">Bot not found</p>
        <button
          type="button"
          onClick={() => navigate('/dashboard/bots')}
          className="mt-4 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm hover:bg-indigo-700 transition-colors"
        >
          Back to Chatbots
        </button>
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => navigate('/dashboard/bots')}
        className="flex items-center gap-1 text-slate-500 text-sm hover:text-slate-700 transition-colors"
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <div className="mt-4">
        <h1 className="text-2xl font-bold text-slate-800">{bot.name}</h1>
        <p className="text-slate-500 text-sm">Bot Settings</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mt-6">
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <h2 className="font-semibold text-lg text-slate-800 mb-6">Configuration</h2>

            <div className="space-y-4">
              <div>
                <label className={labelClasses}>Bot Name</label>
                <input
                  type="text"
                  value={bot.name}
                  onChange={(e) => setBot({ ...bot, name: e.target.value })}
                  className={inputClasses}
                />
              </div>

              <div>
                <label className={labelClasses}>Greeting Message</label>
                <textarea
                  rows={3}
                  value={bot.greetingMessage}
                  onChange={(e) => setBot({ ...bot, greetingMessage: e.target.value })}
                  className={inputClasses}
                />
              </div>

              <div>
                <label className={labelClasses}>Support Email</label>
                <input
                  type="email"
                  value={bot.supportEmail || ''}
                  onChange={(e) => setBot({ ...bot, supportEmail: e.target.value })}
                  placeholder="Auto-detected from your website"
                  className={inputClasses}
                />
                <p className="mt-1.5 text-xs text-slate-400">
                  Detected automatically during setup. Visitors can contact this address directly from the chatbot.
                </p>
                {bot.supportEmail && !isValidEmail(bot.supportEmail.trim()) && (
                  <p className="mt-1.5 text-xs text-red-500">Please enter a valid email address.</p>
                )}
              </div>

              <div>
                <label className={labelClasses}>Brand Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={isValidHexColor(bot.brandColor) ? bot.brandColor : '#6366f1'}
                    onChange={(e) => setBot({ ...bot, brandColor: e.target.value })}
                    className="w-12 h-12 rounded-xl cursor-pointer border-0"
                    aria-label="Brand color picker"
                  />
                  <input
                    type="text"
                    value={bot.brandColor}
                    onChange={(e) => setBot({ ...bot, brandColor: e.target.value })}
                    className="flex-1 px-4 py-3 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
              </div>

              <div>
                <label className={labelClasses}>Widget Trigger</label>
                <select
                  value={bot.widgetTrigger}
                  onChange={(e) => setBot({ ...bot, widgetTrigger: e.target.value as BotConfig['widgetTrigger'] })}
                  className={`${inputClasses} bg-white cursor-pointer`}
                >
                  {WIDGET_TRIGGER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClasses}>Lead Trigger After Messages</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={bot.leadTriggerAfterMessages}
                  onChange={(e) =>
                    setBot({
                      ...bot,
                      leadTriggerAfterMessages: Math.min(10, Math.max(1, Number(e.target.value) || 1)),
                    })
                  }
                  className={`${inputClasses} max-w-[120px]`}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="w-full mt-6 bg-indigo-600 text-white px-6 py-3 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Code size={18} className="text-slate-500" />
              <h2 className="font-semibold text-slate-800">Embed Code</h2>
            </div>
            <p className="text-slate-500 text-sm mb-4">
              Paste this code before the closing &lt;/body&gt; tag on your website
            </p>

            <pre className="bg-slate-900 text-emerald-400 rounded-xl p-4 font-mono text-sm overflow-x-auto">
              {getEmbedSnippet(bot.botId)}
            </pre>

            <div className="flex items-center gap-4 mt-4">
              <button
                type="button"
                onClick={handleCopyEmbed}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700 transition-colors"
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
                href={`/widget-test/preview?botId=${bot.botId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 text-sm hover:underline"
              >
                Test this snippet &rarr;
              </a>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl p-6 border border-red-100 shadow-sm">
            <h2 className="text-red-600 font-semibold text-lg mb-4">Danger Zone</h2>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <RefreshCw size={16} className="text-amber-500" />
                <span className="font-medium text-slate-700">Resync Website</span>
              </div>
              <p className="text-slate-500 text-sm mb-3">
                Re-crawl your website and rebuild the bot&apos;s knowledge from scratch
              </p>

              <input
                type="text"
                value={resyncUrl}
                onChange={(e) => setResyncUrl(e.target.value)}
                placeholder="https://yourwebsite.com"
                className={`${inputClasses} mb-3`}
              />

              <button
                type="button"
                onClick={handleStartIndexing}
                disabled={indexingStatus === 'scanning' || indexingStatus === 'queued' || indexingStatus === 'processing' || !resyncUrl.trim()}
                className="w-full border border-amber-400 text-amber-600 hover:bg-amber-50 px-4 py-2 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {(indexingStatus === 'scanning' || indexingStatus === 'queued' || indexingStatus === 'processing') && (
                  <Loader2 size={16} className="animate-spin" />
                )}
                {indexingStatus === 'scanning' ? 'Scanning...' : 'Resync Website'}
              </button>

              {indexingStatus !== 'idle' && indexingStatus !== 'confirmation_required' && (
                <div className="bg-slate-50 rounded-xl p-4 mt-4">
                  <p className="font-bold text-slate-800 text-sm">Building Knowledge Base...</p>
                  <div className="bg-slate-200 rounded-full h-2 w-full mt-3">
                    <div
                      className="bg-indigo-600 rounded-full h-2 transition-all"
                      style={{
                        width: `${
                          indexingJob && indexingJob.selectedPages > 0
                            ? Math.min(100, (indexingJob.crawledPages / indexingJob.selectedPages) * 100)
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    {(indexingStatus === 'scanning' || indexingStatus === 'queued') && 'Scanning pages...'}
                    {indexingStatus === 'processing' &&
                      indexingJob &&
                      `${indexingJob.crawledPages} of ${indexingJob.selectedPages} pages processed`}
                    {indexingStatus === 'complete' &&
                      indexingJob &&
                      `✓ Complete — ${indexingJob.totalChunks} knowledge chunks indexed`}
                    {indexingStatus === 'failed' &&
                      `✗ Failed: ${indexingJob?.error ?? 'Unknown error'}`}
                  </p>
                </div>
              )}
            </div>

            <div className="border-t border-red-100 my-6" />

            <div>
              <div className="flex items-center gap-2 mb-1">
                <Trash2 size={16} className="text-red-500" />
                <span className="font-medium text-slate-700">Delete Bot</span>
              </div>
              <p className="text-slate-500 text-sm mb-3">Permanently delete this chatbot and all associated data</p>

              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                className="w-full border border-red-300 text-red-600 hover:bg-red-50 px-4 py-2 rounded-xl transition-colors"
              >
                Delete Bot
              </button>
            </div>
          </div>
        </div>
      </div>

      {showConfirmDialog && pendingJob && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-md w-full shadow-xl">
            <h2 className="font-bold text-slate-800 text-lg">Large Website Detected</h2>
            <p className="text-sm text-slate-500 mt-2">
              We found {pendingJob.totalPages} pages on this website. We will crawl the {pendingJob.selectedPages}{' '}
              most relevant pages to build your knowledge base.
            </p>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  setShowConfirmDialog(false)
                  setIndexingStatus('idle')
                }}
                className="border border-slate-200 text-slate-600 px-4 py-2 rounded-xl text-sm hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmIndexing}
                className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm hover:bg-indigo-700 transition-colors"
              >
                Continue with {pendingJob.selectedPages} pages
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h2 className="text-lg font-bold text-slate-800">Delete {bot.name}?</h2>
            <p className="text-sm text-slate-500 mt-2">
              This will permanently delete the chatbot, all leads, and knowledge base entries.
            </p>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="text-slate-600 hover:text-slate-800 transition-colors px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
