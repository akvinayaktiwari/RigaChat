import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ClipboardList, Code, Copy, Info, Plus, Trash2, X } from 'lucide-react'
import { deleteForm, getMyForms } from '../services/api'
import type { FormConfig } from '../types/index'

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

function CardsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6">
      {[0, 1].map((i) => (
        <div key={i} className="bg-white rounded-2xl p-6 border border-slate-100 animate-pulse">
          <div className="h-12 w-12 bg-slate-200 rounded-xl mb-4" />
          <div className="h-6 w-32 bg-slate-200 rounded mb-2" />
          <div className="h-4 w-48 bg-slate-100 rounded mb-4" />
          <div className="h-8 w-full bg-slate-100 rounded" />
        </div>
      ))}
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
        <h1 className="font-bold text-2xl text-slate-800">Forms</h1>
        <button
          type="button"
          onClick={() => navigate('/dashboard/forms/new')}
          className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2"
        >
          <Plus size={16} />
          New Form
        </button>
      </div>

      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 mt-4 flex items-start gap-3">
        <Info size={18} className="text-indigo-500 shrink-0 mt-0.5" />
        <p className="text-indigo-700 text-sm">
          Create embeddable forms to capture leads from your website. Wrap any button with{' '}
          <code className="font-mono">BeepBoop.openForm(&apos;form-id&apos;)</code> to trigger.
        </p>
      </div>

      {loading ? (
        <CardsSkeleton />
      ) : forms.length === 0 ? (
        <div className="py-20 flex flex-col items-center text-center">
          <ClipboardList className="text-indigo-300 mb-4" size={64} />
          <h2 className="text-2xl font-bold text-slate-800 mb-2">No forms yet</h2>
          <p className="text-slate-500 mb-6 max-w-md">Create your first lead capture form</p>
          <button
            type="button"
            onClick={() => navigate('/dashboard/forms/new')}
            className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-indigo-700 transition-colors"
          >
            + New Form
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6">
          {forms.map((form) => (
            <div
              key={form.formId}
              className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="bg-indigo-100 text-indigo-600 p-3 rounded-xl shrink-0">
                    <ClipboardList size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-slate-800">{form.name}</h3>
                    <span className="bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
                      {form.fields.length} {form.fields.length === 1 ? 'field' : 'fields'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setFormToDelete(form)}
                  title="Delete form"
                  className="text-slate-400 hover:text-red-500 transition-colors shrink-0"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {form.description && <p className="text-slate-500 text-sm mt-2 line-clamp-2">{form.description}</p>}

              <p className="text-xs text-slate-400 mt-2">Submits as: {form.submitButtonText}</p>

              <div className="flex items-center gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => navigate(`/dashboard/forms/${form.formId}/leads`)}
                  className="flex-1 border border-slate-200 text-slate-600 rounded-xl py-2 text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  View Leads
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/dashboard/forms/${form.formId}`)}
                  className="flex-1 border border-slate-200 text-slate-600 rounded-xl py-2 text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  Edit Form
                </button>
              </div>

              <button
                type="button"
                onClick={() => setSelectedFormForEmbed(form)}
                className="w-full mt-2 border border-indigo-200 text-indigo-600 rounded-xl py-2 text-sm font-medium hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2"
              >
                <Code size={16} />
                Embed Code
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Embed Code Modal */}
      {selectedFormForEmbed && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl relative">
            <button
              type="button"
              onClick={() => setSelectedFormForEmbed(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
              title="Close"
            >
              <X size={20} />
            </button>

            <h2 className="text-lg font-bold text-slate-800">Embed This Form</h2>

            <p className="text-sm font-medium text-slate-700 mt-4">Step 1: Add script to your website</p>
            <pre className="bg-slate-900 text-emerald-400 rounded-xl p-4 font-mono text-sm overflow-x-auto mt-2">
              {getEmbedScriptSnippet(selectedFormForEmbed.formId)}
            </pre>
            <button
              type="button"
              onClick={() => handleCopy('script', getEmbedScriptSnippet(selectedFormForEmbed.formId))}
              className="mt-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 text-sm"
            >
              {copiedBlock === 'script' ? (
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

            <p className="text-sm font-medium text-slate-700 mt-5">Step 2: Add onclick to your button</p>
            <pre className="bg-slate-900 text-emerald-400 rounded-xl p-4 font-mono text-sm overflow-x-auto mt-2">
              {getEmbedTriggerSnippet(selectedFormForEmbed.formId)}
            </pre>
            <button
              type="button"
              onClick={() => handleCopy('trigger', getEmbedTriggerSnippet(selectedFormForEmbed.formId))}
              className="mt-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 text-sm"
            >
              {copiedBlock === 'trigger' ? (
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

            <p className="text-xs text-slate-500 mt-4">
              Add the script tag once to your page. Add the onclick attribute to any button you want to trigger this
              form.
            </p>

            <a
              href={`/form-test/preview?formId=${selectedFormForEmbed.formId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-4 text-indigo-600 text-sm hover:underline"
            >
              Test this form &rarr;
            </a>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {formToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h2 className="text-lg font-bold text-slate-800">Delete {formToDelete.name}?</h2>
            <p className="text-sm text-slate-500 mt-2">
              This will permanently delete the form and all captured leads.
            </p>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setFormToDelete(null)}
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
