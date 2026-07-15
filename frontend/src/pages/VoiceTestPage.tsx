import { useState } from 'react'
import { Mic } from 'lucide-react'

export default function VoiceTestPage() {
  const [agentId, setAgentId] = useState('')

  function handlePreview() {
    if (!agentId.trim()) return
    const params = new URLSearchParams({ agentId: agentId.trim() })
    window.location.href = `/voice-test/preview?${params.toString()}`
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 max-w-md w-full">
        <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center mb-4">
          <Mic className="text-indigo-600" size={24} />
        </div>

        <h1 className="text-xl font-bold text-slate-800">Test Voice Agent Embed</h1>
        <p className="text-sm text-slate-500 mt-1">
          Paste a voice agent&apos;s Agent ID below. The next page embeds the real widget on a
          mock site so you can talk to it live, exactly as a visitor would.
        </p>

        <div className="mt-6">
          <label className="block text-sm font-medium text-slate-700 mb-2">Agent ID</label>
          <input
            type="text"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePreview()}
            placeholder="e.g. 423677a9-05fc-4db1-a13d-a25a0c49cee0"
            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
          />
          <p className="text-xs text-slate-400 mt-1">
            Find this in a voice agent&apos;s embed code, in the data-agent-id attribute
          </p>
        </div>

        <button
          type="button"
          onClick={handlePreview}
          disabled={!agentId.trim()}
          className="w-full mt-6 bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Preview Voice Agent
        </button>
      </div>
    </div>
  )
}
