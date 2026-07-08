import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { X, Play, Pause, RotateCcw, Sparkles, Send, Volume2, VolumeX, MessageSquareCode } from 'lucide-react'

interface DemoModalProps {
  isOpen: boolean
  onClose: () => void
}

interface ChatMessage {
  id: string
  sender: 'customer' | 'bot' | 'agent'
  text: string
  time: string
}

export default function DemoModal({ isOpen, onClose }: DemoModalProps) {
  const [isPlaying, setIsPlaying] = useState(true)
  const [isMuted, setIsMuted] = useState(false)
  const [progress, setProgress] = useState(15)
  const [activeTab, setActiveTab] = useState<'chat' | 'revenue' | 'insights'>('chat')

  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: '1', sender: 'customer', text: 'Hey! Do you have some wooden sunglasses for men?', time: '12:40 PM' },
  ])

  const script: { triggerProgress: number; msg: ChatMessage }[] = [
    {
      triggerProgress: 30,
      msg: {
        id: '2',
        sender: 'bot',
        text: 'Absolutely! 🕶️ Here are our top wooden-framed sunglasses crafted from recycled maple. They are light-weight and polarized.',
        time: '12:40 PM',
      },
    },
    {
      triggerProgress: 45,
      msg: {
        id: '3',
        sender: 'bot',
        text: '🔥 Special Offer: Buy today and get 15% off with code BEEP15. Would you like me to add them to your cart?',
        time: '12:41 PM',
      },
    },
    {
      triggerProgress: 65,
      msg: { id: '4', sender: 'customer', text: 'Yes please, add the dark walnut ones!', time: '12:41 PM' },
    },
    {
      triggerProgress: 80,
      msg: {
        id: '5',
        sender: 'bot',
        text: 'Added! 🎉 Your cart is updated. Total: $67.15 (Saved $11.85). Tap below to check out instantly via Apple Pay or Card.',
        time: '12:41 PM',
      },
    },
  ]

  useEffect(() => {
    if (!isOpen) return
    setIsPlaying(true)
    setProgress(15)
    setMessages([{ id: '1', sender: 'customer', text: 'Hey! Do you have some wooden sunglasses for men?', time: '12:40 PM' }])
  }, [isOpen])

  useEffect(() => {
    if (!isPlaying || !isOpen) return

    const interval = setInterval(() => {
      setProgress((prev) => {
        const next = prev >= 100 ? 0 : prev + 1

        if (next === 0) {
          setMessages([{ id: '1', sender: 'customer', text: 'Hey! Do you have some wooden sunglasses for men?', time: '12:40 PM' }])
        }

        const messageToInsert = script.find((item) => item.triggerProgress === next)
        if (messageToInsert) {
          setMessages((prevMsgs) => [...prevMsgs, messageToInsert.msg])
        }

        return next
      })
    }, 150)

    return () => clearInterval(interval)
  }, [isPlaying, isOpen])

  const handleReplay = () => {
    setProgress(15)
    setMessages([{ id: '1', sender: 'customer', text: 'Hey! Do you have some wooden sunglasses for men?', time: '12:40 PM' }])
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
                <span className="font-bold text-sm uppercase tracking-wider text-outline-variant">BeepBoop Live Interactive Demo</span>
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
                    setActiveTab('chat')
                    handleReplay()
                  }}
                  className={`px-3 py-2.5 rounded-lg text-left text-xs font-semibold flex items-center gap-2 transition-all ${activeTab === 'chat' ? 'bg-primary text-white' : 'text-outline-variant hover:bg-outline/10'}`}
                  id="scenario-chat-btn"
                >
                  <MessageSquareCode className="w-4 h-4" /> Proactive Sales Bot
                </button>
                <button
                  onClick={() => setActiveTab('revenue')}
                  className={`px-3 py-2.5 rounded-lg text-left text-xs font-semibold flex items-center gap-2 transition-all ${activeTab === 'revenue' ? 'bg-primary text-white' : 'text-outline-variant hover:bg-outline/10'}`}
                  id="scenario-rev-btn"
                >
                  <Sparkles className="w-4 h-4" /> Revenue Recovery
                </button>

                <div className="mt-auto pt-4 border-t border-outline/10 hidden lg:block">
                  <div className="bg-primary/10 border border-primary/20 p-3 rounded-lg">
                    <p className="text-[10px] font-bold text-primary uppercase tracking-wider">Metrics Improved</p>
                    <p className="text-lg font-extrabold text-white mt-1">+25% AOV</p>
                    <p className="text-[10px] text-outline-variant mt-0.5">Captured dynamically by BeepBoop intelligence engine.</p>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-9 p-6 bg-on-background flex flex-col justify-between min-h-[400px]">
                {activeTab === 'chat' ? (
                  <div className="flex-1 flex flex-col justify-between">
                    <div className="flex-1 border border-outline/15 rounded-xl overflow-hidden bg-surface flex flex-col">
                      <div className="bg-surface-container h-10 px-4 border-b border-outline-variant/30 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <img
                            src="https://lh3.googleusercontent.com/aida/AP1WRLvJbkQPBp6bUjUE6lptZEFzgTW8BTcIrOjd0wHKHEzYX26ORkXkvMK_b2qpo48lZzjugLXvi2dCXEO-UzwEMIK8ZyhkK3RY0J_g2S4W-XaCvSYMCwQ17zmYdpJDQ0AIbzt6fUZLXrCuR5UHXsPjiGs2DTr8EP96t02ku8zW5izgj55D09K1OUZfkeYyMdv1NYUZTd5NvDbm-WSTN7TfwQqmURgCuDCb4xKw9iFV6oma1aVPkSxkgDaYOuY"
                            alt="Rachel"
                            className="w-5 h-5 rounded-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                          <span className="text-xs font-bold text-on-surface">Rachel · BeepBoop Sales Bot</span>
                        </div>
                        <span className="text-[10px] font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">ACTIVE</span>
                      </div>

                      <div className="flex-1 p-4 space-y-3 overflow-y-auto max-h-[220px]">
                        <AnimatePresence>
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
                        </AnimatePresence>
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
                      <Sparkles className="w-10 h-10" />
                    </div>
                    <h4 className="text-lg font-bold text-white">Dynamic Revenue Recovery</h4>
                    <p className="text-xs text-outline-variant mt-2 max-w-sm">
                      BeepBoop tracks cart abandonments and automatically engages visitors before they leave the page. It can
                      offer discount triggers or real-time support, resulting in up to 30% recovery rate.
                    </p>
                    <button
                      onClick={() => setActiveTab('chat')}
                      className="mt-6 px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 transition-all"
                      id="view-active-chat-btn"
                    >
                      Watch Chat Bot In Action
                    </button>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-outline/10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setIsPlaying(!isPlaying)}
                      className="p-1.5 text-outline-variant hover:text-white rounded-lg hover:bg-outline/10 transition-colors"
                      id="play-pause-video-btn"
                    >
                      {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                    </button>
                    <button
                      onClick={handleReplay}
                      className="p-1.5 text-outline-variant hover:text-white rounded-lg hover:bg-outline/10 transition-colors"
                      id="replay-video-btn"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setIsMuted(!isMuted)}
                      className="p-1.5 text-outline-variant hover:text-white rounded-lg hover:bg-outline/10 transition-colors"
                      id="mute-video-btn"
                    >
                      {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                  </div>

                  <div className="flex-1 mx-6 relative">
                    <div className="h-1.5 bg-outline/20 rounded-full overflow-hidden">
                      <div className="h-full cta-accent transition-all duration-150" style={{ width: `${progress}%` }} />
                    </div>
                  </div>

                  <span className="text-xs font-mono text-outline-variant">
                    0:{progress < 10 ? `0${Math.floor(progress / 3)}` : Math.floor(progress / 3)} / 0:30
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
