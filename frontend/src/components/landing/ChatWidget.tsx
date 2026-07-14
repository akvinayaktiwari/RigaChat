import { Bot, ArrowRight } from 'lucide-react'

export default function ChatWidget() {
  return (
    <div className="relative w-80 sm:w-96">
      <div className="absolute -top-8 -right-8 w-56 h-56 bg-violet-300/25 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-8 -left-8 w-44 h-44 bg-pink-300/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-16 -left-4 w-32 h-32 bg-sky-300/15 rounded-full blur-2xl pointer-events-none" />

      <div className="relative bg-white/75 backdrop-blur-2xl border border-white/80 rounded-2xl shadow-2xl shadow-violet-100/60 overflow-hidden">
        <div className="bg-linear-to-r from-violet-600 to-purple-500 px-5 py-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
            <Bot className="w-4.5 h-4.5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm leading-tight">VyostraAI Assistant</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full inline-block" />
              <p className="text-white/70 text-xs">Online · Replies instantly</p>
            </div>
          </div>
          <div className="ml-auto flex gap-1">
            <div className="w-3 h-3 rounded-full bg-red-400/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-400/80" />
            <div className="w-3 h-3 rounded-full bg-green-400/80" />
          </div>
        </div>

        <div className="px-4 py-5 space-y-4 bg-linear-to-b from-white/60 to-white/80">
          <div className="flex gap-2.5 items-end">
            <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
              <Bot className="w-3.5 h-3.5 text-violet-600" />
            </div>
            <div className="bg-gray-100/90 backdrop-blur-sm rounded-2xl rounded-bl-sm px-4 py-3 text-xs text-gray-700 max-w-52 leading-relaxed shadow-sm">
              Hi! I can help you with pricing, onboarding, or a quick demo. What brings you here? 👋
            </div>
          </div>

          <div className="flex justify-end">
            <div className="bg-linear-to-br from-violet-600 to-purple-500 rounded-2xl rounded-br-sm px-4 py-3 text-xs text-white max-w-52 leading-relaxed shadow-sm">
              How does the WhatsApp integration work?
            </div>
          </div>

          <div className="flex gap-2.5 items-end">
            <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
              <Bot className="w-3.5 h-3.5 text-violet-600" />
            </div>
            <div className="bg-gray-100/90 backdrop-blur-sm rounded-2xl rounded-bl-sm px-4 py-3 text-xs text-gray-700 max-w-52 leading-relaxed shadow-sm">
              Connect your WhatsApp Business number in one click — your agent goes live in minutes. Want to see it in
              action?
            </div>
          </div>

          <div className="flex gap-2 flex-wrap pl-9">
            <button className="text-xs border border-violet-200 bg-white/80 text-violet-700 rounded-full px-3 py-1.5 hover:bg-violet-50 transition-colors font-medium shadow-sm">
              Show me a demo
            </button>
            <button className="text-xs border border-violet-200 bg-white/80 text-violet-700 rounded-full px-3 py-1.5 hover:bg-violet-50 transition-colors font-medium shadow-sm">
              View pricing
            </button>
          </div>
        </div>

        <div className="px-4 pb-4">
          <div className="flex items-center gap-2 bg-gray-50/90 rounded-xl px-3.5 py-2.5 border border-gray-100 shadow-inner">
            <span className="text-xs text-gray-400 flex-1 select-none">Ask anything…</span>
            <button className="w-7 h-7 rounded-lg bg-linear-to-br from-violet-600 to-purple-500 flex items-center justify-center shadow-sm hover:opacity-90 transition-opacity">
              <ArrowRight className="w-3.5 h-3.5 text-white" />
            </button>
          </div>
        </div>
      </div>

      <div className="absolute -top-3 -right-3 bg-white rounded-xl px-3 py-2 shadow-lg border border-gray-100 flex items-center gap-2">
        <span className="text-green-500 text-xs font-semibold">↑ 94%</span>
        <span className="text-gray-500 text-xs">resolution rate</span>
      </div>
    </div>
  )
}
