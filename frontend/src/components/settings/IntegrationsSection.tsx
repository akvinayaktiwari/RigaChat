import { Loader2, Share2 } from 'lucide-react'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

interface IntegrationsSectionProps {
  zohoStatus: 'connected' | 'disconnected' | 'loading'
  onConnectZoho: () => void
  onDisconnectZoho: () => void
}

interface CardDef {
  id: string
  name: string
  description: string
  status: 'connected' | 'disconnected' | 'loading' | 'coming-soon'
  onClick?: () => void
}

const STATUS_BADGES: Record<CardDef['status'], { label: string; classes: string }> = {
  connected: { label: 'Connected', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  disconnected: { label: 'Not connected', classes: 'bg-gray-100 text-gray-500 border-gray-200' },
  loading: { label: 'Loading', classes: 'bg-gray-100 text-gray-500 border-gray-200' },
  'coming-soon': { label: 'Coming Soon', classes: 'bg-gray-100 text-gray-500 border-gray-200' },
}

export default function IntegrationsSection({ zohoStatus, onConnectZoho, onDisconnectZoho }: IntegrationsSectionProps) {
  const cards: CardDef[] = [
    {
      id: 'zoho',
      name: 'Zoho CRM',
      description: 'Sync leads automatically',
      status: zohoStatus,
      onClick: () => (zohoStatus === 'connected' ? onDisconnectZoho() : onConnectZoho()),
    },
    { id: 'hubspot', name: 'HubSpot', description: 'Sync leads automatically', status: 'coming-soon' },
    { id: 'salesforce', name: 'Salesforce', description: 'Sync leads automatically', status: 'coming-soon' },
  ]

  return (
    <div className="bg-white rounded-2xl border border-black/5 p-6 shadow-sm h-full">
      <div className="flex items-center gap-3 border-b border-gray-50 pb-4 mb-6">
        <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center text-violet-600 shrink-0">
          <Share2 className="w-5 h-5" />
        </div>
        <div>
          <h4 className="font-bold text-lg text-gray-900" style={JAKARTA_FONT}>
            Integrations
          </h4>
          <p className="text-xs text-gray-500">Link your bots directly to leading CRMs.</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {cards.map((card) => {
          const isConnected = card.status === 'connected'
          const isLoading = card.status === 'loading'
          const isComingSoon = card.status === 'coming-soon'
          const badge = STATUS_BADGES[card.status]

          return (
            <div key={card.id} className="flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-gray-50/50">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-500 font-semibold text-sm shrink-0">
                  {card.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">{card.name}</p>
                  <span className={`inline-flex mt-0.5 border text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.classes}`}>
                    {isLoading ? 'Loading…' : badge.label}
                  </span>
                </div>
              </div>

              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-gray-400 shrink-0" />
              ) : isComingSoon ? (
                <span className="text-xs text-gray-400 shrink-0">Coming Soon</span>
              ) : isConnected ? (
                <button
                  type="button"
                  onClick={card.onClick}
                  className="text-red-600 font-medium px-3 py-2 rounded-xl text-sm hover:bg-red-50 transition-colors shrink-0"
                >
                  Disconnect
                </button>
              ) : (
                <button
                  type="button"
                  onClick={card.onClick}
                  className="inline-flex items-center gap-2 bg-linear-to-r from-violet-600 to-purple-500 text-white font-semibold px-3 py-2 rounded-xl text-sm shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity shrink-0"
                >
                  Connect
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
