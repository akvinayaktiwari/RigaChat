import { useState } from 'react'
import { ClipboardList } from 'lucide-react'

export default function FormTestPage() {
  const [formId, setFormId] = useState('')

  function handlePreview() {
    if (!formId.trim()) return
    const params = new URLSearchParams({ formId: formId.trim() })
    window.location.href = `/form-test/preview?${params.toString()}`
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 max-w-md w-full">
        <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center mb-4">
          <ClipboardList className="text-indigo-600" size={24} />
        </div>

        <h1 className="text-xl font-bold text-slate-800">Test Form Embed</h1>
        <p className="text-sm text-slate-500 mt-1">
          Paste a form&apos;s Form ID below. The next page embeds the real form on a mock site
          so you can submit it live, exactly as a visitor would.
        </p>

        <div className="mt-6">
          <label className="block text-sm font-medium text-slate-700 mb-2">Form ID</label>
          <input
            type="text"
            value={formId}
            onChange={(e) => setFormId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePreview()}
            placeholder="e.g. 423677a9-05fc-4db1-a13d-a25a0c49cee0"
            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
          />
          <p className="text-xs text-slate-400 mt-1">
            Find this in a form&apos;s &quot;Embed Code&quot; modal, in the data-form-id attribute
          </p>
        </div>

        <button
          type="button"
          onClick={handlePreview}
          disabled={!formId.trim()}
          className="w-full mt-6 bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Preview Form
        </button>
      </div>
    </div>
  )
}
