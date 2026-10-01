import { useCallback, useEffect, useState } from 'react'
import { Check, Clock, Loader2, RefreshCw, TriangleAlert } from 'lucide-react'
import { createWhatsAppTemplate, getWhatsAppTemplates } from '../services/api'
import type { WhatsAppTemplateOverview } from '../types/index'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }
const NOT_CREATED = 'NOT_CREATED'

interface StatusStyle {
  label: string
  classes: string
  icon?: typeof Check
}

// Meta's statuses the dashboard has a specific thing to say about. Anything
// else Meta returns (PAUSED, DISABLED, IN_APPEAL, ...) is shown verbatim rather
// than mapped to the nearest familiar word, which would be a guess.
const STATUS_STYLES: Record<string, StatusStyle> = {
  APPROVED: { label: 'Approved', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: Check },
  PENDING: { label: 'Pending review', classes: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock },
  REJECTED: { label: 'Rejected', classes: 'bg-red-50 text-red-700 border-red-200', icon: TriangleAlert },
  [NOT_CREATED]: { label: 'Not created', classes: 'bg-gray-100 text-gray-500 border-gray-200' },
}

function TemplateStatusBadge({ name, status }: { name: string; status: string }) {
  const style = STATUS_STYLES[status] ?? { label: status, classes: 'bg-gray-100 text-gray-600 border-gray-200' }
  const Icon = style.icon

  return (
    <span
      data-testid={`template-status-${name}`}
      className={`inline-flex items-center gap-1.5 border text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${style.classes}`}
    >
      {Icon && <Icon className="w-3 h-3" />}
      {style.label}
    </span>
  )
}

interface TemplateRowProps {
  template: WhatsAppTemplateOverview
  creating: boolean
  onCreate: (name: string) => void
}

function TemplateRow({ template, creating, onCreate }: TemplateRowProps) {
  return (
    <li data-testid={`template-row-${template.name}`} className="flex items-start justify-between gap-4 py-4">
      <div className="min-w-0">
        <p className="font-mono text-sm font-semibold text-gray-900">{template.name}</p>
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mt-0.5">
          {template.category} · {template.language}
        </p>
        <p className="text-sm text-gray-500 mt-1.5 whitespace-pre-line line-clamp-2">{template.body}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <TemplateStatusBadge name={template.name} status={template.status} />
        {template.status === NOT_CREATED && (
          <button
            type="button"
            data-testid={`template-create-${template.name}`}
            onClick={() => onCreate(template.name)}
            disabled={creating}
            className="inline-flex items-center justify-center border border-violet-200 text-violet-700 font-semibold px-3 py-1.5 rounded-xl text-xs hover:bg-violet-50 transition-colors disabled:opacity-50"
          >
            {creating ? 'Submitting...' : 'Create template'}
          </button>
        )}
      </div>
    </li>
  )
}

interface TemplatesState {
  templates: WhatsAppTemplateOverview[] | null
  error: string | null
  loading: boolean
  reload: () => Promise<void>
  replace: (template: WhatsAppTemplateOverview) => void
}

function useWhatsAppTemplates(): TemplatesState {
  const [templates, setTemplates] = useState<WhatsAppTemplateOverview[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getWhatsAppTemplates()
      setTemplates(res.success && res.data ? res.data : null)
      setError(res.success ? null : (res.error ?? 'Could not load your templates.'))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load your templates.')
    } finally {
      setLoading(false)
    }
  }, [])

  const replace = useCallback((template: WhatsAppTemplateOverview) => {
    setTemplates((current) => current?.map((row) => (row.name === template.name ? template : row)) ?? null)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { templates, error, loading, reload, replace }
}

function TemplatesHeader({ loading, onRefresh }: { loading: boolean; onRefresh: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-gray-50 pb-4">
      <div>
        <h4 className="font-bold text-lg text-gray-900" style={JAKARTA_FONT}>
          Message Templates
        </h4>
        <p className="text-xs text-gray-500 mt-0.5">
          WhatsApp only delivers alerts and first messages that use a template Meta has approved on your own WhatsApp
          Business Account. Create each one here and Meta reviews it.
        </p>
      </div>
      <button
        type="button"
        data-testid="whatsapp-templates-refresh"
        onClick={onRefresh}
        disabled={loading}
        className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 border border-gray-200 px-3 py-1.5 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        Refresh status
      </button>
    </div>
  )
}

function ErrorLine({ message, small }: { message: string | null; small?: boolean }) {
  if (!message) return null
  return (
    <p className={`text-red-600 ${small ? 'text-xs mt-3' : 'text-sm mt-4'}`} role="alert">
      {message}
    </p>
  )
}

export default function WhatsAppTemplates() {
  const { templates, error, loading, reload, replace } = useWhatsAppTemplates()
  const [creatingName, setCreatingName] = useState<string | null>(null)
  // Inline rather than a toast: Meta's reason for refusing a template is long
  // and the client needs to read it, not catch it before it fades.
  const [createError, setCreateError] = useState<string | null>(null)

  async function handleCreate(name: string) {
    setCreatingName(name)
    setCreateError(null)
    try {
      const res = await createWhatsAppTemplate(name)
      if (res.success && res.data) replace(res.data)
      else setCreateError(res.error ?? 'Meta did not accept the template.')
    } catch (createFailure) {
      setCreateError(createFailure instanceof Error ? createFailure.message : 'Meta did not accept the template.')
    } finally {
      setCreatingName(null)
    }
  }

  return (
    <section data-testid="whatsapp-templates" className="bg-white rounded-2xl border border-black/5 shadow-sm p-6">
      <TemplatesHeader loading={loading} onRefresh={() => void reload()} />
      <ErrorLine message={createError} small />
      <ErrorLine message={error} />
      {!templates && !error && <div className="h-32 bg-gray-100 rounded-xl animate-pulse mt-4" />}
      <ul className="divide-y divide-gray-50">
        {templates?.map((template) => (
          <TemplateRow
            key={`${template.name}:${template.language}`}
            template={template}
            creating={creatingName === template.name}
            onCreate={handleCreate}
          />
        ))}
      </ul>
    </section>
  )
}
