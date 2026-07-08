import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { Check } from 'lucide-react'

interface PlanCard {
  id: 'starter' | 'growth' | 'agency'
  name: string
  price: string
  description: string
  features: string[]
  ctaLabel: string
  popular?: boolean
}

const PLANS: PlanCard[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: '₹1,999',
    description: 'Perfect for small businesses getting started with AI chat',
    features: [
      '1 AI chatbot',
      '500 conversations/month',
      'Built-in CRM (50 leads)',
      'Knowledge base (10 entries)',
      'Email notifications',
      'Website widget embed',
    ],
    ctaLabel: 'Get started',
  },
  {
    id: 'growth',
    name: 'Growth',
    price: '₹5,499',
    description: 'For growing teams that need more power',
    features: [
      '3 AI chatbots',
      '2,000 conversations/month',
      'Full CRM pipeline',
      'Lead qualification flows',
      'Analytics dashboard',
      'WhatsApp handoff (coming soon)',
    ],
    ctaLabel: 'Start free trial',
    popular: true,
  },
  {
    id: 'agency',
    name: 'Agency',
    price: '₹14,999',
    description: 'For agencies managing multiple clients',
    features: [
      'Unlimited chatbots',
      'White label branding',
      'Client sub-accounts',
      'Priority support',
      'Webhook integrations',
    ],
    ctaLabel: 'Contact sales',
  },
]

export default function Pricing() {
  const navigate = useNavigate()

  return (
    <section className="py-24 px-6 lg:px-8 bg-background" id="pricing">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-extrabold text-on-background tracking-tight mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-lg text-on-surface-variant max-w-2xl mx-auto">Start free, scale as you grow</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 items-start">
          {PLANS.map((plan, index) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.08 }}
              className={`relative rounded-2xl p-8 shadow-sm ${
                plan.popular ? 'border-2 border-primary bg-primary/5' : 'bg-white border border-outline-variant'
              }`}
              id={`pricing-card-${plan.id}`}
            >
              {plan.popular && (
                <span className="absolute -top-3 right-8 bg-amber-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                  Most Popular
                </span>
              )}

              <h3 className="text-xl font-bold text-on-surface">{plan.name}</h3>
              <p className="mt-4">
                <span className="text-4xl font-extrabold text-on-background">{plan.price}</span>
                <span className="text-on-surface-variant text-sm"> /month</span>
              </p>
              <p className="text-sm text-on-surface-variant mt-3">{plan.description}</p>

              <ul className="mt-6 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-on-surface">
                    <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              {plan.id === 'agency' ? (
                <a
                  href="mailto:sales@beepboop.drsyeta.in"
                  className="mt-8 block text-center border border-outline text-on-surface font-semibold px-6 py-3 rounded-xl hover:bg-surface-container transition-colors"
                  id="pricing-cta-agency"
                >
                  {plan.ctaLabel}
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className={`mt-8 w-full font-semibold px-6 py-3 rounded-xl transition-all ${
                    plan.popular
                      ? 'cta-accent text-white hover:shadow-lg hover:-translate-y-0.5'
                      : 'border border-outline text-on-surface hover:bg-surface-container'
                  }`}
                  id={`pricing-cta-${plan.id}`}
                >
                  {plan.ctaLabel}
                </button>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
