import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { MessageSquare, X, Send, Sparkles } from 'lucide-react'

interface Message {
  id: string
  sender: 'user' | 'bot'
  text: string
  time: string
}

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      sender: 'bot',
      text: "Welcome to BeepBoop! 👋 I'm BeepBot, your AI-powered growth assistant. How can I help you turn your traffic into leads today?",
      time: 'Just now',
    },
  ])
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const quickReplies = [
    { label: '🚀 Core Features', value: 'features' },
    { label: '💎 See Pricing Plans', value: 'pricing' },
    { label: '🤝 Speak to Sales Agent', value: 'agent' },
    { label: '🎁 Is there a free trial?', value: 'trial' },
  ]

  const handleSendMessage = (text: string, isFromUser = true) => {
    if (!text.trim()) return

    if (isFromUser) {
      const userMessage: Message = {
        id: Math.random().toString(),
        sender: 'user',
        text,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
      setMessages((prev) => [...prev, userMessage])
      setInputValue('')
      triggerBotResponse(text.toLowerCase())
    }
  }

  const triggerBotResponse = (userText: string) => {
    setIsTyping(true)

    let reply =
      "I'm not fully sure about that, but our team of product specialists is ready to help! Would you like to schedule a quick 10-minute demo?"

    if (userText.includes('feature') || userText.includes('core') || userText.includes('do') || userText.includes('how')) {
      reply =
        'BeepBoop deploys an AI Agent on your website that answers visitor questions 24/7, qualifies leads automatically, and syncs every conversation straight into your built-in CRM.'
    } else if (userText.includes('pricing') || userText.includes('cost') || userText.includes('plan')) {
      reply =
        'BeepBoop starts with a 14-day free trial. Plans start at ₹1,999/month with a full AI Agent, built-in CRM, knowledge base, and website widget embed!'
    } else if (userText.includes('agent') || userText.includes('sales') || userText.includes('human')) {
      reply =
        'Sure! Let me forward you to our Sales team. Since our live agents are currently supporting other inquiries, please leave your email so they can reach out in under 10 minutes!'
    } else if (userText.includes('trial') || userText.includes('free') || userText.includes('signup')) {
      reply =
        "Yes! We offer a full 14-day trial of our top tier package. No credit card is required, and setup assistance is entirely free. Tap 'Get started free' on the landing page to get started right away!"
    }

    setTimeout(() => {
      setIsTyping(false)
      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          sender: 'bot',
          text: reply,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ])
    }, 1200)
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  return (
    <div className="fixed bottom-6 right-6 z-40" id="chat-widget-root">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 30 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="w-80 md:w-96 h-[500px] bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant/40 overflow-hidden flex flex-col mb-4"
            id="chat-widget-container"
          >
            {/* Widget Header */}
            <div className="p-4 bg-primary text-white flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center font-bold text-lg border border-white/20">
                    BB
                  </div>
                  <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 border-2 border-primary rounded-full" />
                </div>
                <div>
                  <h4 className="font-bold text-sm leading-tight flex items-center gap-1">
                    BeepBot <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                  </h4>
                  <p className="text-[11px] text-white/80">Growth &amp; Support Automation</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors"
                aria-label="Close live chat"
                id="close-chat-btn"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Message History area */}
            <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-surface-container-low/30">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                      msg.sender === 'user'
                        ? 'bg-primary text-white rounded-tr-none'
                        : 'bg-surface-container text-on-surface rounded-tl-none border border-outline-variant/20'
                    }`}
                  >
                    <p className="leading-relaxed">{msg.text}</p>
                    <span
                      className={`text-[9px] block text-right mt-1.5 ${
                        msg.sender === 'user' ? 'text-white/60' : 'text-on-surface-variant'
                      }`}
                    >
                      {msg.time}
                    </span>
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-surface-container rounded-2xl rounded-tl-none px-4 py-3 border border-outline-variant/20">
                    <span className="flex gap-1.5 items-center justify-center py-1">
                      <span className="w-2 h-2 rounded-full bg-outline animate-bounce" />
                      <span className="w-2 h-2 rounded-full bg-outline animate-bounce delay-100" />
                      <span className="w-2 h-2 rounded-full bg-outline animate-bounce delay-200" />
                    </span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Replies list */}
            {messages.length === 1 && !isTyping && (
              <div className="px-4 py-2 bg-surface-container-low/40 border-t border-outline-variant/20 flex flex-wrap gap-1.5">
                {quickReplies.map((qr) => (
                  <button
                    key={qr.value}
                    onClick={() => handleSendMessage(qr.label)}
                    className="text-xs bg-surface-container-lowest hover:bg-primary/5 text-primary border border-primary/20 px-3 py-1.5 rounded-full transition-colors font-medium cursor-pointer"
                    id={`quick-reply-${qr.value}`}
                  >
                    {qr.label}
                  </button>
                ))}
              </div>
            )}

            {/* Input form */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleSendMessage(inputValue)
              }}
              className="p-3 bg-surface-container-lowest border-t border-outline-variant/30 flex gap-2"
            >
              <input
                type="text"
                placeholder="Ask BeepBot anything..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="flex-1 bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary text-on-surface"
                id="chat-text-input"
              />
              <button
                type="submit"
                disabled={!inputValue.trim()}
                className="bg-primary text-white p-2.5 rounded-xl disabled:opacity-40 hover:opacity-95 transition-opacity"
                id="send-chat-msg-btn"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Launcher Button */}
      <motion.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="cta-accent text-white p-4 rounded-full shadow-2xl flex items-center justify-center cursor-pointer relative"
        aria-label="Open support chat"
        id="chat-launcher-btn"
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <X className="w-6 h-6" />
            </motion.div>
          ) : (
            <motion.div
              key="message"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="relative"
            >
              <MessageSquare className="w-6 h-6" />
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-yellow-500" />
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  )
}
