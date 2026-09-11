import type { ComponentType } from 'react'
import { CheckCircle, PhoneCall } from 'lucide-react'
import { WhatsAppIcon, MetaIcon, ZohoIcon, HubSpotIcon, SalesforceIcon } from './BrandIcons'
import { Reveal, RevealGroup, RevealItem } from './motion-primitives'

interface Integration {
  name: string
  icon: ComponentType<{ className?: string }>
  border: string
  iconColor: string
  iconBg: string
  bg: string
  perks: string[]
  status: 'live' | 'soon'
}

const INTEGRATIONS: Integration[] = [
  {
    name: 'WhatsApp',
    icon: WhatsAppIcon,
    border: 'border-green-100',
    iconColor: 'text-green-600',
    iconBg: 'bg-green-100',
    bg: 'from-green-50 to-emerald-50',
    perks: ['Lead notifications', 'Rich media support', 'Two-way AI conversations'],
    status: 'live',
  },
  {
    name: 'Meta Lead Ads',
    icon: MetaIcon,
    border: 'border-blue-100',
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-100',
    bg: 'from-blue-50 to-indigo-50',
    perks: ['Every approved Page, not just one', 'Instant lead delivery', 'Per-Page connect and disconnect'],
    status: 'live',
  },
  {
    name: 'Zoho CRM',
    icon: ZohoIcon,
    border: 'border-red-100',
    iconColor: 'text-red-600',
    iconBg: 'bg-red-100',
    bg: 'from-red-50 to-rose-50',
    perks: ['Lead capture', 'Activity logging', 'Custom field mapping'],
    status: 'live',
  },
  {
    name: 'HubSpot',
    icon: HubSpotIcon,
    border: 'border-orange-100',
    iconColor: 'text-orange-500',
    iconBg: 'bg-orange-100',
    bg: 'from-orange-50 to-amber-50',
    perks: ['Auto contact creation', 'Deal pipeline sync', 'Workflow triggers'],
    status: 'soon',
  },
  {
    name: 'Salesforce',
    icon: SalesforceIcon,
    border: 'border-sky-100',
    iconColor: 'text-sky-600',
    iconBg: 'bg-sky-100',
    bg: 'from-sky-50 to-blue-50',
    perks: ['Real-time sync', 'Custom object support', 'Flow builder integration'],
    status: 'soon',
  },
  {
    // 'soon', deliberately. The transport is built and tested, but no phone
    // number is connected yet, so nothing on this card can be used today.
    // Marking it live would be a claim the product cannot honour the moment
    // someone dials.
    name: 'Phone calls',
    icon: PhoneCall,
    border: 'border-violet-100',
    iconColor: 'text-violet-600',
    iconBg: 'bg-violet-100',
    bg: 'from-violet-50 to-purple-50',
    perks: ['Your agent answers the call', 'Every call written into the CRM', 'Puts the caller through to a person'],
    status: 'soon',
  },
]

function StatusBadge({ status }: { status: 'live' | 'soon' }) {
  if (status === 'live') {
    return (
      <span className="absolute top-4 right-4 bg-green-50 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full border border-green-200">
        Live
      </span>
    )
  }
  return (
    <span className="absolute top-4 right-4 bg-gray-100 text-gray-500 text-xs font-medium px-2 py-0.5 rounded-full">
      Coming soon
    </span>
  )
}

export default function IntegrationsSection() {
  return (
    <section id="integrations" className="py-24 px-4 bg-gray-50/60">
      <div className="max-w-6xl mx-auto">
        <Reveal className="text-center mb-14">
          <p className="text-sm font-semibold text-violet-600 uppercase tracking-widest mb-3">Integrations</p>
          <h2
            className="text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight mb-4"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            Plugs into your <br className="hidden sm:block" />
            existing stack
          </h2>
          {/* Covers both halves of this list now. "One OAuth click" described
              the CRMs and was never true of a phone call. */}
          <p className="text-gray-500 text-lg max-w-xl mx-auto">
            Every channel your leads arrive on, and every tool they need to reach.
          </p>
        </Reveal>

        <RevealGroup className="grid grid-cols-1 sm:grid-cols-2 gap-5" stagger={0.08}>
          {INTEGRATIONS.map((integration) => {
            const Icon = integration.icon
            return (
              <RevealItem
                key={integration.name}
                className={`edge-glow relative group bg-white border ${integration.border} rounded-2xl p-7 hover:shadow-xl hover:shadow-black/6 hover:-translate-y-0.5 transition-all duration-300 overflow-hidden`}
              >
                <div className={`absolute inset-0 bg-linear-to-br ${integration.bg} opacity-40 rounded-2xl`} />
                <StatusBadge status={integration.status} />

                <div className="relative">
                  <div
                    className={`w-12 h-12 ${integration.iconBg} rounded-xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform`}
                  >
                    <Icon className={`w-6 h-6 ${integration.iconColor}`} />
                  </div>
                  <h3
                    className="font-bold text-gray-900 text-xl mb-3"
                    style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                  >
                    {integration.name}
                  </h3>
                  <ul className="space-y-2">
                    {integration.perks.map((perk) => (
                      <li key={perk} className="flex items-center gap-2.5 text-sm text-gray-600">
                        <CheckCircle className={`w-4 h-4 shrink-0 ${integration.iconColor}`} />
                        {perk}
                      </li>
                    ))}
                  </ul>
                </div>
              </RevealItem>
            )
          })}
        </RevealGroup>
      </div>
    </section>
  )
}
