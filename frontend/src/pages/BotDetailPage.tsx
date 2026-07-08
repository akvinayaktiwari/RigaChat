import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Code, Copy, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { deleteBot, getBotById, resyncBot, updateBot } from '../services/api'
import type { BotConfig } from '../types/index'

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
  const [resyncing, setResyncing] = useState(false)
  const [resyncUrl, setResyncUrl] = useState('')
  const [resyncResult, setResyncResult] = useState<{ pagesIndexed: number; chunksIndexed: number } | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)

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
      const res = await updateBot(botId, {
        name: bot.name,
        greetingMessage: bot.greetingMessage,
        brandColor: bot.brandColor,
        widgetTrigger: bot.widgetTrigger,
        leadTriggerAfterMessages: bot.leadTriggerAfterMessages,
      })
      if (res.success && res.data) setBot(res.data)
    } catch (error) {
      console.error('Failed to save bot settings:', error)
    } finally {
      setSaving(false)
    }
  }

  async function handleResync() {
    if (!botId || !resyncUrl.trim()) return
    setResyncing(true)
    setResyncResult(null)
    try {
      const res = await resyncBot(botId, resyncUrl.trim())
      if (res.success && res.data) {
        setResyncResult({ pagesIndexed: res.data.pagesIndexed, chunksIndexed: res.data.chunksIndexed })
        setResyncUrl('')
      }
    } catch (error) {
      console.error('Failed to resync website:', error)
    } finally {
      setResyncing(false)
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
                onClick={handleResync}
                disabled={resyncing || !resyncUrl.trim()}
                className="w-full border border-amber-400 text-amber-600 hover:bg-amber-50 px-4 py-2 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {resyncing && <Loader2 size={16} className="animate-spin" />}
                {resyncing ? 'Resyncing...' : 'Resync Website'}
              </button>

              {resyncResult && (
                <p className="text-emerald-600 text-sm mt-3">
                  Resynced — {resyncResult.pagesIndexed} pages, {resyncResult.chunksIndexed} chunks indexed
                </p>
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
