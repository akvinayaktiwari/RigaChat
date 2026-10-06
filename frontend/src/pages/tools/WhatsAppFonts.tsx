import { useState } from 'react'
import { Eraser, Sparkles, Type } from 'lucide-react'
import { Link } from 'react-router-dom'
import FaqList from '../../components/landing/FaqList'
import MarketingPageShell from '../../components/landing/MarketingPageShell'
import PageMeta from '../../components/seo/PageMeta'
import StructuredData from '../../components/seo/StructuredData'
import CopyButton from '../../components/tools/CopyButton'
import ToolCard from '../../components/tools/ToolCard'
import { FIELD_HINT, FIELD_INPUT, FIELD_LABEL, PROSE, SECONDARY_BUTTON, SECTION_HEADING, TEXT_LINK } from '../../components/tools/tool-styles'
import { trackEvent } from '../../lib/analytics'
import { faqPageSchema, jsonLdGraph, organizationSchema, toolPageNodes, type FaqItem } from '../../lib/structured-data'
import { WHATSAPP_FONTS, type WhatsAppFont } from '../../lib/whatsapp-fonts'

const PAGE = {
  name: 'WhatsApp Fonts',
  path: '/tools/whatsapp-fonts/',
  description:
    'A free tool that turns text into WhatsApp-ready font styles (bold serif, script, gothic, double-struck, circled and more) to copy and paste. It runs in the browser.',
}

/** The name analytics sees. The text never goes with it. */
const TOOL_ID = 'whatsapp_fonts'

const EXAMPLE_TEXT = 'Grand Opening 2026'

/**
 * Rendered on the page and published as FAQPage from this one array.
 *
 * The accessibility and compatibility answers are the reason the page exists
 * in its honest form: these are look-alike characters, not fonts. The privacy
 * answer is true because lib/whatsapp-fonts.ts is pure and the one analytics
 * event this page sends carries only the tool's name.
 */
export const FONTS_FAQ: FaqItem[] = [
  {
    question: 'How do I change the font in WhatsApp?',
    answer:
      'WhatsApp has no font setting. Type your text in this tool, copy the style you like and paste it into a chat. The result is ordinary text made of special characters, so it works without an extra keyboard or app.',
  },
  {
    question: 'Are these real fonts?',
    answer:
      'No. Each style swaps your letters for look-alike characters from other parts of the Unicode standard, mostly its mathematical alphabets. That is why the text can be pasted anywhere, and also why it has the limits described on this page.',
  },
  {
    question: 'Why do some of the characters show as boxes?',
    answer:
      'A phone or computer shows a box when its system fonts have no glyph for a character. Most current phones draw these styles, but an older device may not, so send a test message to a phone you do not use before you rely on a style.',
  },
  {
    question: 'Can screen readers read this text?',
    answer:
      'Poorly. A screen reader reads each character by its Unicode name, such as "mathematical bold capital H", instead of the letter, so a message in these styles can be unintelligible to a blind customer. Use them for a decorative word, not a whole message or anything people must act on.',
  },
  {
    question: 'Will the text be found by search?',
    answer:
      'No. Search matches letters, and these are different characters, so a customer searching the chat for a word you styled will not find it. Keep names, prices, dates and codes in plain text.',
  },
  {
    question: 'Is it better to use WhatsApp’s own bold and italic?',
    answer:
      'For most business messages, yes. WhatsApp’s bold, italic and strikethrough are ordinary text with a symbol on each side, so they stay readable, searchable and accessible. Use the WhatsApp text formatter for those, and this tool only for a decorative touch.',
  },
  {
    question: 'Do you store the text I type?',
    answer:
      'No. The styles are applied inside your browser. What you type is never sent to Vyostra AI or saved, and it is gone when you close the page.',
  },
]

const CAUTIONS: readonly { title: string; body: string }[] = [
  { title: 'Screen readers', body: 'They read each character by its Unicode name, so a styled message can be gibberish to a blind customer.' },
  { title: 'Older phones', body: 'A device without a glyph for a character shows an empty box. Test on a phone you do not use.' },
  { title: 'Search', body: 'A styled word is a different character from the plain one, so searching the chat will not find it.' },
  { title: 'Plain text for what matters', body: 'Keep prices, dates, codes and addresses in plain text, so customers can read, copy and search them.' },
]

function FontRow({ font, text }: { font: WhatsAppFont; text: string }) {
  const converted = font.convert(text)
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-outline-variant/40 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">{font.label}</p>
        <p className="break-words text-lg text-on-surface">{converted}</p>
        {font.note ? <p className="text-xs text-on-surface-variant">{font.note}</p> : null}
      </div>
      {/* The tool's name only: the text stays in the browser. */}
      <CopyButton text={converted} label={`Copy ${font.label}`} onCopied={() => trackEvent('tool_used', { tool: TOOL_ID })} />
    </li>
  )
}

function FontsPending({ onExample }: { onExample: () => void }) {
  return (
    <div className="flex min-h-56 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-outline-variant bg-white/60 p-8 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary-light text-primary" aria-hidden="true">
        <Type className="h-6 w-6" />
      </span>
      <p className="mb-4 text-sm leading-relaxed text-on-surface-variant">Type some text to see it in every style.</p>
      <button type="button" onClick={onExample} className={SECONDARY_BUTTON}>
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        Try an example
      </button>
    </div>
  )
}

export function WhatsAppFontsTool() {
  const [text, setText] = useState('')

  return (
    <ToolCard
      inputTitle="Type your text"
      outputTitle="Pick a style and copy"
      input={
        <form onSubmit={(event) => event.preventDefault()}>
          <label htmlFor="wa-fonts-text" className={FIELD_LABEL}>Your text</label>
          <textarea
            id="wa-fonts-text"
            rows={4}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="A word or a short line"
            className={FIELD_INPUT}
            aria-describedby="wa-fonts-hint"
          />
          <div className="mt-1.5 flex items-start justify-between gap-4">
            <p id="wa-fonts-hint" className={FIELD_HINT}>Letters A to Z and digits change. Spaces, punctuation, accents and emoji stay as they are.</p>
            {text ? (
              <button type="button" onClick={() => setText('')} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-semibold text-on-surface-variant hover:text-primary cursor-pointer">
                <Eraser className="h-4 w-4" aria-hidden="true" />
                Clear
              </button>
            ) : null}
          </div>
        </form>
      }
      output={
        text.trim() ? (
          <ul className="tool-pop space-y-3">
            {WHATSAPP_FONTS.map((font) => <FontRow key={font.id} font={font} text={text} />)}
          </ul>
        ) : (
          <FontsPending onExample={() => setText(EXAMPLE_TEXT)} />
        )
      }
    />
  )
}

function Cautions() {
  return (
    <section className="mx-auto mb-20 max-w-5xl">
      <h2 className={SECTION_HEADING}>Are WhatsApp fonts safe to use?</h2>
      <div className={`${PROSE} mx-auto mb-8 max-w-3xl`}>
        <p>
          They are safe in the sense that nothing is installed and nothing breaks. They are not ideal for a business message, because these characters are
          not fonts and the people who receive them see them differently.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {CAUTIONS.map((caution) => (
          <div key={caution.title} className="rounded-2xl border border-outline-variant/30 bg-white p-6 shadow-xs">
            <h3 className="mb-2 text-base font-bold text-on-surface">{caution.title}</h3>
            <p className="text-sm leading-relaxed text-on-surface-variant">{caution.body}</p>
          </div>
        ))}
      </div>
      <p className="mx-auto mt-8 max-w-3xl text-center text-base text-on-surface-variant">
        For emphasis that stays readable, use WhatsApp&rsquo;s own formatting: the{' '}
        <Link to="/tools/whatsapp-text-formatter" className={TEXT_LINK}>WhatsApp text formatter</Link> adds bold, italic, strikethrough and lists for you.
      </p>
    </section>
  )
}

function NextStep() {
  return (
    <section className="mx-auto mt-20 max-w-3xl rounded-3xl bg-on-surface p-10 text-center text-white">
      <h2 className="mb-4 text-2xl font-extrabold md:text-3xl">Who answers when a customer writes back?</h2>
      <p className="mb-8 leading-relaxed text-white/80">
        A message that stands out gets replies; someone still has to answer them. Vyostra AI captures leads on your website with an AI agent and sends each one
        to your WhatsApp the moment it arrives.
      </p>
      <Link
        to="/features/whatsapp"
        onClick={() => trackEvent('tool_cta_click', { tool: TOOL_ID })}
        className="inline-flex items-center justify-center rounded-xl bg-primary px-8 py-4 font-bold text-white transition-opacity hover:opacity-95"
      >
        See WhatsApp lead alerts
      </Link>
    </section>
  )
}

export default function WhatsAppFonts() {
  return (
    <>
      <PageMeta
        title="WhatsApp Fonts: Copy and Paste Styles — Vyostra AI"
        description="Turn text into WhatsApp font styles: bold serif, script, gothic, circled and more. Copy and paste. Free, no sign-up, in your browser. Read the limits first."
        path={PAGE.path}
      />
      <StructuredData data={jsonLdGraph([organizationSchema(), ...toolPageNodes(PAGE), faqPageSchema(FONTS_FAQ)])} />
      <MarketingPageShell
        badge="FREE TOOL"
        headline="WhatsApp fonts"
        lead="The Vyostra AI WhatsApp fonts tool turns your text into 16 styles, such as bold serif, script, gothic and circled letters, that you copy and paste into WhatsApp. They are look-alike characters rather than real fonts, so they suit a decorative word, not a whole message. It is free, needs no sign-up, and runs entirely in your browser."
      >
        <section className="mx-auto mb-20 max-w-5xl">
          <h2 className={SECTION_HEADING}>What do you want to write?</h2>
          <WhatsAppFontsTool />
        </section>
        <Cautions />
        <section className="mx-auto max-w-3xl">
          <h2 className={SECTION_HEADING}>What do people ask about WhatsApp fonts?</h2>
          <FaqList items={FONTS_FAQ} />
        </section>
        <NextStep />
      </MarketingPageShell>
    </>
  )
}
