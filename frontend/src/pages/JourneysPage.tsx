import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GitBranch, Plus, Sparkles, Trash2 } from 'lucide-react'
import {
  createJourneyBundleFromTemplate,
  deleteJourneyBundle,
  getJourneyBundles,
  getJourneyTemplates,
  getMyBots,
  publishJourneyBundle,
} from '../services/api'
import { useToast } from '../components/Toast/Toast'
import type { BotConfig, JourneyBundle, JourneyTemplate } from '../types/index'
import Dropdown from '../components/Dropdown/Dropdown'

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

// Shared by the empty state and the header toggle, so the two can never drift
// into showing templates differently.
function TemplateGrid({
  templates,
  loading,
  cloningId,
  onUse,
}: {
  templates: JourneyTemplate[]
  loading: boolean
  cloningId: string | null
  onUse: (template: JourneyTemplate) => void
}) {
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 max-w-3xl mx-auto">
        {[0, 1].map((i) => (
          <div key={i} className="bg-white rounded-2xl border border-black/5 h-40 animate-pulse" />
        ))}
      </div>
    )
  }

  if (templates.length === 0) return null

  return (
    <div className="grid gap-4 sm:grid-cols-2 max-w-3xl mx-auto">
      {templates.map((template) => (
        <div
          key={template.templateId}
          className="bg-white rounded-2xl border border-black/5 p-5 flex flex-col hover:shadow-md transition-all duration-200"
        >
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={16} className="text-violet-500 shrink-0" />
            <h3 className="font-semibold text-gray-900" style={JAKARTA_FONT}>
              {template.name}
            </h3>
          </div>
          <p className="text-sm text-gray-500 grow">{template.description}</p>
          <p className="text-xs text-gray-400 mt-3 mb-4">
            {template.journey.steps.length} steps · {template.agent.mcpToolbox.length} tools
          </p>
          <button
            type="button"
            disabled={cloningId !== null}
            onClick={() => onUse(template)}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm w-full disabled:opacity-60 ${primaryButtonClasses}`}
          >
            {cloningId === template.templateId ? 'Setting it up…' : 'Use this agent'}
          </button>
        </div>
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
  const [templates, setTemplates] = useState<JourneyTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [cloningId, setCloningId] = useState<string | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)

  // Fetched once, not per bot: the library is identical for every client and
  // every bot, so re-fetching on each bot switch would be pure waste.
  useEffect(() => {
    let cancelled = false
    getJourneyTemplates()
      .then((res) => {
        if (cancelled) return
        if (res.success) setTemplates(res.data ?? [])
        setTemplatesLoading(false)
      })
      .catch(() => {
        // A failed template load must not block building from scratch, so this
        // degrades to "no templates offered" rather than an error state.
        if (!cancelled) setTemplatesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleUseTemplate(template: JourneyTemplate) {
    if (!selectedBotId) return
    setCloningId(template.templateId)
    try {
      const res = await createJourneyBundleFromTemplate(template.templateId, { botId: selectedBotId })
      if (res.success && res.data) {
        toast.show('Agent added — edit it to fit, then publish', 'success')
        // Straight into the builder on their own copy. The clone is a draft, so
        // nothing runs until they publish it deliberately.
        navigate(`/dashboard/journeys/${res.data.botId}/${res.data.bundleId}`)
      } else {
        toast.show(res.error ?? 'Could not set up that agent', 'error')
      }
    } catch {
      toast.show('Could not set up that agent', 'error')
    } finally {
      setCloningId(null)
    }
  }

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
            <Dropdown
              value={selectedBotId}
              onChange={setSelectedBotId}
              ariaLabel="Agent"
              variant="inline"
              options={bots.map((bot) => ({ value: bot.botId, label: bot.name }))}
            />
          )}
          {/* Only offered once they already have journeys -- with none, the
              empty state below shows the templates directly, so a button that
              reveals them would be redundant. */}
          {selectedBotId && bundles.length > 0 && templates.length > 0 && (
            <button
              type="button"
              onClick={() => setShowTemplates((v) => !v)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm ${ghostButtonClasses}`}
            >
              <Sparkles size={16} />
              {showTemplates ? 'Hide templates' : 'Start from a template'}
            </button>
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
            Create an agent first
          </h2>
          <p className="text-sm text-gray-500 text-center max-w-xs">
            A journey runs on top of an agent — set one up before building a journey
          </p>
        </div>
      ) : loading ? (
        <ListSkeleton />
      ) : bundles.length === 0 ? (
        <div className="py-12 px-4">
          <div className="flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center mb-4">
              <GitBranch className="w-7 h-7 text-violet-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2" style={JAKARTA_FONT}>
              Start with a prebuilt agent
            </h2>
            <p className="text-sm text-gray-500 max-w-sm mb-8">
              Pick one below and edit it to fit, or build your own from scratch
            </p>
          </div>

          <TemplateGrid
            templates={templates}
            loading={templatesLoading}
            cloningId={cloningId}
            onUse={handleUseTemplate}
          />

          <div className="flex justify-center mt-8">
            <button
              type="button"
              onClick={() => navigate(`/dashboard/journeys/${selectedBotId}/new`)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm ${ghostButtonClasses}`}
            >
              <Plus size={16} />
              Or build one from scratch
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 mt-6">
          {showTemplates && (
            <div className="pb-6 mb-2 border-b border-black/5">
              <TemplateGrid
                templates={templates}
                loading={templatesLoading}
                cloningId={cloningId}
                onUse={handleUseTemplate}
              />
            </div>
          )}
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
