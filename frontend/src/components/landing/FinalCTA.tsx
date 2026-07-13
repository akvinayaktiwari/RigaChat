import { useNavigate } from 'react-router-dom'
import { Sparkles, MessageSquare, Bot, Users, RefreshCw, FileText, BarChart2 } from 'lucide-react'

export default function FinalCTA() {
  const navigate = useNavigate()

  const integrationIcons = [
    { Icon: MessageSquare, label: 'WhatsApp' },
    { Icon: Bot, label: 'AI Agent' },
    { Icon: Users, label: 'Lead CRM' },
    { Icon: RefreshCw, label: 'Zoho Sync' },
    { Icon: FileText, label: 'Forms' },
    { Icon: BarChart2, label: 'Reports' },
  ]

  return (
    <section className="py-24 bg-inverse-surface text-inverse-on-surface relative overflow-hidden" id="cta">
      {/* Decorative radial gradients */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(circle_at_center,_var(--color-primary)_0%,_transparent_60%)]" />
      </div>

      <div className="max-w-5xl mx-auto px-6 lg:px-8 text-center relative z-10 flex flex-col items-center">
        {/* Sparkle badge */}
        <div className="inline-flex items-center gap-1.5 bg-white/10 text-white/90 border border-white/20 px-3.5 py-1.5 rounded-full mb-6">
          <Sparkles className="w-3.5 h-3.5 text-yellow-300 fill-yellow-300 animate-spin-slow" />
          <span className="text-[10px] font-bold uppercase tracking-wider">AI Agent + WhatsApp + CRM</span>
        </div>

        {/* Heading */}
        <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-4 max-w-3xl leading-tight">
          Never miss a lead. Ever.
        </h2>

        {/* Subtext */}
        <p className="text-lg text-inverse-on-surface/80 mb-8 max-w-xl">
          BeepBoop captures leads 24/7 with AI, alerts you instantly on WhatsApp, and syncs everything to your CRM
          automatically.
        </p>

        {/* Action button */}
        <div className="flex flex-col items-center gap-5">
          <button
            onClick={() => navigate('/signup')}
            className="cta-accent text-white font-extrabold text-lg md:text-xl px-12 py-5.5 rounded-2xl transition-all duration-300 hover:scale-[1.04] hover:shadow-[0_0_50px_rgba(99,102,241,0.45)] cursor-pointer"
            id="cta-signup-btn"
          >
            Get started free
          </button>

          {/* Bullet proofs */}
          <div className="flex items-center gap-4 text-outline-variant font-semibold text-xs uppercase tracking-widest mt-2">
            <span>Free to start</span>
            <span className="w-1.5 h-1.5 bg-outline-variant rounded-full" />
            <span>No credit card required</span>
          </div>
        </div>

        {/* Integration micro icons */}
        <div className="mt-20 flex flex-wrap justify-center gap-8 md:gap-10">
          {integrationIcons.map((item, index) => (
            <div
              key={index}
              className="flex flex-col items-center gap-2 opacity-30 hover:opacity-100 transition-opacity duration-300"
              title={item.label}
            >
              <item.Icon className="w-8 h-8 text-white stroke-[1.5]" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-outline-variant select-none hidden md:block">
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
