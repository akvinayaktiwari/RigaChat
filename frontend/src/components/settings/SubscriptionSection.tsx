import { CheckCircle, Flame } from 'lucide-react'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

type PlanId = 'starter' | 'growth' | 'agency'

interface Plan {
  id: PlanId
  name: string
  price: string
  period: string
  popular?: boolean
  features: string[]
}

const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: '₹1,999',
    period: '/mo',
    features: ['5 Active Bots', '1,000 Monthly Leads', 'Standard Analytics'],
  },
  {
    id: 'growth',
    name: 'Growth',
    price: '₹5,499',
    period: '/mo',
    popular: true,
    features: ['25 Active Bots', '10,000 Monthly Leads', 'Advanced ROI Insights', 'Multi-user Collaboration'],
  },
  {
    id: 'agency',
    name: 'Agency',
    price: '₹14,999',
    period: '/mo',
    features: ['Unlimited Bots', 'Unlimited Leads', 'Custom API Endpoints', 'White-label Reports'],
  },
]

interface SubscriptionSectionProps {
  currentPlan: PlanId
  onSelectPlan: (planId: string) => void
}

export default function SubscriptionSection({ currentPlan, onSelectPlan }: SubscriptionSectionProps) {
  return (
    <div className="bg-white rounded-2xl border border-black/5 p-6 shadow-sm">
      <h3 className="font-bold text-lg text-gray-900 pb-4 border-b border-gray-50 mb-6" style={JAKARTA_FONT}>
        Subscription
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan
          return (
            <div
              key={plan.id}
              className={`relative rounded-2xl p-5 flex flex-col transition-all duration-200 border ${
                isCurrent ? 'border-2 border-violet-600 bg-violet-50' : 'border-gray-200 bg-white hover:border-violet-300'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-linear-to-r from-violet-600 to-purple-500 text-white text-[10px] font-bold uppercase tracking-wider rounded-full shadow-md flex items-center gap-1">
                  <Flame className="w-3 h-3 fill-amber-300 text-amber-300" />
                  Most Popular
                </div>
              )}

              <h4 className="font-bold text-lg text-gray-900 mb-1" style={JAKARTA_FONT}>
                {plan.name}
              </h4>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-gray-900" style={JAKARTA_FONT}>
                  {plan.price}
                </span>
                <span className="text-sm text-gray-500 font-normal">{plan.period}</span>
              </div>

              <div className="mt-4 flex flex-col gap-2 flex-1">
                {plan.features.map((feature) => (
                  <div key={feature} className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="text-sm text-gray-600">{feature}</span>
                  </div>
                ))}
              </div>

              {isCurrent ? (
                <button
                  type="button"
                  disabled
                  className="w-full mt-4 py-2.5 bg-violet-100 text-violet-600 font-semibold rounded-xl cursor-default text-sm"
                >
                  Current Plan
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelectPlan(plan.id)}
                  className="w-full mt-4 py-2.5 bg-linear-to-r from-violet-600 to-purple-500 text-white font-semibold rounded-xl shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity text-sm"
                >
                  {plan.id === 'agency' ? 'Contact Sales' : 'Upgrade'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
