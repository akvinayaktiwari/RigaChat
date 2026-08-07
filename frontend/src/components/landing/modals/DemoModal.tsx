import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { X, Play, Pause, RotateCcw, Route, Send, Bot, MessageSquareCode, Check } from 'lucide-react'

interface DemoModalProps {
  isOpen: boolean
  onClose: () => void
}

interface ChatMessage {
  id: string
  sender: 'customer' | 'bot'
  text: string
  time: string
}

type Scenario = 'chat' | 'journey'

// The scripted conversation, keyed by the progress value each message appears
// at. Messages are DERIVED from progress rather than appended to state: the
// previous version called setMessages() from inside a setProgress() updater,
// and because React StrictMode invokes updaters twice to surface impurity,
// every message was inserted twice. Filtering a constant list by progress is
// pure, so replay and pause cannot desync it either.
const SCRIPT: { at: number; msg: ChatMessage }[] = [
  { at: 0, msg: { id: '1', sender: 'customer', text: 'Hi, do you have 3BHK flats in Whitefield?', time: '12:40 PM' } },
  {
    at: 14,
    msg: {
      id: '2',
      sender: 'bot',
      text: 'We do — three 3BHK units are available in Whitefield right now. May I know your budget range so I can shortlist the right ones?',
      time: '12:40 PM',
    },
  },
  { at: 32, msg: { id: '3', sender: 'customer', text: 'Around 1.5 to 1.8 crore.', time: '12:41 PM' } },
  {
    at: 48,
    msg: {
      id: '4',
      sender: 'bot',
      text: 'Two of them fit that range. Could I take your name and number so I can send the floor plans and arrange a site visit?',
      time: '12:41 PM',
    },
  },
  { at: 66, msg: { id: '5', sender: 'customer', text: 'Rahul Sharma, 98765 43210', time: '12:42 PM' } },
  {
    at: 82,
    msg: {
      id: '6',
      sender: 'bot',
      text: 'Thanks Rahul. Saved — the floor plans are on their way to your WhatsApp, and I can hold a site visit slot for Saturday 11 AM if that works.',
      time: '12:42 PM',
    },
  },
]

// Fields fill in as the conversation reveals them, mirroring what the chat
// service actually extracts into a Lead record. No invented metrics here --
// the panel shows the captured lead, which is the thing the product does.
const CAPTURED_FIELDS: { at: number; label: string; value: string }[] = [
  { at: 14, label: 'Interest', value: '3BHK · Whitefield' },
  { at: 32, label: 'Budget', value: '₹1.5–1.8 Cr' },
  { at: 66, label: 'Name', value: 'Rahul Sharma' },
  { at: 66, label: 'Phone', value: '+91 98765 43210' },
]

const SYNCED_AT = 82

export default function DemoModal({ isOpen, onClose }: DemoModalProps) {
  const [isPlaying, setIsPlaying] = useState(true)
  const [progress, setProgress] = useState(0)
  const [scenario, setScenario] = useState<Scenario>('chat')
  const transcriptRef = useRef<HTMLDivElement>(null)

  const messages = useMemo(() => SCRIPT.filter((item) => item.at <= progress).map((item) => item.msg), [progress])
  const captured = useMemo(() => CAPTURED_FIELDS.filter((field) => field.at <= progress), [progress])
  const isSynced = progress >= SYNCED_AT

  useEffect(() => {
    if (!isOpen) return
    setIsPlaying(true)
    setProgress(0)
    setScenario('chat')
  }, [isOpen])

  useEffect(() => {
    if (!isPlaying || !isOpen || scenario !== 'chat') return
    const interval = setInterval(() => {
      setProgress((prev) => (prev >= 100 ? 0 : prev + 1))
    }, 150)
    return () => clearInterval(interval)
  }, [isPlaying, isOpen, scenario])

  // The transcript is a fixed-height scroll area, so without this the later
  // messages render below the fold and the viewer only ever sees the opening
  // exchange while the captured-lead panel races ahead of it.
  useEffect(() => {
    const el = transcriptRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  function handleReplay() {
    setProgress(0)
    setIsPlaying(true)
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-on-background/50 backdrop-blur-md"
            id="demo-backdrop"
          />

          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="relative w-full max-w-4xl bg-inverse-surface rounded-2xl shadow-2xl border border-outline/20 overflow-hidden z-10"
            id="demo-modal-content"
          >
            <div className="flex items-center justify-between px-6 py-4 bg-on-background/80 border-b border-outline/10 text-white">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                {/* CSS-uppercased, so "Vyostra" avoids the doubled-A "VYOSTRAAI". */}
                <span className="font-bold text-sm uppercase tracking-wider text-outline-variant">Vyostra Interactive Demo</span>
              </div>
              <button
                onClick={onClose}
                className="text-outline-variant hover:text-white p-1 rounded-full hover:bg-outline/20 transition-colors"
                id="demo-close-btn"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid lg:grid-cols-12">
              <div className="lg:col-span-3 bg-on-background/40 p-4 border-r border-outline/10 flex flex-col gap-2">
                <p className="text-xs font-bold text-outline-variant uppercase tracking-wider mb-2">Simulated Scenarios</p>
                <button
                  onClick={() => {
                    setScenario('chat')
                    handleReplay()
                  }}
                  className={`px-3 py-2.5 rounded-lg text-left text-xs font-semibold flex items-center gap-2 transition-all ${scenario === 'chat' ? 'bg-primary text-white' : 'text-outline-variant hover:bg-outline/10'}`}
                  id="scenario-chat-btn"
                >
                  <MessageSquareCode className="w-4 h-4" /> Qualify a lead
                </button>
                <button
                  onClick={() => setScenario('journey')}
                  className={`px-3 py-2.5 rounded-lg text-left text-xs font-semibold flex items-center gap-2 transition-all ${scenario === 'journey' ? 'bg-primary text-white' : 'text-outline-variant hover:bg-outline/10'}`}
                  id="scenario-journey-btn"
                >
                  <Route className="w-4 h-4" /> Follow up on its own
                </button>

                <div className="mt-auto pt-4 border-t border-outline/10 hidden lg:block">
                  <div className="bg-primary/10 border border-primary/20 p-3 rounded-lg">
                    <p className="text-[10px] font-bold text-primary uppercase tracking-wider">
                      {isSynced ? 'Lead captured' : 'Capturing lead'}
                    </p>
                    <div className="mt-2 space-y-1.5 min-h-[76px]">
                      {captured.length === 0 ? (
                        <p className="text-[10px] text-outline-variant">Listening to the conversation…</p>
                      ) : (
                        captured.map((field) => (
                          <motion.div
                            key={field.label}
                            initial={{ opacity: 0, x: -4 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="text-[10px] leading-tight"
                          >
                            <span className="text-outline-variant">{field.label}: </span>
                            <span className="text-white font-semibold">{field.value}</span>
                          </motion.div>
                        ))
                      )}
                    </div>
                    {isSynced && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1 mt-2 pt-2 border-t border-primary/20"
                      >
                        <Check className="w-3 h-3 shrink-0" /> Saved to your CRM
                      </motion.p>
                    )}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-9 p-6 bg-on-background flex flex-col justify-between min-h-[400px]">
                {scenario === 'chat' ? (
                  <div className="flex-1 flex flex-col justify-between">
                    <div className="flex-1 border border-outline/15 rounded-xl overflow-hidden bg-surface flex flex-col">
                      <div className="bg-surface-container h-10 px-4 border-b border-outline-variant/30 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                            <Bot className="w-3 h-3" />
                          </span>
                          <span className="text-xs font-bold text-on-surface">Site visit assistant</span>
                        </div>
                        <span className="text-[10px] font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">ACTIVE</span>
                      </div>

                      <div ref={transcriptRef} className="flex-1 p-4 space-y-3 overflow-y-auto max-h-[220px]">
                        {messages.map((m) => (
                          <motion.div
                            key={m.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`flex ${m.sender === 'customer' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[80%] rounded-xl px-3 py-2 text-xs ${m.sender === 'customer' ? 'bg-primary text-white rounded-tr-none' : 'bg-surface-container text-on-surface rounded-tl-none border border-outline-variant/30'}`}
                            >
                              <p className="leading-relaxed">{m.text}</p>
                              <span
                                className={`text-[9px] block text-right mt-1 ${m.sender === 'customer' ? 'text-white/70' : 'text-on-surface-variant'}`}
                              >
                                {m.time}
                              </span>
                            </div>
                          </motion.div>
                        ))}
                      </div>

                      <div className="border-t border-outline-variant/30 p-3 bg-surface-container-lowest flex gap-2">
                        <div className="flex-1 bg-surface-container-low rounded-lg px-3 py-1.5 text-xs text-outline flex items-center justify-between">
                          <span>Typing response...</span>
                          <span className="flex gap-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-outline animate-bounce" />
                            <span className="w-1.5 h-1.5 rounded-full bg-outline animate-bounce delay-100" />
                            <span className="w-1.5 h-1.5 rounded-full bg-outline animate-bounce delay-200" />
                          </span>
                        </div>
                        <button className="bg-primary text-white p-2 rounded-lg" disabled>
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col justify-center items-center text-center px-4">
                    <div className="p-4 bg-secondary/10 border border-secondary/20 rounded-full text-secondary mb-4">
                      <Route className="w-10 h-10" />
                    </div>
                    <h4 className="text-lg font-bold text-white">It keeps going after the capture</h4>
                    <p className="text-xs text-outline-variant mt-2 max-w-sm leading-relaxed">
                      Once a lead is captured, a journey takes over on WhatsApp — it asks what they are looking for, waits
                      for the actual reply, nudges once if they go quiet, and hands to your team instead of following up
                      forever. Reply &ldquo;STOP&rdquo; and it ends there.
                    </p>
                    <button
                      onClick={() => {
                        setScenario('chat')
                        handleReplay()
                      }}
                      className="mt-6 px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 transition-all"
                      id="view-active-chat-btn"
                    >
                      Watch the agent qualify a lead
                    </button>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-outline/10 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setIsPlaying(!isPlaying)}
                      disabled={scenario !== 'chat'}
                      className="p-1.5 text-outline-variant hover:text-white rounded-lg hover:bg-outline/10 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
                      aria-label={isPlaying ? 'Pause' : 'Play'}
                      id="play-pause-video-btn"
                    >
                      {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                    </button>
                    <button
                      onClick={handleReplay}
                      disabled={scenario !== 'chat'}
                      className="p-1.5 text-outline-variant hover:text-white rounded-lg hover:bg-outline/10 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
                      aria-label="Replay"
                      id="replay-video-btn"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex-1 relative">
                    <div className="h-1.5 bg-outline/20 rounded-full overflow-hidden">
                      <div
                        className="h-full cta-accent transition-all duration-150"
                        style={{ width: `${scenario === 'chat' ? progress : 0}%` }}
                      />
                    </div>
                  </div>

                  <span className="hidden sm:inline text-xs text-outline-variant shrink-0">Simulated, not a recording</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
