import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Bot, Mail, RotateCcw } from 'lucide-react'

const BACKEND_URL = import.meta.env.VITE_API_URL as string
const BOT_ID = 'bda51d13-2060-4a8c-9650-d623e344c80e'
const BOT_NAME = 'VyostraAI'
const SUPPORT_EMAIL = 'admin@drsyeta.in'
const FALLBACK_GREETING = "Hi! I'm here to help. Ask me anything about VyostraAI."

const SUGGESTED_QUESTIONS = [
  'What is VyostraAI?',
  'How does pricing work?',
  'How do I set up a chatbot?',
  'Does it work with WhatsApp?',
]

interface ChatMessage {
  role: 'bot' | 'user'
  text: string
}

interface StartChatResponse {
  success: boolean
  data?: { conversationId: string; greeting: string }
}

async function startChatConversation(): Promise<{ conversationId: string; greeting: string } | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/chat/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botId: BOT_ID, sourceUrl: window.location.href }),
    })
    const json: StartChatResponse = await res.json()
    if (!json.success || !json.data) return null
    return json.data
  } catch {
    return null
  }
}

interface StreamChatMessageParams {
  conversationId: string
  message: string
  onChunk: (accumulated: string) => void
}

async function streamChatMessage({ conversationId, message, onChunk }: StreamChatMessageParams): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/chat/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ botId: BOT_ID, conversationId, message }),
  })
  if (!res.ok || !res.body) throw new Error('bad response')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let accumulated = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) return
    accumulated += decoder.decode(value, { stream: true })
    onChunk(accumulated)
  }
}

function TypingIndicator() {
  return (
    <div className="flex gap-2.5 items-end self-start">
      <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
        <Bot className="w-3.5 h-3.5 text-violet-600" />
      </div>
      <div className="bg-gray-100/90 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1.5 items-center">
        <span className="w-2 h-2 bg-gray-400 rounded-full demo-chat-dot" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 bg-gray-400 rounded-full demo-chat-dot" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 bg-gray-400 rounded-full demo-chat-dot" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="self-end max-w-[85%] bg-linear-to-br from-violet-600 to-purple-500 rounded-2xl rounded-br-sm px-4 py-3 text-xs text-white leading-relaxed shadow-sm">
        {message.text}
      </div>
    )
  }

  return (
    <div className="flex gap-2.5 items-end self-start max-w-[85%]">
      <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
        <Bot className="w-3.5 h-3.5 text-violet-600" />
      </div>
      <div className="bg-gray-100/90 backdrop-blur-sm rounded-2xl rounded-bl-sm px-4 py-3 text-xs text-gray-700 leading-relaxed shadow-sm">
        {message.text}
      </div>
    </div>
  )
}

export default function DemoChat() {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showChips, setShowChips] = useState(true)
  const [inputValue, setInputValue] = useState('')
  const messagesRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    initConversation()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function initConversation() {
    const result = await startChatConversation()
    if (result) {
      setConversationId(result.conversationId)
      setMessages([{ role: 'bot', text: result.greeting || FALLBACK_GREETING }])
    } else {
      setMessages([{ role: 'bot', text: FALLBACK_GREETING }])
    }
  }

  function resetChat() {
    setMessages([])
    setConversationId(null)
    setIsLoading(false)
    setShowChips(true)
    initConversation()
  }

  function updateLastBotMessage(text: string) {
    setMessages((prev) => {
      const next = [...prev]
      next[next.length - 1] = { role: 'bot', text }
      return next
    })
  }

  async function sendMessage(rawText: string) {
    const text = rawText.trim()
    if (!text || isLoading || !conversationId) return

    setShowChips(false)
    setMessages((prev) => [...prev, { role: 'user', text }, { role: 'bot', text: '' }])
    setIsLoading(true)

    try {
      await streamChatMessage({ conversationId, message: text, onChunk: updateLastBotMessage })
    } catch {
      updateLastBotMessage('Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  function handleSend() {
    if (!inputValue.trim()) return
    const text = inputValue
    setInputValue('')
    sendMessage(text)
  }

  function handleMailClick() {
    window.open(`mailto:${SUPPORT_EMAIL}?subject=VyostraAI Enquiry`, '_blank')
  }

  const initials = BOT_NAME.trim().slice(0, 2).toUpperCase()

  return (
    <div className="relative w-full max-w-105 lg:max-w-110 mx-auto lg:ml-auto">
      <div className="absolute -top-8 -right-8 w-56 h-56 bg-violet-300/25 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-8 -left-8 w-44 h-44 bg-pink-300/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-16 -left-4 w-32 h-32 bg-sky-300/15 rounded-full blur-2xl pointer-events-none" />

      <div
        style={{ height: '520px' }}
        className="relative flex flex-col w-full bg-white/75 backdrop-blur-2xl border border-white/80 rounded-2xl shadow-2xl shadow-violet-100/60 overflow-hidden"
      >
        <div className="shrink-0 bg-linear-to-r from-violet-600 to-purple-500 px-5 py-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center shrink-0 text-white font-bold text-sm">
            {initials || <Bot className="w-4.5 h-4.5 text-white" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm leading-tight">{BOT_NAME}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full inline-block" />
              <p className="text-white/70 text-xs">Online · Replies instantly</p>
            </div>
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={handleMailClick}
              aria-label="Email support"
              className="bg-transparent border-none text-white/80 hover:text-white cursor-pointer p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            >
              <Mail className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={resetChat}
              aria-label="Start new conversation"
              className="bg-transparent border-none text-white/80 hover:text-white cursor-pointer p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div
          ref={messagesRef}
          className="demo-chat-scrollbar flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-3 bg-linear-to-b from-white/60 to-white/80"
        >
          {messages.map((message, index) => (
            <MessageBubble key={index} message={message} />
          ))}
          {isLoading && <TypingIndicator />}
        </div>

        <div
          className={`shrink-0 px-4 flex flex-wrap gap-2 transition-all duration-300 ${
            showChips ? 'opacity-100 max-h-24 pb-3' : 'opacity-0 max-h-0 pb-0 overflow-hidden pointer-events-none'
          }`}
        >
          {SUGGESTED_QUESTIONS.map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => sendMessage(question)}
              className="text-xs border border-violet-200 bg-white/80 text-violet-700 rounded-full px-3 py-1.5 hover:bg-violet-50 transition-colors font-medium shadow-sm cursor-pointer"
            >
              {question}
            </button>
          ))}
        </div>

        <div className="shrink-0 px-4 pb-4 pt-2 bg-white/80 border-t border-black/[0.06]">
          <div className="flex items-center gap-2 bg-gray-50/90 rounded-xl px-3.5 py-2.5 border border-gray-100 shadow-inner">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSend()
              }}
              placeholder="Ask anything…"
              className="flex-1 bg-transparent border-none outline-none text-xs text-gray-700 placeholder-gray-400"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!inputValue.trim() || isLoading}
              aria-label="Send message"
              className="w-7 h-7 rounded-lg bg-linear-to-br from-violet-600 to-purple-500 flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ArrowRight className="w-3.5 h-3.5 text-white" />
            </button>
          </div>
        </div>
      </div>

      <div className="absolute -top-3 -right-3 bg-white rounded-xl px-3 py-2 shadow-lg border border-gray-100 flex items-center gap-2 z-10">
        <span className="text-green-500 text-xs font-semibold">↑ 94%</span>
        <span className="text-gray-500 text-xs">resolution rate</span>
      </div>
    </div>
  )
}
