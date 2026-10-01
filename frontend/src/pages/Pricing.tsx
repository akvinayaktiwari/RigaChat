import { Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import FaqList from '../components/landing/FaqList'
import MarketingPageShell from '../components/landing/MarketingPageShell'
import PageMeta from '../components/seo/PageMeta'
import StructuredData from '../components/seo/StructuredData'
import { pricingFaq, pricingSummary } from '../lib/pricing-copy'
import { PRICING_TIERS, formatPrice, type PricingTier } from '../lib/pricingTiers'
import { faqPageSchema, jsonLdGraph, organizationSchema, pageGraphNodes, softwareApplicationSchema } from '../lib/structured-data'

const PAGE = { name: 'Pricing', path: '/pricing/' }

const SECTION_HEADING = 'text-3xl md:text-4xl font-extrabold text-on-surface tracking-tight text-center mb-10'

/**
 * One plan. Both prices are printed, not toggled: the page is prerendered once
 * for every visitor, and a crawler should read the rupee price without running
 * the script that would have switched to it.
 */
function PlanCard({ tier }: { tier: PricingTier }) {
  return (
    <div className="flex flex-col bg-white border border-outline-variant/30 rounded-2xl p-6 shadow-xs">
      <h3 className="font-bold text-on-surface text-lg">{tier.name}</h3>
      <p className="mt-1 text-sm text-on-surface-variant">{tier.description}</p>
      <p className="mt-5 text-3xl font-extrabold text-on-surface">
        {formatPrice(tier.priceUsd, 'intl')}
        <span className="text-sm font-medium text-on-surface-variant"> /month</span>
      </p>
      <p className="mt-1 text-sm text-on-surface-variant">{formatPrice(tier.priceUsd, 'in')} /month in India</p>
      <ul className="mt-6 space-y-2.5 flex-1">
        {tier.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm text-on-surface-variant">
            <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
            {feature}
          </li>
        ))}
      </ul>
      <Link
        to="/signup"
        className="mt-6 inline-flex items-center justify-center bg-primary text-white font-bold text-sm px-4 py-3 rounded-xl hover:opacity-95 transition-opacity"
      >
        Start free trial
      </Link>
    </div>
  )
}

export default function Pricing() {
  const faq = pricingFaq(PRICING_TIERS)

  return (
    <>
      <PageMeta
        title="Vyostra AI Pricing — Plans from $49 a Month"
        description="Vyostra AI costs $49, $129 or $349 a month. What each plan includes, who it is for, billing in USD or INR, and the 14-day free trial."
        path="/pricing/"
      />
      <StructuredData
        data={jsonLdGraph([organizationSchema(), softwareApplicationSchema(PRICING_TIERS), ...pageGraphNodes(PAGE), faqPageSchema(faq)])}
      />
      <MarketingPageShell
        badge="PRICING"
        headline="Vyostra AI pricing"
        lead={`${pricingSummary(PRICING_TIERS)} Every plan includes an AI agent trained on your website and the built-in lead CRM. You can start with a 14-day free trial that needs no credit card, and cancel at any time.`}
      >
        <section className="max-w-6xl mx-auto mb-20">
          <h2 className={SECTION_HEADING}>What does each Vyostra AI plan include, and who is it for?</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PRICING_TIERS.map((tier) => (
              <PlanCard key={tier.tier} tier={tier} />
            ))}
          </div>
        </section>

        <section className="max-w-3xl mx-auto">
          <h2 className={SECTION_HEADING}>What do people ask about Vyostra AI pricing?</h2>
          <FaqList items={faq} />
        </section>
      </MarketingPageShell>
    </>
  )
}
