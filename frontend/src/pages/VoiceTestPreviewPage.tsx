import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export default function VoiceTestPreviewPage() {
  const [searchParams] = useSearchParams()
  const agentId = searchParams.get('agentId')
  const injected = useRef(false)

  useEffect(() => {
    if (injected.current || !agentId) return
    injected.current = true

    const cdnUrl = import.meta.env.VITE_CDN_URL
    const widgetSrc = import.meta.env.DEV ? '/voice-widget.js' : `${cdnUrl}/voice-widget.js`
    const script = document.createElement('script')
    script.src = widgetSrc
    script.setAttribute('data-agent-id', agentId)
    script.async = true
    document.body.appendChild(script)
  }, [agentId])

  if (!agentId) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 max-w-md w-full text-center">
          <p className="text-slate-800 font-medium">No Agent ID was provided</p>
          <a
            href="/voice-test"
            className="inline-block mt-4 text-indigo-600 text-sm hover:underline"
          >
            &larr; Back to enter an Agent ID
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <a
        href="/voice-test"
        className="fixed top-4 left-4 z-10000 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-indigo-600 shadow-sm hover:bg-slate-50 transition-colors flex items-center gap-1"
      >
        <ArrowLeft size={14} />
        Test another voice agent
      </a>

      <header className="bg-slate-900 text-white px-10 py-6 font-semibold">
        Acme Real Estate — Example Client Website
      </header>

      <div className="px-10 py-16 text-center">
        <h1 className="text-3xl font-bold text-slate-800">Find your next home with Acme</h1>
        <p className="text-slate-500 mt-3 max-w-md mx-auto">
          This is a mock client website, used only to verify that a voice agent embed actually
          works when dropped onto a real page. The voice pill should appear in the corner
          — click it and talk to the agent with real AI-generated responses.
        </p>
      </div>

      <footer className="px-10 py-6 text-xs text-slate-400 border-t border-slate-100">
        &copy; 2026 Acme Real Estate (fake, for voice widget testing only) — Agent ID: {agentId}
      </footer>
    </div>
  )
}
