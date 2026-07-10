import { Check, Flame } from 'lucide-react'

type PlanId = 'starter' | 'growth' | 'agency'

interface Plan {
  id: PlanId
  name: string
  price: string
  popular?: boolean
  features: string[]
}

const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: '₹1,999/mo',
    features: ['5 Active Bots', '1,000 Monthly Leads', 'Standard Analytics'],
  },
  {
    id: 'growth',
    name: 'Growth',
    price: '₹5,499/mo',
    popular: true,
    features: ['25 Active Bots', '10,000 Monthly Leads', 'Advanced ROI Insights', 'Multi-user Collaboration'],
  },
  {
    id: 'agency',
    name: 'Agency',
    price: '₹14,999/mo',
    features: ['Unlimited Bots', 'Unlimited Leads', 'Custom API Endpoints', 'White-label Reports'],
  },
]

interface SubscriptionSectionProps {
  currentPlan: PlanId
  onSelectPlan: (planId: string) => void
}

export default function SubscriptionSection({ currentPlan, onSelectPlan }: SubscriptionSectionProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h3 className="text-xl md:text-2xl font-bold text-on-surface tracking-tight">Subscription Plans</h3>
          <p className="text-sm text-on-surface-variant mt-1">Scale your AI CRM operations with the right power plan.</p>
        </div>
        <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-xl border border-outline-variant">
          <span className="text-[10px] font-bold text-primary bg-white px-3 py-1.5 rounded-lg shadow-sm">Monthly</span>
          <span className="text-[10px] font-bold text-on-surface-variant px-3 py-1.5 cursor-not-allowed">
            Annual (Save 20%)
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan
          return (
            <div
              key={plan.id}
              className={`relative bg-white rounded-2xl p-6 md:p-8 flex flex-col justify-between transition-all duration-300 border ${
                plan.popular
                  ? 'border-primary ring-2 ring-primary/20 shadow-lg scale-[1.01] md:scale-[1.03] z-10'
                  : 'border-outline-variant hover:shadow-md'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-primary text-on-primary text-[9px] font-extrabold uppercase tracking-widest rounded-full shadow-md flex items-center gap-1.5">
                  <Flame className="w-3 h-3 fill-amber-300 text-amber-300" />
                  Most Popular
                </div>
              )}

              <div className="mb-6">
                <h4 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider">{plan.name}</h4>
                <div className="flex items-baseline gap-1 mt-3">
                  <span className="text-3xl md:text-4xl font-extrabold text-on-surface">{plan.price}</span>
                </div>
              </div>

              <ul className="space-y-3.5 mb-8 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-xs text-on-surface-variant">
                    <div className="w-4.5 h-4.5 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-primary" strokeWidth={3} />
                    </div>
                    <span className="leading-normal">{feature}</span>
                  </li>
                ))}
              </ul>

              {isCurrent ? (
                <button
                  type="button"
                  disabled
                  className="w-full py-3 bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold text-xs rounded-xl cursor-default text-center"
                >
                  Current Active Plan
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelectPlan(plan.id)}
                  className={`w-full py-3 font-bold text-xs rounded-xl transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                    plan.popular
                      ? 'bg-primary hover:bg-primary-container text-on-primary shadow-md hover:scale-[1.02]'
                      : 'border border-primary text-primary hover:bg-primary/5 hover:scale-[1.01]'
                  }`}
                >
                  {plan.id === 'agency' ? 'Contact Sales' : 'Upgrade Plan'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
