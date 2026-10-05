import { useState } from 'react'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import FaqList from '../../components/landing/FaqList'
import MarketingPageShell from '../../components/landing/MarketingPageShell'
import PageMeta from '../../components/seo/PageMeta'
import StructuredData from '../../components/seo/StructuredData'
import { trackEvent } from '../../lib/analytics'
import { faqPageSchema, jsonLdGraph, organizationSchema, pageGraphNodes, type FaqItem } from '../../lib/structured-data'
import { DIAL_CODES, buildWhatsAppLink, whatsAppLinkHtml, type WhatsAppLinkProblem } from '../../lib/whatsapp-link'

const PAGE = { name: 'WhatsApp Link Generator', path: '/whatsapp-link-generator/' }

/** WhatsApp's own description of the link format; the rules on this page restate it. */
const CLICK_TO_CHAT_DOCS = 'https://faq.whatsapp.com/5913398998672934'

const SECTION_HEADING = 'text-3xl md:text-4xl font-extrabold text-on-surface tracking-tight text-center mb-10'
const FIELD_LABEL = 'block text-sm font-bold text-on-surface mb-1.5'
const FIELD_INPUT =
  'w-full rounded-xl border border-outline-variant bg-white px-4 py-3 text-base text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20'

const PROBLEM_TEXT: Record<WhatsAppLinkProblem, string> = {
  empty: 'Enter a phone number to build the link.',
  too_short: 'That number looks too short. Enter the full number, including the area or operator code.',
  too_long: 'That number is too long. A phone number has at most 15 digits, country code included.',
}

/**
 * Rendered on the page and published as FAQPage from this one array.
 *
 * The format answers restate WhatsApp's click-to-chat help article. The privacy
 * answer is true because lib/whatsapp-link.ts is pure and the one analytics
 * event this page sends carries no parameters.
 */
export const LINK_GENERATOR_FAQ: FaqItem[] = [
  {
    question: 'Is the WhatsApp link generator free?',
    answer: 'Yes. The Vyostra AI WhatsApp link generator is free, has no limit on the number of links, and needs no account or sign-up.',
  },
  {
    question: 'Do you store the phone number or message I type?',
    answer:
      'No. The link is built inside your browser. The number and message you type are never sent to Vyostra AI or saved anywhere, and they are gone when you close the page.',
  },
  {
    question: 'Does someone need my number saved to message me through the link?',
    answer:
      'No. A click-to-chat link opens a WhatsApp chat with your number directly, so the person does not have to save you as a contact first. They do need WhatsApp, and your number needs an active WhatsApp account.',
  },
  {
    question: 'What format does the phone number in a wa.me link need?',
    answer:
      'The full international number, digits only: the country code followed by the number, with no plus sign, no leading zero, and no spaces, brackets or dashes. The country code is 1 for the United States and Canada, 44 for the United Kingdom, 61 for Australia, 971 for the United Arab Emirates and 91 for India. A UK mobile written 07700 900123 becomes 447700900123.',
  },
  {
    question: 'Can the pre-filled message be changed by the person who taps the link?',
    answer:
      'Yes. The message appears in their text box, ready to send, and they can edit or delete it before sending. Nothing is sent until they press send.',
  },
  {
    question: 'Does the link work with the WhatsApp Business app?',
    answer:
      'Yes. A wa.me link works for any number with an active WhatsApp account, whether it is on WhatsApp, the WhatsApp Business app or the WhatsApp Business Platform.',
  },
]

const PLACES_TO_USE: readonly { title: string; body: string }[] = [
  { title: 'A button on your website', body: 'Paste the HTML snippet where you want a "Chat on WhatsApp" link, or use the link as the address of an existing button.' },
  { title: 'Your Instagram or Facebook bio', body: 'A bio takes one link. A WhatsApp link turns a profile visit into a conversation without a form in between.' },
  { title: 'Email signatures and invoices', body: 'Customers reply on the channel they already use, with the message you pre-filled telling you what it is about.' },
  { title: 'Print, through a QR code', body: 'Paste the link into any QR code generator and put the code on a brochure, hoarding or shop counter.' },
]

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      // No parameters: the number and message must never leave the browser.
      trackEvent('whatsapp_link_copy')
    } catch (error: unknown) {
      console.error('Could not copy to the clipboard; select the text and copy it by hand.', error)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white hover:opacity-95 transition-opacity cursor-pointer"
    >
      {copied ? <Check className="w-4 h-4" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
      {copied ? 'Copied' : label}
    </button>
  )
}

function LinkOutput({ url }: { url: string }) {
  const html = whatsAppLinkHtml(url, 'Chat on WhatsApp')

  return (
    <div className="space-y-5">
      <div>
        <p className={FIELD_LABEL}>Your WhatsApp link</p>
        <p className="break-all rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 font-mono text-sm text-on-surface">{url}</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <CopyButton text={url} label="Copy link" />
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-outline-variant bg-white px-4 py-3 text-sm font-bold text-on-surface hover:border-primary hover:text-primary transition-colors"
          >
            <ExternalLink className="w-4 h-4" aria-hidden="true" />
            Test the link
          </a>
        </div>
      </div>
      <div>
        <p className={FIELD_LABEL}>HTML for your website</p>
        <p className="break-all rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 font-mono text-sm text-on-surface">{html}</p>
        <div className="mt-3">
          <CopyButton text={html} label="Copy HTML" />
        </div>
      </div>
    </div>
  )
}

export function LinkBuilder() {
  const [countryCode, setCountryCode] = useState(DIAL_CODES[0]?.code ?? '')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const result = buildWhatsAppLink({ countryCode, phone, message })

  return (
    <div className="grid grid-cols-1 gap-8 rounded-2xl border border-outline-variant/30 bg-white p-6 shadow-xs md:grid-cols-2 md:p-8">
      <form className="space-y-5" onSubmit={(event) => event.preventDefault()}>
        <div>
          <label htmlFor="wa-country" className={FIELD_LABEL}>Country</label>
          <select id="wa-country" value={countryCode} onChange={(event) => setCountryCode(event.target.value)} className={FIELD_INPUT}>
            {DIAL_CODES.map((entry) => (
              <option key={entry.country} value={entry.code}>{`${entry.country} (+${entry.code})`}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="wa-phone" className={FIELD_LABEL}>WhatsApp number</label>
          <input id="wa-phone" type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Number without the country code" className={FIELD_INPUT} aria-describedby="wa-phone-hint" />
          <p id="wa-phone-hint" className="mt-1.5 text-sm text-on-surface-variant">Country not listed? Type the number with its code, starting with +.</p>
        </div>
        <div>
          <label htmlFor="wa-message" className={FIELD_LABEL}>Pre-filled message (optional)</label>
          <textarea id="wa-message" rows={4} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Hi, I would like to know more about…" className={FIELD_INPUT} />
        </div>
      </form>
      <div aria-live="polite">
        {result.ok ? <LinkOutput url={result.url} /> : <p className="rounded-xl bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">{PROBLEM_TEXT[result.problem]}</p>}
      </div>
    </div>
  )
}

function HowItWorks() {
  return (
    <section className="max-w-3xl mx-auto mb-20">
      <h2 className={SECTION_HEADING}>How does a WhatsApp click-to-chat link work?</h2>
      <div className="space-y-4 text-base text-on-surface-variant leading-relaxed">
        <p>
          A click-to-chat link is a web address in the form <span className="font-mono text-on-surface">https://wa.me/&lt;number&gt;</span>. When someone taps it,
          WhatsApp opens a chat with that number, on their phone or on WhatsApp Web. They do not need the number saved in their contacts.
        </p>
        <p>
          The number must be in full international format: country code first, then the number, digits only. WhatsApp rejects a link whose number
          has a plus sign, a leading zero, brackets or dashes. This tool removes all of those for you.
        </p>
        <p>
          To pre-fill a message, the link takes a <span className="font-mono text-on-surface">?text=</span> part holding the message in URL-encoded form, where a
          space becomes <span className="font-mono text-on-surface">%20</span>. The person sees the message in their text box and chooses whether to send it.
        </p>
        <p>
          WhatsApp documents the format in its help article{' '}
          <a href={CLICK_TO_CHAT_DOCS} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">How to use click to chat</a>.
        </p>
      </div>
    </section>
  )
}

function PlacesToUse() {
  return (
    <section className="max-w-5xl mx-auto mb-20">
      <h2 className={SECTION_HEADING}>Where can you use a WhatsApp link?</h2>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {PLACES_TO_USE.map((place) => (
          <div key={place.title} className="rounded-2xl border border-outline-variant/30 bg-white p-6 shadow-xs">
            <h3 className="font-bold text-on-surface text-base mb-2">{place.title}</h3>
            <p className="text-sm text-on-surface-variant leading-relaxed">{place.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function NextStep() {
  return (
    <section className="max-w-3xl mx-auto mt-20 rounded-3xl bg-on-surface p-10 text-center text-white">
      <h2 className="text-2xl md:text-3xl font-extrabold mb-4">What happens after someone messages you?</h2>
      <p className="text-white/80 leading-relaxed mb-8">
        A link starts the conversation; someone still has to answer it. Vyostra AI captures leads on your website with an AI agent and sends each one to
        your WhatsApp the moment it arrives.
      </p>
      <Link to="/features/whatsapp" className="inline-flex items-center justify-center rounded-xl bg-primary px-8 py-4 font-bold text-white hover:opacity-95 transition-opacity">
        See WhatsApp lead alerts
      </Link>
    </section>
  )
}

export default function WhatsAppLinkGenerator() {
  return (
    <>
      <PageMeta
        title="Free WhatsApp Link Generator (wa.me) — Vyostra AI"
        description="Create a wa.me click-to-chat link with a pre-filled message. Free, no sign-up, and the number you type never leaves your browser."
        path="/whatsapp-link-generator/"
      />
      <StructuredData data={jsonLdGraph([organizationSchema(), ...pageGraphNodes(PAGE), faqPageSchema(LINK_GENERATOR_FAQ)])} />
      <MarketingPageShell
        badge="FREE TOOL"
        headline="WhatsApp link generator"
        lead="The Vyostra AI WhatsApp link generator turns a phone number and an optional pre-filled message into a wa.me click-to-chat link. Anyone who taps the link opens a WhatsApp chat with that number, without saving it as a contact first. It is free, needs no sign-up, and runs entirely in your browser."
      >
        <section className="max-w-5xl mx-auto mb-20">
          <h2 className={SECTION_HEADING}>Which number and message should your link open?</h2>
          <LinkBuilder />
        </section>
        <HowItWorks />
        <PlacesToUse />
        <section className="max-w-3xl mx-auto">
          <h2 className={SECTION_HEADING}>What do people ask about WhatsApp links?</h2>
          <FaqList items={LINK_GENERATOR_FAQ} />
        </section>
        <NextStep />
      </MarketingPageShell>
    </>
  )
}
