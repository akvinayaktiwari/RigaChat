import { ArrowRight } from 'lucide-react'

interface CTASectionProps {
  onStartTrial: () => void
}

export default function CTASection({ onStartTrial }: CTASectionProps) {
  return (
    <section id="pricing" className="py-24 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="relative bg-linear-to-br from-violet-600 via-purple-600 to-indigo-600 rounded-3xl px-8 py-16 text-center overflow-hidden shadow-2xl shadow-violet-300/40">
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
            <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-purple-400/20 rounded-full blur-3xl" />
          </div>

          <div className="relative">
            <span className="inline-flex items-center gap-1.5 bg-white/15 border border-white/20 text-white text-xs font-semibold px-3.5 py-1.5 rounded-full mb-6">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full inline-block" />
              14-day free trial · No credit card
            </span>

            <h2
              className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight mb-5"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              Your AI agent is <br className="hidden sm:block" />
              3 minutes away.
            </h2>

            <p className="text-white/70 text-lg max-w-md mx-auto mb-9">
              Join 500+ businesses automating conversations with VyostraAI. Start free, upgrade when you scale.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                onClick={onStartTrial}
                className="inline-flex items-center justify-center gap-2 bg-white text-violet-700 font-bold px-7 py-4 rounded-xl hover:bg-gray-50 transition-colors shadow-lg text-sm"
              >
                Start free trial
                <ArrowRight className="w-4 h-4" />
              </button>
              <a
                href="mailto:admin@drsyeta.in"
                className="inline-flex items-center justify-center gap-2 bg-white/10 border border-white/20 text-white font-semibold px-7 py-4 rounded-xl hover:bg-white/20 transition-colors text-sm"
              >
                Talk to sales
              </a>
            </div>

            <p className="mt-6 text-white/50 text-xs">Plans from ₹1,999/mo · Cancel anytime</p>
          </div>
        </div>
      </div>
    </section>
  )
}
