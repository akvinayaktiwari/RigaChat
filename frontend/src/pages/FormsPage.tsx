import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Code, Copy, FileText, Info, Plus, Trash2, X } from 'lucide-react'
import { deleteForm, getMyForms } from '../services/api'
import type { FormConfig } from '../types/index'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

function getEmbedScriptSnippet(formId: string): string {
  const cdnUrl = import.meta.env.VITE_CDN_URL
  return `<script
  src="${cdnUrl}/form-widget.js"
  data-form-id="${formId}"
  async>
</script>`
}

function getEmbedTriggerSnippet(formId: string): string {
  return `onclick="BeepBoop.openForm('${formId}')"`
}

const primaryButtonClasses =
  'bg-linear-to-r from-violet-600 to-purple-500 text-white font-semibold rounded-xl shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity'
const secondaryButtonClasses =
  'bg-white text-gray-700 font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors'
const ghostButtonClasses = 'text-gray-600 font-medium rounded-xl hover:bg-gray-100 transition-colors'

function CardsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-white rounded-2xl p-5 border border-black/5 animate-pulse">
          <div className="h-10 w-10 bg-gray-100 rounded-xl mb-3" />
          <div className="h-6 w-32 bg-gray-100 rounded mb-2" />
          <div className="h-4 w-24 bg-gray-100 rounded mb-4" />
          <div className="h-8 w-full bg-gray-100 rounded" />
        </div>
      ))}
    </div>
  )
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
      <pre className="bg-gray-900 rounded-xl p-4 font-mono text-xs text-green-400 overflow-x-auto mt-2">{code}</pre>
    </div>
  )
}

export default function FormsPage() {
  const navigate = useNavigate()
  const [forms, setForms] = useState<FormConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedFormForEmbed, setSelectedFormForEmbed] = useState<FormConfig | null>(null)
  const [formToDelete, setFormToDelete] = useState<FormConfig | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [copiedBlock, setCopiedBlock] = useState<'script' | 'trigger' | null>(null)

  useEffect(() => {
    getMyForms().then((res) => {
      setForms(res.data ?? [])
      setLoading(false)
    })
  }, [])

  async function handleConfirmDelete() {
    if (!formToDelete) return
    setDeleting(true)
    try {
      const res = await deleteForm(formToDelete.formId)
      if (res.success) {
        setForms((prev) => prev.filter((f) => f.formId !== formToDelete.formId))
      }
    } catch (error) {
      console.error('Failed to delete form:', error)
    } finally {
      setDeleting(false)
      setFormToDelete(null)
    }
  }

  async function handleCopy(block: 'script' | 'trigger', text: string) {
    await navigator.clipboard.writeText(text)
    setCopiedBlock(block)
    setTimeout(() => setCopiedBlock(null), 2000)
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-extrabold text-2xl text-gray-900" style={JAKARTA_FONT}>
            Forms
          </h1>
          <p className="text-sm text-gray-500 mt-1">Embeddable lead capture forms</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/dashboard/forms/new')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm ${primaryButtonClasses}`}
        >
          <Plus size={16} />
          Create Form
        </button>
      </div>

      <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4 mt-4 flex items-start gap-3">
        <Info size={18} className="text-violet-500 shrink-0 mt-0.5" />
        <p className="text-violet-700 text-sm">
          Create embeddable forms to capture leads from your website. Wrap any button with{' '}
          <code className="font-mono">BeepBoop.openForm(&apos;form-id&apos;)</code> to trigger.
        </p>
      </div>

      {loading ? (
        <CardsSkeleton />
      ) : forms.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center mb-4">
            <FileText className="w-7 h-7 text-violet-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2" style={JAKARTA_FONT}>
            No forms yet
          </h2>
          <p className="text-sm text-gray-500 text-center max-w-xs mb-6">Create your first embeddable form</p>
          <button
            type="button"
            onClick={() => navigate('/dashboard/forms/new')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm ${primaryButtonClasses}`}
          >
            <Plus size={16} />
            Create Form
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {forms.map((form) => (
            <div
              key={form.formId}
              className="bg-white rounded-2xl border border-black/5 p-5 hover:shadow-md transition-all duration-200"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="bg-violet-50 text-violet-500 rounded-xl p-2.5 w-10 h-10 flex items-center justify-center shrink-0">
                  <FileText size={20} />
                </div>
                <button
                  type="button"
                  onClick={() => setFormToDelete(form)}
                  title="Delete form"
                  className="text-gray-400 hover:text-red-500 transition-colors shrink-0"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <h3 className="font-bold text-lg text-gray-900 mb-1" style={JAKARTA_FONT}>
                {form.name}
              </h3>
              <p className="text-sm text-gray-500">
                {form.fields.length} {form.fields.length === 1 ? 'field' : 'fields'}
              </p>
              <p className="text-xs text-gray-400 mt-1">Submits as: {form.submitButtonText}</p>

              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-50">
                <button
                  type="button"
                  onClick={() => navigate(`/dashboard/forms/${form.formId}/leads`)}
                  className={`flex-1 px-3 py-2 text-xs ${ghostButtonClasses}`}
                >
                  View Leads
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFormForEmbed(form)}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs ${secondaryButtonClasses}`}
                >
                  <Code size={13} />
                  Embed
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/dashboard/forms/${form.formId}`)}
                  className={`flex-1 px-3 py-2 text-xs ${ghostButtonClasses}`}
                >
                  Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Embed Code Modal */}
      {selectedFormForEmbed && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl shadow-black/8 border border-gray-100 p-6 w-full max-w-xl relative">
            <button
              type="button"
              onClick={() => setSelectedFormForEmbed(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
              title="Close"
            >
              <X size={20} />
            </button>

            <h2 className="font-bold text-xl text-gray-900 mb-5" style={JAKARTA_FONT}>
              Embed this form
            </h2>

            <p className="text-sm font-medium text-gray-700 mb-2">Step 1: Add script to your website</p>
            <div className="relative mb-5">
              <CodeBlock label="Script tag" code={getEmbedScriptSnippet(selectedFormForEmbed.formId)} />
              <button
                type="button"
                onClick={() => handleCopy('script', getEmbedScriptSnippet(selectedFormForEmbed.formId))}
                className={`absolute top-0 right-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs ${primaryButtonClasses}`}
              >
                {copiedBlock === 'script' ? (
                  <>
                    <Check size={13} />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy size={13} />
                    Copy
                  </>
                )}
              </button>
            </div>

            <p className="text-sm font-medium text-gray-700 mb-2">Step 2: Add onclick to your button</p>
            <div className="relative mb-2">
              <CodeBlock label="Trigger attribute" code={getEmbedTriggerSnippet(selectedFormForEmbed.formId)} />
              <button
                type="button"
                onClick={() => handleCopy('trigger', getEmbedTriggerSnippet(selectedFormForEmbed.formId))}
                className={`absolute top-0 right-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs ${primaryButtonClasses}`}
              >
                {copiedBlock === 'trigger' ? (
                  <>
                    <Check size={13} />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy size={13} />
                    Copy
                  </>
                )}
              </button>
            </div>

            <p className="text-xs text-gray-500 mt-4">
              Add the script tag once to your page. Add the onclick attribute to any button you want to trigger this
              form.
            </p>

            <a
              href={`/form-test/preview?formId=${selectedFormForEmbed.formId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-4 text-violet-600 text-sm hover:underline"
            >
              Test this form &rarr;
            </a>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {formToDelete && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl shadow-black/8 border border-gray-100 p-6 max-w-sm w-full">
            <h2 className="font-bold text-xl text-gray-900" style={JAKARTA_FONT}>
              Delete {formToDelete.name}?
            </h2>
            <p className="text-sm text-gray-500 mt-2">
              This will permanently delete the form and all captured leads.
            </p>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setFormToDelete(null)}
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
