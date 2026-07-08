import { useState } from 'react'
import { MessageSquareCode } from 'lucide-react'

export default function WidgetTestPage() {
  const [botId, setBotId] = useState('')

  function handlePreview() {
    if (!botId.trim()) return
    const params = new URLSearchParams({ botId: botId.trim() })
    window.location.href = `/widget-test/preview?${params.toString()}`
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 max-w-md w-full">
        <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center mb-4">
          <MessageSquareCode className="text-indigo-600" size={24} />
        </div>

        <h1 className="text-xl font-bold text-slate-800">Test Widget Embed</h1>
        <p className="text-sm text-slate-500 mt-1">
          Paste a chatbot's Bot ID below. The next page embeds the real widget on a mock
          site so you can chat with it live, exactly as a visitor would.
        </p>

        <div className="mt-6">
          <label className="block text-sm font-medium text-slate-700 mb-2">Bot ID</label>
          <input
            type="text"
            value={botId}
            onChange={(e) => setBotId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePreview()}
            placeholder="e.g. 423677a9-05fc-4db1-a13d-a25a0c49cee0"
            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
          />
          <p className="text-xs text-slate-400 mt-1">
            Find this in a bot's "Get Embed Code" modal, in the data-bot-id attribute
          </p>
        </div>

        <button
          type="button"
          onClick={handlePreview}
          disabled={!botId.trim()}
          className="w-full mt-6 bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Preview Widget
        </button>
      </div>
    </div>
  )
}
