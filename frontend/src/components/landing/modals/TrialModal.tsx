import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { X, ArrowRight, Sparkles, Zap, Database } from 'lucide-react'

interface TrialModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function TrialModal({ isOpen, onClose }: TrialModalProps) {
  const navigate = useNavigate()

  const handleGetStarted = () => {
    onClose()
    navigate('/login')
  }

  const highlights = [
    { Icon: Zap, text: 'Live in under 5 minutes, no code required' },
    { Icon: Database, text: 'Leads sync straight into your built-in CRM' },
    { Icon: Sparkles, text: '14-day free trial, no credit card required' },
  ]

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-on-background/40 backdrop-blur-md"
            id="trial-modal-backdrop"
          />

          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: 'spring', duration: 0.5 }}
            className="relative w-full max-w-md overflow-hidden rounded-2xl bg-surface-container-lowest shadow-2xl border border-outline-variant/30 z-10"
            id="trial-modal-content"
          >
            <div className="h-1.5 cta-accent w-full" />

            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-on-surface-variant hover:text-on-surface p-1.5 rounded-full hover:bg-surface-container transition-colors"
              aria-label="Close modal"
              id="close-trial-modal-btn"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="p-8 text-center">
              <div className="w-14 h-14 rounded-2xl cta-accent flex items-center justify-center text-white font-extrabold text-xl mx-auto mb-6">
                B
              </div>

              <h3 className="text-2xl font-extrabold tracking-tight text-on-background">Start your free trial</h3>
              <p className="text-on-surface-variant text-sm mt-2">
                Set up your BeepBoop workspace and start turning visitors into leads today.
              </p>

              <ul className="mt-6 space-y-3 text-left">
                {highlights.map(({ Icon, text }) => (
                  <li key={text} className="flex items-start gap-3 text-sm text-on-surface">
                    <Icon className="w-4.5 h-4.5 text-primary mt-0.5 shrink-0" />
                    {text}
                  </li>
                ))}
              </ul>

              <button
                onClick={handleGetStarted}
                className="w-full mt-8 py-4 rounded-xl cta-accent text-white font-semibold flex items-center justify-center gap-2 hover:opacity-95 transition-all shadow-md hover:shadow-lg"
                id="trial-modal-cta-btn"
              >
                Go to BeepBoop <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
