import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GitBranch, Plus, Trash2 } from 'lucide-react'
import { deleteJourneyBundle, getJourneyBundles, getMyBots, publishJourneyBundle } from '../services/api'
import { useToast } from '../components/Toast/Toast'
import type { BotConfig, JourneyBundle } from '../types/index'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

const primaryButtonClasses =
  'bg-linear-to-r from-violet-600 to-purple-500 text-white font-semibold rounded-xl shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity'
const ghostButtonClasses = 'text-gray-600 font-medium rounded-xl hover:bg-gray-100 transition-colors'

const STATUS_BADGES: Record<JourneyBundle['status'], string> = {
  draft: 'bg-gray-100 text-gray-600 border-gray-200',
  published: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

function ListSkeleton() {
  return (
    <div className="space-y-3 mt-6">
      {[0, 1].map((i) => (
        <div key={i} className="bg-white rounded-2xl p-5 border border-black/5 animate-pulse h-20" />
      ))}
    </div>
  )
}

export default function JourneysPage() {
  const navigate = useNavigate()
  const toast = useToast()

  const [bots, setBots] = useState<BotConfig[]>([])
  const [selectedBotId, setSelectedBotId] = useState('')
  const [bundles, setBundles] = useState<JourneyBundle[]>([])
  const [loading, setLoading] = useState(true)
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const [bundleToDelete, setBundleToDelete] = useState<JourneyBundle | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let cancelled = false
    getMyBots().then((res) => {
      if (cancelled) return
      const myBots = res.data ?? []
      setBots(myBots)
      if (myBots.length > 0) setSelectedBotId(myBots[0].botId)
      else setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selectedBotId) return
    let cancelled = false
    setLoading(true)
    getJourneyBundles(selectedBotId).then((res) => {
      if (cancelled) return
      if (res.success) setBundles(res.data ?? [])
      else toast.show(res.error ?? 'Failed to load journeys', 'error')
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBotId])

  async function handlePublish(bundle: JourneyBundle) {
    setPublishingId(bundle.bundleId)
    try {
      const res = await publishJourneyBundle(bundle.botId, bundle.bundleId)
      if (res.success && res.data) {
        setBundles((prev) => prev.map((b) => (b.bundleId === bundle.bundleId ? (res.data as JourneyBundle) : b)))
        toast.show('Journey published', 'success')
      } else {
        toast.show(res.error ?? 'Failed to publish journey', 'error')
      }
    } catch {
      toast.show('Failed to publish journey', 'error')
    } finally {
      setPublishingId(null)
    }
  }

  async function handleConfirmDelete() {
    if (!bundleToDelete) return
    setDeleting(true)
    try {
      const res = await deleteJourneyBundle(bundleToDelete.botId, bundleToDelete.bundleId)
      if (res.success) {
        setBundles((prev) => prev.filter((b) => b.bundleId !== bundleToDelete.bundleId))
        toast.show('Journey deleted', 'success')
      } else {
        toast.show(res.error ?? 'Failed to delete journey', 'error')
      }
    } catch {
      toast.show('Failed to delete journey', 'error')
    } finally {
      setDeleting(false)
      setBundleToDelete(null)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-extrabold text-2xl text-gray-900" style={JAKARTA_FONT}>
            Journeys
          </h1>
          <p className="text-sm text-gray-500 mt-1">Prebuilt agents that qualify, follow up with, and book leads</p>
        </div>

        <div className="flex items-center gap-3">
          {bots.length > 1 && (
            <select
              value={selectedBotId}
              onChange={(e) => setSelectedBotId(e.target.value)}
              className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              {bots.map((bot) => (
                <option key={bot.botId} value={bot.botId}>
                  {bot.name}
                </option>
              ))}
            </select>
          )}
          {selectedBotId && (
            <button
              type="button"
              onClick={() => navigate(`/dashboard/journeys/${selectedBotId}/new`)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm ${primaryButtonClasses}`}
            >
              <Plus size={16} />
              New Journey
            </button>
          )}
        </div>
      </div>

      {bots.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center mb-4">
            <GitBranch className="w-7 h-7 text-violet-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2" style={JAKARTA_FONT}>
            Create a chatbot first
          </h2>
          <p className="text-sm text-gray-500 text-center max-w-xs">
            Journeys run on top of a chatbot — set one up before building an agent
          </p>
        </div>
      ) : loading ? (
        <ListSkeleton />
      ) : bundles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center mb-4">
            <GitBranch className="w-7 h-7 text-violet-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2" style={JAKARTA_FONT}>
            No journeys yet
          </h2>
          <p className="text-sm text-gray-500 text-center max-w-xs mb-6">
            Build a step-by-step agent that follows up with, qualifies, and books your leads
          </p>
          <button
            type="button"
            onClick={() => navigate(`/dashboard/journeys/${selectedBotId}/new`)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm ${primaryButtonClasses}`}
          >
            <Plus size={16} />
            New Journey
          </button>
        </div>
      ) : (
        <div className="space-y-3 mt-6">
          {bundles.map((bundle) => (
            <div
              key={bundle.bundleId}
              className="bg-white rounded-2xl border border-black/5 p-5 flex items-center justify-between hover:shadow-md transition-all duration-200"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="bg-violet-50 text-violet-500 rounded-xl p-2.5 w-10 h-10 flex items-center justify-center shrink-0">
                  <GitBranch size={20} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-900 truncate" style={JAKARTA_FONT}>
                      {bundle.name}
                    </h3>
                    <span
                      className={`inline-flex border text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_BADGES[bundle.status]}`}
                    >
                      {bundle.status === 'published' ? 'Published' : 'Draft'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 truncate">
                    {bundle.description || `${bundle.journey.steps.length} step${bundle.journey.steps.length === 1 ? '' : 's'}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {bundle.status === 'draft' && (
                  <button
                    type="button"
                    onClick={() => handlePublish(bundle)}
                    disabled={publishingId === bundle.bundleId}
                    className={`px-3 py-2 text-xs ${ghostButtonClasses} disabled:opacity-50`}
                  >
                    {publishingId === bundle.bundleId ? 'Publishing…' : 'Publish'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => navigate(`/dashboard/journeys/${bundle.botId}/${bundle.bundleId}`)}
                  className={`px-3 py-2 text-xs ${ghostButtonClasses}`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setBundleToDelete(bundle)}
                  title="Delete journey"
                  className="text-gray-400 hover:text-red-500 transition-colors p-2"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {bundleToDelete && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl shadow-black/8 border border-gray-100 p-6 max-w-sm w-full">
            <h2 className="font-bold text-xl text-gray-900" style={JAKARTA_FONT}>
              Delete this journey?
            </h2>
            <p className="text-sm text-gray-500 mt-2">
              "{bundleToDelete.name}" will be permanently deleted. This can't be undone.
            </p>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setBundleToDelete(null)}
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
