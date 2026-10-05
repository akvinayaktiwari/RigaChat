import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { Bold, Code, Eraser, Italic, List, ListOrdered, MessageSquareText, Sparkles, SquareCode, Strikethrough, TextQuote, type LucideIcon } from 'lucide-react'
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
import {
  WHATSAPP_FORMATS,
  WHATSAPP_FORMAT_DOCS,
  applyWhatsAppFormat,
  parseWhatsAppMessage,
  type InlineNode,
  type MessageBlock,
  type TextSelection,
  type WhatsAppFormatId,
} from '../../lib/whatsapp-format'

const PAGE = {
  name: 'WhatsApp Text Formatter',
  path: '/tools/whatsapp-text-formatter/',
  description:
    'A free tool that adds WhatsApp formatting to a message: bold, italic, strikethrough, monospace, inline code, lists and quotes, with a preview. It runs in the browser.',
}

/** The name analytics sees. The message never goes with it. */
const TOOL_ID = 'whatsapp_text_formatter'

const FORMAT_ICON: Record<WhatsAppFormatId, LucideIcon> = {
  bold: Bold,
  italic: Italic,
  strikethrough: Strikethrough,
  monospace: SquareCode,
  code: Code,
  bullets: List,
  numbers: ListOrdered,
  quote: TextQuote,
}

/** Ctrl or Cmd with these keys, the shortcuts people already know from other editors. */
const SHORTCUTS: Record<string, WhatsAppFormatId> = { b: 'bold', i: 'italic' }

const EXAMPLE_MESSAGE = [
  '*Weekend opening hours*',
  'We are open _Saturday and Sunday_ this week.',
  '',
  'What you can book:',
  '- A 30 minute call',
  '- A visit to the showroom',
  '',
  'Quote this code when you reply: `VISIT25`',
].join('\n')

/**
 * Rendered on the page and published as FAQPage from this one array.
 *
 * Every answer about syntax restates WhatsApp's help article (see
 * lib/whatsapp-format.ts). The privacy answer is true because the formatting
 * is done by that pure module and the one analytics event this page sends
 * carries only the tool's name.
 */
export const TEXT_FORMATTER_FAQ: FaqItem[] = [
  {
    question: 'Is the WhatsApp text formatter free?',
    answer: 'Yes. The Vyostra AI WhatsApp text formatter is free, has no limit on the number of messages, and needs no account or sign-up.',
  },
  {
    question: 'How do I make text bold in WhatsApp?',
    answer:
      'Put an asterisk on both sides of the text, like *this*. WhatsApp shows the words in bold and hides the asterisks. In this tool, select the words and press Bold, and the asterisks are added for you.',
  },
  {
    question: 'How do I write italic or strikethrough text in WhatsApp?',
    answer:
      'For italic, put an underscore on both sides of the text, like _this_. For strikethrough, put a tilde on both sides, like ~this~. Both are part of WhatsApp itself, so they work without any extra app.',
  },
  {
    question: 'Can I underline text in WhatsApp?',
    answer:
      'WhatsApp’s formatting list has no underline. It covers bold, italic, strikethrough, monospace, inline code, bulleted lists, numbered lists and quotes, and this tool offers exactly those.',
  },
  {
    question: 'Do you store the message I type?',
    answer:
      'No. The formatting is done inside your browser. The message you type is never sent to Vyostra AI or saved anywhere, and it is gone when you close the page.',
  },
  {
    question: 'Is this the same as a WhatsApp fonts generator?',
    answer:
      'No. A fonts generator swaps your letters for look-alike special characters. This tool uses WhatsApp’s own formatting, which is ordinary text with a few symbols around it, so the message stays normal text that anyone can read, search and copy.',
  },
  {
    question: 'Can the person I message turn the formatting off?',
    answer: 'No. WhatsApp says there is no option to disable message formatting, so a formatted message is shown formatted to whoever receives it.',
  },
]

const WAYS_TO_USE: readonly { title: string; body: string }[] = [
  { title: 'Announcements and offers', body: 'Put the one thing people must not miss in bold, such as a date, a price or a deadline, and leave the rest plain.' },
  { title: 'Price lists and menus', body: 'A bulleted or numbered list is easier to read on a phone than one long paragraph with commas.' },
  { title: 'Order and booking codes', body: 'Inline code or monospace makes a reference number stand out, so the customer copies the right characters.' },
  { title: 'Replies to a question', body: 'Quote the line you are answering, then reply under it, so the answer still makes sense when read later.' },
]

function InlineNodes({ nodes }: { nodes: readonly InlineNode[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        if (node.type === 'text') return <span key={index}>{node.text}</span>
        if (node.type === 'code') return <code key={index} className="rounded bg-black/10 px-1 font-mono text-[0.9em]">{node.text}</code>
        if (node.type === 'monospace') return <span key={index} className="font-mono">{node.text}</span>
        if (node.type === 'bold') return <strong key={index}><InlineNodes nodes={node.children} /></strong>
        if (node.type === 'italic') return <em key={index}><InlineNodes nodes={node.children} /></em>
        return <s key={index}><InlineNodes nodes={node.children} /></s>
      })}
    </>
  )
}

function Block({ block }: { block: MessageBlock }) {
  if (block.type === 'bullets') {
    return (
      <ul className="list-disc pl-5">
        {block.items.map((item, index) => <li key={index}><InlineNodes nodes={item} /></li>)}
      </ul>
    )
  }
  if (block.type === 'numbers') {
    return (
      <ol className="pl-1">
        {block.items.map((item, index) => (
          <li key={index} className="flex gap-2"><span>{item.marker}</span><span><InlineNodes nodes={item.children} /></span></li>
        ))}
      </ol>
    )
  }
  if (block.type === 'quote') {
    return <blockquote className="border-l-4 border-black/25 pl-2 text-[#111b21]/75"><InlineNodes nodes={block.children} /></blockquote>
  }
  // An empty line still takes a line's height, as it does in WhatsApp.
  return <p className="min-h-[1.25rem]"><InlineNodes nodes={block.children} /></p>
}

/** The message as a sent WhatsApp bubble. A guide: WhatsApp has the final say on how it draws a message. */
function MessagePreview({ message }: { message: string }) {
  return (
    <div className="rounded-xl bg-[#efeae2] p-4">
      <div className="ml-auto w-fit max-w-[90%] break-words rounded-2xl rounded-tr-sm bg-[#d9fdd3] px-3.5 py-2 text-sm leading-5 text-[#111b21] shadow-xs">
        {parseWhatsAppMessage(message).map((block, index) => <Block key={index} block={block} />)}
      </div>
    </div>
  )
}

function FormatToolbar({ onFormat }: { onFormat: (id: WhatsAppFormatId) => void }) {
  return (
    <div role="toolbar" aria-label="Formatting" className="mb-3 flex flex-wrap gap-2">
      {WHATSAPP_FORMATS.map((format) => {
        const Icon = FORMAT_ICON[format.id]
        return (
          <button
            key={format.id}
            type="button"
            // Keeps the selection in the message box: a button that took focus would clear it on some phones.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onFormat(format.id)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-outline-variant bg-white px-3 text-sm font-semibold text-on-surface transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 cursor-pointer"
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {format.label}
          </button>
        )
      })}
    </div>
  )
}

function FormatterOutput({ message }: { message: string }) {
  return (
    <div className="tool-pop space-y-5">
      <div>
        <p className={FIELD_LABEL}>How it will look in WhatsApp</p>
        <MessagePreview message={message} />
        <p className={FIELD_HINT}>A guide, drawn from WhatsApp&rsquo;s published rules. Send it to yourself first if the layout matters.</p>
      </div>
      <div>
        {/* The tool's name only: the message stays in the browser. */}
        <CopyButton text={message} label="Copy message" onCopied={() => trackEvent('tool_used', { tool: TOOL_ID })} />
        <p className={FIELD_HINT}>Paste it into any WhatsApp chat. The symbols turn into formatting when you send it.</p>
      </div>
    </div>
  )
}

/** Fills the output column until there is a message, so the card never has a blank half. */
function FormatterPending({ onExample }: { onExample: () => void }) {
  return (
    <div className="flex min-h-56 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-outline-variant bg-white/60 p-8 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary-light text-primary" aria-hidden="true">
        <MessageSquareText className="h-6 w-6" />
      </span>
      <p className="mb-4 text-sm leading-relaxed text-on-surface-variant">Type a message to see how it will look in WhatsApp.</p>
      <button type="button" onClick={onExample} className={SECONDARY_BUTTON}>
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        Try an example
      </button>
    </div>
  )
}

/**
 * The message box and what is selected in it. A format changes both, and the
 * new selection can only be applied once React has put the new text in the box,
 * so it waits in a ref for the effect that follows.
 */
function useMessageBox() {
  const [message, setMessage] = useState('')
  const box = useRef<HTMLTextAreaElement>(null)
  const pending = useRef<{ start: number; end: number } | null>(null)

  useEffect(() => {
    if (!pending.current || !box.current) return
    box.current.focus()
    box.current.setSelectionRange(pending.current.start, pending.current.end)
    pending.current = null
  }, [message])

  function format(id: WhatsAppFormatId): void {
    const current: TextSelection = { text: message, start: box.current?.selectionStart ?? message.length, end: box.current?.selectionEnd ?? message.length }
    const next = applyWhatsAppFormat(current, id)
    pending.current = { start: next.start, end: next.end }
    setMessage(next.text)
  }

  return { message, setMessage, box, format }
}

interface MessageFieldProps {
  message: string
  box: RefObject<HTMLTextAreaElement>
  onMessage: (message: string) => void
  onFormat: (id: WhatsAppFormatId) => void
}

function MessageField({ message, box, onMessage, onFormat }: MessageFieldProps) {
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    const id = event.ctrlKey || event.metaKey ? SHORTCUTS[event.key.toLowerCase()] : undefined
    if (!id) return
    event.preventDefault()
    onFormat(id)
  }

  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <label htmlFor="wa-format-message" className={FIELD_LABEL}>Your message</label>
      <FormatToolbar onFormat={onFormat} />
      <textarea
        id="wa-format-message"
        ref={box}
        rows={10}
        value={message}
        onChange={(event) => onMessage(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Type or paste your message, select some words, then press a button above."
        className={FIELD_INPUT}
        aria-describedby="wa-format-hint"
      />
      <div className="mt-1.5 flex items-start justify-between gap-4">
        <p id="wa-format-hint" className="text-sm text-on-surface-variant">Select words, then press a button. Lists and quotes apply to whole lines.</p>
        {message ? (
          <button type="button" onClick={() => onMessage('')} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-semibold text-on-surface-variant hover:text-primary cursor-pointer">
            <Eraser className="h-4 w-4" aria-hidden="true" />
            Clear
          </button>
        ) : null}
      </div>
    </form>
  )
}

export function TextFormatter() {
  const { message, setMessage, box, format } = useMessageBox()

  return (
    <ToolCard
      inputTitle="Write and format"
      outputTitle="Preview and copy"
      input={<MessageField message={message} box={box} onMessage={setMessage} onFormat={format} />}
      output={message.trim() ? <FormatterOutput message={message} /> : <FormatterPending onExample={() => setMessage(EXAMPLE_MESSAGE)} />}
    />
  )
}

function FormatTable() {
  return (
    <section className="mx-auto mb-20 max-w-3xl">
      <h2 className={SECTION_HEADING}>How do you make text bold in WhatsApp?</h2>
      <div className={PROSE}>
        <p>
          Put an asterisk on both sides of the text, like <span className="font-mono text-on-surface">*this*</span>. WhatsApp shows the words in bold and hides the
          asterisks. Every other format works the same way: a symbol on both sides of the words, or a marker at the start of a line.
        </p>
        <div className="overflow-x-auto rounded-2xl border border-outline-variant/40 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-container-low text-on-surface">
              <tr>
                <th scope="col" className="px-4 py-3 font-bold">Format</th>
                <th scope="col" className="px-4 py-3 font-bold">What you type</th>
                <th scope="col" className="px-4 py-3 font-bold">The rule</th>
              </tr>
            </thead>
            <tbody>
              {WHATSAPP_FORMATS.map((format) => (
                <tr key={format.id} className="border-t border-outline-variant/30">
                  <th scope="row" className="px-4 py-3 font-semibold text-on-surface">{format.label}</th>
                  <td className="px-4 py-3 font-mono text-on-surface">{format.example}</td>
                  <td className="px-4 py-3">{format.rule}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          These are WhatsApp&rsquo;s own rules, from its help article{' '}
          <a href={WHATSAPP_FORMAT_DOCS} target="_blank" rel="noopener noreferrer" className={TEXT_LINK}>How to format your messages</a> (checked 6 October
          2026). There is no setting to switch formatting off.
        </p>
      </div>
    </section>
  )
}

function WaysToUse() {
  return (
    <section className="mx-auto mb-20 max-w-5xl">
      <h2 className={SECTION_HEADING}>When is formatting worth using?</h2>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {WAYS_TO_USE.map((way) => (
          <div key={way.title} className="rounded-2xl border border-outline-variant/30 bg-white p-6 shadow-xs">
            <h3 className="mb-2 text-base font-bold text-on-surface">{way.title}</h3>
            <p className="text-sm leading-relaxed text-on-surface-variant">{way.body}</p>
          </div>
        ))}
      </div>
      <p className="mx-auto mt-8 max-w-3xl text-center text-base text-on-surface-variant">
        Need people to reach you first? Make a <Link to="/tools/whatsapp-qr-code-generator" className={TEXT_LINK}>WhatsApp QR code</Link> or a{' '}
        <Link to="/whatsapp-link-generator" className={TEXT_LINK}>click-to-chat link</Link>.
      </p>
    </section>
  )
}

function NextStep() {
  return (
    <section className="mx-auto mt-20 max-w-3xl rounded-3xl bg-on-surface p-10 text-center text-white">
      <h2 className="mb-4 text-2xl font-extrabold md:text-3xl">Who answers when a customer writes back?</h2>
      <p className="mb-8 leading-relaxed text-white/80">
        A clear message gets replies; someone still has to answer them. Vyostra AI captures leads on your website with an AI agent and sends each one to your
        WhatsApp the moment it arrives.
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

export default function WhatsAppTextFormatter() {
  return (
    <>
      <PageMeta
        title="WhatsApp Text Formatter: Bold, Italic, Lists — Vyostra AI"
        description="Format a WhatsApp message with bold, italic, strikethrough, monospace, lists and quotes, and preview it before you send. Free, no sign-up, in your browser."
        path={PAGE.path}
      />
      <StructuredData data={jsonLdGraph([organizationSchema(), ...toolPageNodes(PAGE), faqPageSchema(TEXT_FORMATTER_FAQ)])} />
      <MarketingPageShell
        badge="FREE TOOL"
        headline="WhatsApp text formatter"
        lead="The Vyostra AI WhatsApp text formatter adds WhatsApp's formatting to a message for you: bold, italic, strikethrough, monospace, inline code, lists and quotes. Type or paste your text, select some words, press a button, check the preview, then copy the message into WhatsApp. It is free, needs no sign-up, and runs entirely in your browser."
      >
        <section className="mx-auto mb-20 max-w-5xl">
          <h2 className={SECTION_HEADING}>What do you want your message to say?</h2>
          <TextFormatter />
        </section>
        <FormatTable />
        <WaysToUse />
        <section className="mx-auto max-w-3xl">
          <h2 className={SECTION_HEADING}>What do people ask about WhatsApp formatting?</h2>
          <FaqList items={TEXT_FORMATTER_FAQ} />
        </section>
        <NextStep />
      </MarketingPageShell>
    </>
  )
}
