import { Database, Zap, BarChart3, MessageSquare, Globe, Shield, Mic, type LucideIcon } from 'lucide-react'

interface BentoFeature {
  icon: LucideIcon
  title: string
  description: string
  gradient: string
  accentColor: string
  iconBg: string
  large: boolean
}

const BENTO_FEATURES: BentoFeature[] = [
  {
    icon: Database,
    title: 'Train on your knowledge base',
    description: 'Upload docs, URLs, or paste text. Your agent absorbs everything about your business in minutes.',
    gradient: 'from-violet-50 via-purple-50 to-white',
    accentColor: 'text-violet-600',
    iconBg: 'bg-violet-100',
    large: true,
  },
  {
    icon: Zap,
    title: 'Live in 3 minutes',
    description: 'Embed with one line of code. No engineering sprints, no contracts.',
    gradient: 'from-amber-50 to-orange-50',
    accentColor: 'text-amber-600',
    iconBg: 'bg-amber-100',
    large: false,
  },
  {
    icon: BarChart3,
    title: 'Built-in CRM',
    description: 'Every lead lands directly in your CRM. No Zapier. No third-party integrations.',
    gradient: 'from-sky-50 to-blue-50',
    accentColor: 'text-sky-600',
    iconBg: 'bg-sky-100',
    large: false,
  },
  {
    icon: Mic,
    title: 'AI Voice Agent (on page)',
    description:
      'Visitors can talk to your AI agent right on your website — no app, no phone call. Same knowledge base, same CRM sync, now with a voice.',
    gradient: 'from-indigo-50 to-blue-50',
    accentColor: 'text-indigo-600',
    iconBg: 'bg-indigo-100',
    large: false,
  },
  {
    icon: MessageSquare,
    title: 'WhatsApp notifications',
    description: 'Get instant WhatsApp alerts when a new lead is captured. Never miss a hot lead again.',
    gradient: 'from-emerald-50 via-teal-50 to-white',
    accentColor: 'text-emerald-600',
    iconBg: 'bg-emerald-100',
    large: true,
  },
  {
    icon: Globe,
    title: 'Multi-language widget',
    description: "Auto-detect and reply in your customer's native language.",
    gradient: 'from-pink-50 to-rose-50',
    accentColor: 'text-rose-500',
    iconBg: 'bg-rose-100',
    large: false,
  },
  {
    icon: Shield,
    title: 'Embeddable lead forms',
    description: 'Custom embeddable forms that sync leads directly to your CRM.',
    gradient: 'from-slate-50 to-gray-50',
    accentColor: 'text-slate-600',
    iconBg: 'bg-slate-100',
    large: false,
  },
]

export default function FeaturesSection() {
  return (
    <section id="features" className="py-24 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-sm font-semibold text-violet-600 uppercase tracking-widest mb-3">Features</p>
          <h2
            className="text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight mb-4"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            Everything to automate <br className="hidden sm:block" />
            your customer conversations
          </h2>
          <p className="text-gray-500 text-lg max-w-xl mx-auto">
            From knowledge ingestion to CRM sync — all the pieces your AI agent needs, assembled and ready.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {BENTO_FEATURES.map((feature) => {
            const Icon = feature.icon
            return (
              <div
                key={feature.title}
                className={`relative group bg-linear-to-br ${feature.gradient} border border-black/5 rounded-2xl p-6 hover:shadow-lg hover:shadow-black/6 transition-all duration-300 ${feature.large ? 'lg:col-span-2 min-h-44' : 'min-h-36'}`}
              >
                <div
                  className={`w-10 h-10 ${feature.iconBg} rounded-xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform`}
                >
                  <Icon className={`w-5 h-5 ${feature.accentColor}`} />
                </div>
                <h3
                  className="font-bold text-gray-900 text-lg mb-2"
                  style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                >
                  {feature.title}
                </h3>
                <p className="text-gray-500 text-sm leading-relaxed">{feature.description}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
