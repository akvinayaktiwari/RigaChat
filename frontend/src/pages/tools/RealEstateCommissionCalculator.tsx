import { useMemo, useState, type ChangeEvent } from 'react'
import { Calculator, Eraser, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import FaqList from '../../components/landing/FaqList'
import MarketingPageShell from '../../components/landing/MarketingPageShell'
import PageMeta from '../../components/seo/PageMeta'
import StructuredData from '../../components/seo/StructuredData'
import CopyButton from '../../components/tools/CopyButton'
import ToolCard from '../../components/tools/ToolCard'
import { FIELD_HINT, FIELD_INPUT, FIELD_LABEL, PROSE, SECONDARY_BUTTON, SECTION_HEADING, TEXT_LINK } from '../../components/tools/tool-styles'
import { trackEvent } from '../../lib/analytics'
import {
  COMMISSION_CURRENCIES,
  EMPTY_COMMISSION_FORM,
  EXAMPLE_COMMISSION_FORM,
  calculateCommission,
  commissionLines,
  commissionSummary,
  formatMoney,
  type CommissionBasis,
  type CommissionCurrency,
  type CommissionForm,
  type SideActedFor,
} from '../../lib/commission-calculator'
import { faqPageSchema, jsonLdGraph, organizationSchema, toolPageNodes, type FaqItem } from '../../lib/structured-data'

const PAGE = {
  name: 'Real Estate Commission Calculator',
  path: '/tools/real-estate-commission-calculator/',
  description:
    'A free real estate commission calculator: enter the sale price, your commission, the side split, a referral fee, the brokerage split and tax to see what the agent takes home. It runs in the browser.',
}

/** The name analytics sees. The numbers never go with it. */
const TOOL_ID = 'real_estate_commission_calculator'

const SIDE_LABEL: Record<SideActedFor, string> = {
  listing: 'The seller’s side (listing agent)',
  buyer: 'The buyer’s side (buyer’s agent)',
  both: 'Both sides (one agent for buyer and seller)',
}

/**
 * Rendered on the page and published as FAQPage from this one array.
 *
 * No answer states a rate, a split or a tax rule as a standard: those are
 * agreed between the parties or set by local law, and differ by market. The
 * privacy answer is true because the arithmetic is the pure module in
 * lib/commission-calculator.ts and the one analytics event carries only the
 * tool's name.
 */
export const COMMISSION_FAQ: FaqItem[] = [
  {
    question: 'How do you calculate real estate commission?',
    answer:
      'Multiply the sale price by the commission rate, or use the flat fee you agreed. That is the total commission. Then work out the share that belongs to your side of the sale, take off any referral fee, apply the split between you and your brokerage, and take off tax. This calculator does each step and lists them.',
  },
  {
    question: 'What is the standard real estate commission rate?',
    answer:
      'There is no single standard. Commission is agreed between the parties and differs by market, property type and the services included, so this calculator starts blank and never fills in a rate for you. Use the rate in your own listing or representation agreement.',
  },
  {
    question: 'How is commission split between the listing and buyer side?',
    answer:
      'However the agreements say. An even split is common to describe, but it is not a rule. Enter the percentage of the total that belongs to the listing side and the calculator gives the buyer side the rest. If one agent acts for both sides, choose “both sides”.',
  },
  {
    question: 'What is a brokerage split?',
    answer:
      'It is how an agent and the brokerage they work under share the commission the agent earns. An agent whose split is 70 percent keeps 70 percent and the brokerage keeps 30. Enter the share the agent keeps. Your contract with your brokerage sets it, and it can change with your earnings.',
  },
  {
    question: 'Does this include tax?',
    answer:
      'Only as a percentage you enter. Tax on commission depends on your country, how you are employed and your other income, so the calculator applies the rate you give it and does not look any up. Leave it at zero to see the figure before tax, and ask an accountant for your own rate.',
  },
  {
    question: 'In which order are the deductions taken?',
    answer:
      'The referral fee comes off your side’s commission first, then the brokerage split applies to what is left, then tax applies to the agent’s share. Some brokerages order these differently. If yours does, the totals can differ, so check the result against your own statement.',
  },
  {
    question: 'Do you store the numbers I enter?',
    answer: 'No. The arithmetic is done inside your browser. What you enter is never sent to Vyostra AI or saved, and it is gone when you close the page.',
  },
]

type TextField = Exclude<keyof CommissionForm, 'basis' | 'side'>

function NumberField(props: { id: string; label: string; hint?: string; value: string; onChange: (value: string) => void; suffix?: string }) {
  return (
    <div>
      <label htmlFor={props.id} className={FIELD_LABEL}>{props.label}</label>
      <div className="flex items-center gap-2">
        <input
          id={props.id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          className={FIELD_INPUT}
          aria-describedby={props.hint ? `${props.id}-hint` : undefined}
        />
        {props.suffix ? <span className="shrink-0 text-sm font-semibold text-on-surface-variant" aria-hidden="true">{props.suffix}</span> : null}
      </div>
      {props.hint ? <p id={`${props.id}-hint`} className={FIELD_HINT}>{props.hint}</p> : null}
    </div>
  )
}

interface FormProps {
  form: CommissionForm
  currency: CommissionCurrency
  onField: (field: TextField, value: string) => void
  onBasis: (basis: CommissionBasis) => void
  onSide: (side: SideActedFor) => void
  onCurrency: (currency: CommissionCurrency) => void
  onClear: () => void
}

function BasisChoice({ basis, onBasis }: { basis: CommissionBasis; onBasis: (basis: CommissionBasis) => void }) {
  return (
    <fieldset>
      <legend className={FIELD_LABEL}>How is the commission set?</legend>
      <div className="flex flex-wrap gap-4">
        {(['percent', 'flat'] as const).map((choice) => (
          <label key={choice} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-on-surface cursor-pointer">
            <input type="radio" name="commission-basis" checked={basis === choice} onChange={() => onBasis(choice)} className="h-4 w-4 accent-primary" />
            {choice === 'percent' ? 'A percentage of the price' : 'A flat fee'}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function CommissionFields({ form, currency, onField, onBasis, onSide, onCurrency, onClear }: FormProps) {
  const filled = JSON.stringify(form) !== JSON.stringify(EMPTY_COMMISSION_FORM)
  return (
    <form onSubmit={(event) => event.preventDefault()} className="space-y-5">
      <div>
        <label htmlFor="commission-currency" className={FIELD_LABEL}>Currency</label>
        <select id="commission-currency" value={currency} onChange={(event: ChangeEvent<HTMLSelectElement>) => onCurrency(event.target.value as CommissionCurrency)} className={FIELD_INPUT}>
          {COMMISSION_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
        </select>
      </div>
      <NumberField id="commission-price" label="Sale price" value={form.salePrice} onChange={(value) => onField('salePrice', value)} />
      <BasisChoice basis={form.basis} onBasis={onBasis} />
      <NumberField
        id="commission-amount"
        label={form.basis === 'percent' ? 'Commission rate' : 'Flat commission'}
        value={form.commission}
        onChange={(value) => onField('commission', value)}
        suffix={form.basis === 'percent' ? '%' : currency}
        hint="Use the figure in your agreement. Nothing is filled in for you."
      />
      <div>
        <label htmlFor="commission-side" className={FIELD_LABEL}>Which side do you act for?</label>
        <select id="commission-side" value={form.side} onChange={(event: ChangeEvent<HTMLSelectElement>) => onSide(event.target.value as SideActedFor)} className={FIELD_INPUT}>
          {(Object.keys(SIDE_LABEL) as SideActedFor[]).map((side) => <option key={side} value={side}>{SIDE_LABEL[side]}</option>)}
        </select>
      </div>
      {form.side === 'both' ? null : (
        <NumberField id="commission-listing-share" label="Listing side’s share of the commission" value={form.listingSharePercent} onChange={(value) => onField('listingSharePercent', value)} suffix="%" hint="The buyer side gets the rest." />
      )}
      <NumberField id="commission-referral" label="Referral fee (optional)" value={form.referralPercent} onChange={(value) => onField('referralPercent', value)} suffix="%" hint="Taken from your side’s commission." />
      <NumberField id="commission-split" label="Share the agent keeps after the brokerage" value={form.agentSplitPercent} onChange={(value) => onField('agentSplitPercent', value)} suffix="%" hint="100 if there is no brokerage split." />
      <NumberField id="commission-tax" label="Tax on the agent’s commission (optional)" value={form.taxPercent} onChange={(value) => onField('taxPercent', value)} suffix="%" hint="Enter your own rate. Leave 0 to see the figure before tax." />
      {filled ? (
        <button type="button" onClick={onClear} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-on-surface-variant hover:text-primary cursor-pointer">
          <Eraser className="h-4 w-4" aria-hidden="true" />
          Clear
        </button>
      ) : null}
    </form>
  )
}

function CommissionPending({ onExample }: { onExample: () => void }) {
  return (
    <div className="flex min-h-56 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-outline-variant bg-white/60 p-8 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary-light text-primary" aria-hidden="true">
        <Calculator className="h-6 w-6" />
      </span>
      <p className="mb-4 text-sm leading-relaxed text-on-surface-variant">Enter a sale price and a commission to see the breakdown.</p>
      <button type="button" onClick={onExample} className={SECONDARY_BUTTON}>
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        Try an example
      </button>
      <p className="mt-3 text-xs text-on-surface-variant">The example uses round, made-up numbers. They are not typical rates.</p>
    </div>
  )
}

function CommissionTable({ form, currency }: { form: CommissionForm; currency: CommissionCurrency }) {
  const outcome = useMemo(() => calculateCommission(form), [form])
  if (!outcome.ok) {
    return (
      <ul role="alert" className="space-y-1 text-sm text-error">
        {outcome.errors.map((error) => <li key={error}>{error}</li>)}
      </ul>
    )
  }
  const lines = commissionLines(outcome.result, form)
  return (
    <div className="tool-pop space-y-5">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Commission breakdown</caption>
        <tbody>
          {lines.map((line, index) => {
            const last = index === lines.length - 1
            return (
              <tr key={line.label} className={`border-t border-outline-variant/30 ${last ? 'font-extrabold text-on-surface' : ''}`}>
                <th scope="row" className="py-2.5 pr-3 font-semibold text-on-surface">{line.label}</th>
                <td className="py-2.5 text-right tabular-nums">{line.deduction ? '−' : ''}{formatMoney(line.amount, currency)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {/* The tool's name only: the numbers stay in the browser. */}
      <CopyButton text={commissionSummary(outcome.result, form, currency)} label="Copy summary" onCopied={() => trackEvent('tool_used', { tool: TOOL_ID })} />
      <p className={FIELD_HINT}>An estimate from the numbers you entered, not financial or tax advice. Check it against your own agreement.</p>
    </div>
  )
}

export function CommissionCalculator() {
  const [form, setForm] = useState<CommissionForm>(EMPTY_COMMISSION_FORM)
  const [currency, setCurrency] = useState<CommissionCurrency>('USD')
  // Nothing to calculate until the two numbers every result needs have been typed.
  const started = form.commission.trim() !== '' && (form.basis === 'flat' || form.salePrice.trim() !== '')

  return (
    <ToolCard
      inputTitle="Enter the deal"
      outputTitle="Your breakdown"
      input={
        <CommissionFields
          form={form}
          currency={currency}
          onField={(field, value) => setForm((previous) => ({ ...previous, [field]: value }))}
          onBasis={(basis) => setForm((previous) => ({ ...previous, basis, commission: '' }))}
          onSide={(side) => setForm((previous) => ({ ...previous, side }))}
          onCurrency={setCurrency}
          onClear={() => setForm(EMPTY_COMMISSION_FORM)}
        />
      }
      output={started ? <CommissionTable form={form} currency={currency} /> : <CommissionPending onExample={() => setForm(EXAMPLE_COMMISSION_FORM)} />}
    />
  )
}

const STEPS: readonly { title: string; body: string }[] = [
  { title: '1. Total commission', body: 'The sale price times the rate, or the flat fee you agreed.' },
  { title: '2. Your side’s share', body: 'The part of the total that belongs to the seller’s side or the buyer’s side, or all of it if you act for both.' },
  { title: '3. Referral fee', body: 'A percentage of your side’s share, paid to whoever referred the client.' },
  { title: '4. Brokerage split', body: 'The percentage of what is left that the agent keeps. The brokerage keeps the remainder.' },
  { title: '5. Tax', body: 'The rate you enter, applied to the agent’s share. The result is the take-home figure.' },
]

function HowItWorks() {
  return (
    <section className="mx-auto mb-20 max-w-5xl">
      <h2 className={SECTION_HEADING}>How is the commission worked out?</h2>
      <div className={`${PROSE} mx-auto mb-8 max-w-3xl`}>
        <p>
          The calculator follows five steps in this order. Brokerages differ, so if yours takes the referral fee or tax at a different point, check the result
          against your own statement. It holds no rates of its own: commission is agreed between the parties, so every percentage comes from you.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {STEPS.map((step) => (
          <div key={step.title} className="rounded-2xl border border-outline-variant/30 bg-white p-6 shadow-xs">
            <h3 className="mb-2 text-base font-bold text-on-surface">{step.title}</h3>
            <p className="text-sm leading-relaxed text-on-surface-variant">{step.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function WorkedExample() {
  const outcome = calculateCommission(EXAMPLE_COMMISSION_FORM)
  if (!outcome.ok) return null
  const { result } = outcome
  const money = (amount: number): string => formatMoney(amount, 'USD')
  return (
    <section className="mx-auto mb-20 max-w-3xl">
      <h2 className={SECTION_HEADING}>What does a worked example look like?</h2>
      <div className={PROSE}>
        <p>
          Take a {money(Number(EXAMPLE_COMMISSION_FORM.salePrice))} sale at a {EXAMPLE_COMMISSION_FORM.commission}% commission, with the seller&rsquo;s side holding{' '}
          {EXAMPLE_COMMISSION_FORM.listingSharePercent}% of it, a {EXAMPLE_COMMISSION_FORM.referralPercent}% referral fee, a {EXAMPLE_COMMISSION_FORM.agentSplitPercent}% share for the agent and {EXAMPLE_COMMISSION_FORM.taxPercent}% tax.
          The total commission is {money(result.totalCommission)}. The listing side&rsquo;s share is {money(result.sideCommission)}, less a {money(result.referralFee)} referral fee
          and a {money(result.brokerageShare)} brokerage share, leaving {money(result.agentBeforeTax)}. After {money(result.tax)} tax, the agent takes home {money(result.agentTakeHome)}.
        </p>
        <p>These numbers are made up to show the steps. They are not typical rates, and yours will differ.</p>
      </div>
    </section>
  )
}

function NextStep() {
  return (
    <section className="mx-auto mt-20 max-w-3xl rounded-3xl bg-on-surface p-10 text-center text-white">
      <h2 className="mb-4 text-2xl font-extrabold md:text-3xl">Where do your next buyers and sellers come from?</h2>
      <p className="mb-8 leading-relaxed text-white/80">
        A commission only exists once an enquiry is answered. Vyostra AI captures leads on your website with an AI agent, keeps each one in a lead list with its
        conversation, and follows up on WhatsApp.
      </p>
      <Link
        to="/features/crm"
        onClick={() => trackEvent('tool_cta_click', { tool: TOOL_ID })}
        className="inline-flex items-center justify-center rounded-xl bg-primary px-8 py-4 font-bold text-white transition-opacity hover:opacity-95"
      >
        See the lead CRM
      </Link>
    </section>
  )
}

export default function RealEstateCommissionCalculator() {
  return (
    <>
      <PageMeta
        title="Real Estate Commission Calculator — Vyostra AI"
        description="Work out real estate commission: price, rate or flat fee, side split, referral fee, brokerage split and tax. Free, no sign-up, and nothing leaves your browser."
        path={PAGE.path}
      />
      <StructuredData data={jsonLdGraph([organizationSchema(), ...toolPageNodes(PAGE), faqPageSchema(COMMISSION_FAQ)])} />
      <MarketingPageShell
        badge="FREE TOOL"
        headline="Real estate commission calculator"
        lead="The Vyostra AI real estate commission calculator works out the commission on a sale and what an agent takes home. Enter the price, the commission, which side you act for, any referral fee, your brokerage split and a tax rate, and it lists each step. It uses only the numbers you type, is free, needs no sign-up, and runs entirely in your browser."
      >
        <section className="mx-auto mb-20 max-w-5xl">
          <h2 className={SECTION_HEADING}>What are the numbers on the deal?</h2>
          <CommissionCalculator />
        </section>
        <HowItWorks />
        <WorkedExample />
        <section className="mx-auto max-w-3xl">
          <h2 className={SECTION_HEADING}>What do people ask about real estate commission?</h2>
          <FaqList items={COMMISSION_FAQ} />
        </section>
        <NextStep />
      </MarketingPageShell>
    </>
  )
}
