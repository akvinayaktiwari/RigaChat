import { Check, Loader2, LogOut, Plus, Share2 } from 'lucide-react'

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

export default function IntegrationsSection({ zohoStatus, onConnectZoho, onDisconnectZoho }: IntegrationsSectionProps) {
  const cards: CardDef[] = [
    {
      id: 'zoho',
      name: 'Zoho CRM',
      description: 'Sync leads automatically',
      status: zohoStatus,
      onClick: () => (zohoStatus === 'connected' ? onDisconnectZoho() : onConnectZoho()),
    },
    {
      id: 'hubspot',
      name: 'HubSpot',
      description: 'Sync leads automatically',
      status: 'coming-soon',
    },
    {
      id: 'salesforce',
      name: 'Salesforce',
      description: 'Sync leads automatically',
      status: 'coming-soon',
    },
  ]

  return (
    <div className="bg-white rounded-2xl border border-outline-variant p-6 md:p-8 hover:shadow-md transition-all duration-300 h-full">
      <div className="flex items-center gap-3 border-b border-outline-variant pb-4 mb-6">
        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
          <Share2 className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-base font-bold text-on-surface">Integrations</h4>
          <p className="text-[11px] text-on-surface-variant font-medium">Link your bots directly to leading CRMs.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
        {cards.map((card) => {
          const isConnected = card.status === 'connected'
          const isLoading = card.status === 'loading'
          const isComingSoon = card.status === 'coming-soon'
          return (
            <button
              key={card.id}
              type="button"
              onClick={card.onClick}
              disabled={isLoading || isComingSoon}
              className={`h-full p-4 rounded-xl border border-outline-variant bg-white flex items-center justify-between gap-3 group transition-all duration-200 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                isLoading ? 'pointer-events-none' : ''
              } ${isComingSoon ? 'opacity-60 cursor-not-allowed' : ''} ${
                isConnected ? 'bg-surface-container-low border-primary/20 hover:border-primary' : 'hover:border-primary/40'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 shrink-0 bg-white border border-outline-variant rounded-xl flex items-center justify-center text-on-surface-variant font-bold text-sm">
                  {card.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-on-surface group-hover:text-primary transition-colors">
                    {card.name}
                  </p>
                  <p className="text-[10px] text-on-surface-variant mt-0.5 truncate">{card.description}</p>
                </div>
              </div>

              <div className="shrink-0">
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-on-surface-variant" />
                ) : isComingSoon ? (
                  <span className="inline-flex items-center text-[9px] font-bold text-on-surface-variant bg-surface-container-low border border-outline-variant px-2.5 py-1 rounded-md uppercase tracking-wide">
                    Coming Soon
                  </span>
                ) : isConnected ? (
                  <span className="inline-flex items-center gap-1 text-[9px] font-extrabold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100 uppercase tracking-wider group-hover:bg-rose-50 group-hover:text-rose-600 group-hover:border-rose-100 transition-colors">
                    <Check className="w-2.5 h-2.5 shrink-0 group-hover:hidden" />
                    <span className="group-hover:hidden">Active</span>
                    <span className="hidden group-hover:inline-flex items-center gap-1">
                      <LogOut className="w-2.5 h-2.5" /> Disable
                    </span>
                  </span>
                ) : (
                  <span className="inline-flex items-center text-[9px] font-bold text-on-surface-variant bg-surface-container-low border border-outline-variant px-2.5 py-1 rounded-md uppercase tracking-wide group-hover:bg-primary group-hover:text-on-primary group-hover:border-primary transition-colors">
                    Connect
                  </span>
                )}
              </div>
            </button>
          )
        })}

        <div className="h-full p-4 rounded-xl border-2 border-dashed border-outline-variant bg-white opacity-60 cursor-not-allowed flex flex-col items-center justify-center gap-2 text-center">
          <div className="w-11 h-11 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant">
            <Plus className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-bold text-on-surface-variant">Explore More Integrations</p>
            <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wide mt-1">Coming Soon</p>
          </div>
        </div>
      </div>
    </div>
  )
}
