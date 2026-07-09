import { useNavigate } from 'react-router-dom'
import { Sparkles, ShoppingCart, Mail, Workflow, Cpu, Database, Network } from 'lucide-react'

export default function FinalCTA() {
  const navigate = useNavigate()

  const integrationIcons = [
    { Icon: Network, label: 'API Integrations' },
    { Icon: ShoppingCart, label: 'E-Commerce (Shopify)' },
    { Icon: Mail, label: 'Email Marketing' },
    { Icon: Workflow, label: 'Automations' },
    { Icon: Cpu, label: 'AI Processors' },
    { Icon: Database, label: 'Data Warehouse' },
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
          <span className="text-[10px] font-bold uppercase tracking-wider">Start Growing Instantly</span>
        </div>

        {/* Heading */}
        <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-4 max-w-3xl leading-tight">
          Start capturing leads today.
        </h2>

        {/* Subtext */}
        <p className="text-lg text-inverse-on-surface/80 mb-8 max-w-xl">
          Set up your AI chatbot in under 5 minutes. No code required.
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
            <span>Free 14-day trial</span>
            <span className="w-1.5 h-1.5 bg-outline-variant rounded-full" />
            <span>No credit card required</span>
          </div>
        </div>

        {/* Integration micro icons */}
        <div className="mt-20 flex flex-wrap justify-center gap-8 md:gap-10 opacity-30 hover:opacity-100 transition-opacity duration-500">
          {integrationIcons.map((item, index) => (
            <div key={index} className="flex flex-col items-center gap-2" title={item.label}>
              <item.Icon className="w-8 h-8 text-white stroke-[1.5]" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-outline-variant select-none hidden md:block">
                {item.label.split(' ')[0]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
