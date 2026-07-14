import { useNavigate } from 'react-router-dom'
import { ArrowRight, ChevronRight, Star } from 'lucide-react'
import ChatWidget from './ChatWidget'

interface HeroSectionProps {
  onOpenDemo: () => void
}

const AVATARS = [
  { gradient: 'from-violet-500 to-purple-600', initial: 'V' },
  { gradient: 'from-amber-400 to-orange-500', initial: 'A' },
  { gradient: 'from-emerald-400 to-teal-500', initial: 'S' },
  { gradient: 'from-sky-400 to-blue-500', initial: 'M' },
]

export default function HeroSection({ onOpenDemo }: HeroSectionProps) {
  const navigate = useNavigate()

  return (
    <section className="relative flex items-center pt-28 pb-16 px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-32 left-1/4 w-96 h-96 bg-violet-200/30 rounded-full blur-3xl" />
        <div className="absolute top-48 right-1/4 w-80 h-80 bg-pink-200/25 rounded-full blur-3xl" />
        <div className="absolute bottom-32 left-1/3 w-64 h-64 bg-sky-200/20 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
        <div>
          <div className="inline-flex items-center gap-2 bg-violet-50 border border-violet-100 text-violet-700 text-xs font-semibold px-3.5 py-1.5 rounded-full mb-6">
            <span className="w-1.5 h-1.5 bg-violet-500 rounded-full inline-block animate-pulse" />
            Now with WhatsApp Business API
            <ChevronRight className="w-3.5 h-3.5" />
          </div>

          <h1
            className="text-5xl sm:text-6xl font-extrabold text-gray-900 leading-[1.1] tracking-tight mb-6"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            Deploy AI chatbots your customers{' '}
            <span className="bg-linear-to-r from-violet-600 to-purple-500 bg-clip-text text-transparent">
              love to talk to.
            </span>
          </h1>

          <p className="text-lg text-gray-500 leading-relaxed mb-8 max-w-lg">
            Train on your website content, capture leads automatically, and sync to your CRM — all in one platform.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 mb-10">
            <button
              onClick={() => navigate('/signup')}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-white font-semibold bg-linear-to-r from-violet-600 to-purple-500 px-6 py-3.5 rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-violet-200/70 text-sm"
            >
              Start free — no card needed
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={onOpenDemo}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-gray-700 font-semibold bg-white border border-gray-200 px-6 py-3.5 rounded-xl hover:bg-gray-50 transition-colors text-sm shadow-sm"
            >
              Watch 2-min demo
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {AVATARS.map((avatar) => (
                <div
                  key={avatar.initial}
                  className={`w-8 h-8 rounded-full bg-linear-to-br ${avatar.gradient} border-2 border-white flex items-center justify-center text-white text-xs font-bold`}
                >
                  {avatar.initial}
                </div>
              ))}
            </div>
            <div>
              <div className="flex gap-0.5 mb-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-xs text-gray-500">
                Loved by <span className="text-gray-800 font-semibold">500+ businesses</span>
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-center lg:justify-end mt-8 lg:mt-0">
          <ChatWidget />
        </div>
      </div>
    </section>
  )
}
