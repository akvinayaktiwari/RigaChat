/**
 * The sentences that state Vyostra AI's prices, built from PRICING_TIERS.
 *
 * Generated rather than typed out because they are what an answer engine
 * quotes: a price written by hand into a paragraph is the one that gets left
 * behind when the plan changes, and then the page contradicts its own cards
 * and its own Offer schema.
 */
import { INR_METHODS_NOTE, formatPrice, type PricingTier, type Region } from './pricingTiers'
import { SUPPORT_EMAIL, type FaqItem } from './structured-data'

/** "$49 a month on Starter, $129 on Growth and $349 on Agency". */
export function planPriceList(tiers: readonly PricingTier[], region: Region): string {
  const parts = tiers.map((tier, index) => {
    const price = formatPrice(tier.priceUsd, region)
    return index === 0 ? `${price} a month on ${tier.name}` : `${price} on ${tier.name}`
  })
  if (parts.length < 2) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

export function pricingSummary(tiers: readonly PricingTier[]): string {
  return `Vyostra AI costs ${planPriceList(tiers, 'intl')}.`
}

/** "UPI, netbanking, RuPay or card", from the note the plan toggle shows. */
const INR_METHODS = INR_METHODS_NOTE.replace(/^Pay by /, '')

/** The pricing page's questions. Rendered on the page and published as FAQPage from this one array. */
export function pricingFaq(tiers: readonly PricingTier[]): FaqItem[] {
  return [
    {
      question: 'How much does Vyostra AI cost?',
      answer: `${pricingSummary(tiers)} Plans are billed monthly, and every new account starts with a 14-day free trial that needs no credit card.`,
    },
    {
      question: 'How much does an AI chatbot for a website cost in India?',
      answer: `With Vyostra AI it costs ${planPriceList(tiers, 'in')}. These are the same plans as the US dollar list, priced in rupees so that you can pay by ${INR_METHODS}.`,
    },
    {
      question: 'Which currency will I be billed in?',
      answer: `You choose. The rupee price list is paid by ${INR_METHODS}, and the US dollar list is paid by card. The amount shown on the plan is the amount charged.`,
    },
    {
      question: 'Is there a free trial?',
      answer: 'Yes. Every new Vyostra AI account starts with a 14-day free trial, and you do not need a credit card to begin.',
    },
    {
      question: "What happens when I reach my plan's conversation limit?",
      answer:
        "When a plan's monthly conversations are used up, the agent stops starting new conversations until the next billing period begins or you upgrade. You can upgrade at any time from Settings.",
    },
    {
      question: 'Can I change or cancel my plan later?',
      answer:
        'Yes. You can upgrade or downgrade at any time from Settings, and cancel there too. After you cancel, your account stays active until the end of the billing period.',
    },
    {
      question: 'Is the AI voice agent included in the plans?',
      answer: `No. The on-page AI voice agent is an add-on that is enabled per account. Email ${SUPPORT_EMAIL} to switch it on.`,
    },
  ]
}
