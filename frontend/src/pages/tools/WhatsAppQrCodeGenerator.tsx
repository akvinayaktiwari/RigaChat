import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, Download, QrCode, ScanLine } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import FaqList from '../../components/landing/FaqList'
import MarketingPageShell from '../../components/landing/MarketingPageShell'
import PageMeta from '../../components/seo/PageMeta'
import StructuredData from '../../components/seo/StructuredData'
import ToolCard from '../../components/tools/ToolCard'
import WhatsAppNumberFields, {
  emptyWhatsAppNumber,
  numberProblemText,
  type WhatsAppNumberValue,
} from '../../components/tools/WhatsAppNumberFields'
import { FIELD_HINT, FIELD_INPUT, FIELD_LABEL, PRIMARY_BUTTON, PROSE, SECONDARY_BUTTON, SECTION_HEADING, TEXT_LINK } from '../../components/tools/tool-styles'
import { trackEvent } from '../../lib/analytics'
import {
  DEFAULT_QR_BACKGROUND,
  DEFAULT_QR_ERROR_LEVEL,
  DEFAULT_QR_FOREGROUND,
  DEFAULT_QR_MARGIN,
  DEFAULT_QR_SIZE,
  QR_CREDIT_TEXT,
  QR_ERROR_LEVELS,
  QR_ERROR_LEVEL_SOURCE,
  QR_MARGINS,
  QR_SIZES,
  qrColourProblem,
  qrFileName,
  qrLayout,
  qrSvgMarkup,
  type QrColourProblem,
  type QrErrorLevel,
  type QrLayout,
  type QrStyle,
} from '../../lib/qr-code'
import { qrPngBlob, qrSvgBlob, saveBlob } from '../../lib/qr-download'
import { faqPageSchema, jsonLdGraph, organizationSchema, toolPageNodes, type FaqItem } from '../../lib/structured-data'
import { buildWhatsAppLink } from '../../lib/whatsapp-link'

const PAGE = {
  name: 'WhatsApp QR Code Generator',
  path: '/tools/whatsapp-qr-code-generator/',
  description:
    'A free tool that turns a WhatsApp number and an optional pre-filled message into a QR code, downloadable as PNG or SVG. It runs in the browser.',
}

/** The name analytics sees. The number, the message and the colours never go with it. */
const TOOL_ID = 'whatsapp_qr_code_generator'
/** How wide the on-page preview is drawn. Downloads use the size the visitor picks. */
const PREVIEW_SIZE = 512

type QrEncoder = (text: string, errorLevel: QrErrorLevel) => boolean[][]

interface QrSettings extends QrStyle {
  errorLevel: QrErrorLevel
  size: number
}

const DEFAULT_SETTINGS: QrSettings = {
  errorLevel: DEFAULT_QR_ERROR_LEVEL,
  size: DEFAULT_QR_SIZE,
  margin: DEFAULT_QR_MARGIN,
  foreground: DEFAULT_QR_FOREGROUND,
  background: DEFAULT_QR_BACKGROUND,
  credit: true,
}

const COLOUR_WARNING: Record<QrColourProblem, string> = {
  invalid: 'Pick both colours again. One of them is not a colour this tool can draw.',
  inverted: 'A light code on a dark background does not scan in every app. Use the darker colour for the code, or test it on several phones first.',
  low_contrast: 'These two colours are close together, so the code may not scan. Test it before you use it.',
}

/**
 * Rendered on the page and published as FAQPage from this one array.
 *
 * The privacy answer is true because the code is drawn by lib/qr-code.ts in the
 * browser and the one analytics event this page sends carries only the tool's
 * name. The "does not expire" answer is true because the code holds the wa.me
 * link itself, with no redirect through this site.
 */
export const QR_GENERATOR_FAQ: FaqItem[] = [
  {
    question: 'Is the WhatsApp QR code generator free?',
    answer:
      'Yes. The Vyostra AI WhatsApp QR code generator is free, has no limit on the number of codes, and needs no account or sign-up. PNG and SVG downloads are both free.',
  },
  {
    question: 'Does a WhatsApp QR code made here expire?',
    answer:
      'No. The code holds the wa.me link itself, not a link that passes through Vyostra AI, so there is nothing that can expire and no limit on scans. It keeps working for as long as the number has an active WhatsApp account. To change the number or the message, make a new code.',
  },
  {
    question: 'Do you store the phone number or message I type?',
    answer:
      'No. The QR code is drawn inside your browser. The number and message you type are never sent to Vyostra AI or saved anywhere, and they are gone when you close the page. For the same reason this tool cannot count scans.',
  },
  {
    question: 'Is this the same as the WhatsApp Web QR code?',
    answer:
      'No. The WhatsApp Web QR code is shown by WhatsApp to link your own phone to a computer, and only WhatsApp can create it. The code made here is for your customers: scanning it opens a chat with your number.',
  },
  {
    question: 'Does someone need my number saved to scan the code?',
    answer:
      'No. Scanning the code opens a WhatsApp chat with your number directly, so the person does not have to save you as a contact first. They do need WhatsApp on their phone, and your number needs an active WhatsApp account.',
  },
  {
    question: 'Should I download the QR code as PNG or SVG?',
    answer:
      'Use PNG for websites, social posts and documents. Use SVG for print, because an SVG is drawn from shapes and stays sharp at any size, from a business card to a banner.',
  },
  {
    question: 'Does the QR code work with the WhatsApp Business app?',
    answer:
      'Yes. The code opens a wa.me link, which works for any number with an active WhatsApp account, whether it is on WhatsApp, the WhatsApp Business app or the WhatsApp Business Platform.',
  },
]

const PLACES_TO_USE: readonly { title: string; body: string }[] = [
  { title: 'A shop counter or window', body: 'People passing after hours can scan the code and leave a question that is waiting for you in the morning.' },
  { title: 'Business cards and flyers', body: 'A code is quicker than typing a number, and the pre-filled message tells you which flyer the person was holding.' },
  { title: 'Packaging, receipts and menus', body: 'Customers who already bought from you can reach you about an order without searching for your contact details.' },
  { title: 'Signboards and event stands', body: 'Print it large and choose a higher error correction level, so it still scans from a distance or after some wear.' },
]

/**
 * Loads the encoder after the page is on screen. It is the only part of this
 * tool with a library behind it, and this keeps it out of every other page.
 */
function useQrEncoder(): { encode: QrEncoder | null; failed: boolean } {
  const [encode, setEncode] = useState<QrEncoder | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    import('../../lib/qr-encode')
      .then((module) => {
        if (active) setEncode(() => module.qrModules)
      })
      .catch((error: unknown) => {
        console.error('The QR code encoder did not load.', error)
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [])

  return { encode, failed }
}

function isNumberValue(state: unknown): state is WhatsAppNumberValue {
  if (typeof state !== 'object' || state === null) return false
  const value = state as Record<string, unknown>
  return typeof value.countryCode === 'string' && typeof value.phone === 'string' && typeof value.message === 'string'
}

/**
 * The number handed over by the link generator's "Get QR code" button. It
 * travels as navigation state, which lives in the browser's history entry and
 * is never part of a URL, so it cannot reach a server log or analytics. Applied
 * after mount so the first render matches the prerendered page.
 */
function useHandedOverNumber(apply: (value: WhatsAppNumberValue) => void): void {
  const { state } = useLocation()

  useEffect(() => {
    if (isNumberValue(state)) apply({ countryCode: state.countryCode, phone: state.phone, message: state.message })
    // The handover happens once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

interface SelectFieldProps {
  id: string
  label: string
  value: string
  options: readonly { value: string; label: string }[]
  hint?: string
  onChange: (value: string) => void
}

function SelectField({ id, label, value, options, hint, onChange }: SelectFieldProps) {
  return (
    <div>
      <label htmlFor={id} className={FIELD_LABEL}>{label}</label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`${FIELD_INPUT} appearance-none pr-11 cursor-pointer`}
          aria-describedby={hint ? `${id}-hint` : undefined}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" aria-hidden="true" />
      </div>
      {hint ? <p id={`${id}-hint`} className={FIELD_HINT}>{hint}</p> : null}
    </div>
  )
}

function ColourField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label htmlFor={id} className={FIELD_LABEL}>{label}</label>
      <div className="flex items-center gap-3 rounded-xl border border-outline-variant bg-white px-3 py-2">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-10 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
        />
        <span className="font-mono text-sm text-on-surface-variant">{value.toUpperCase()}</span>
      </div>
    </div>
  )
}

const ERROR_LEVEL_OPTIONS = QR_ERROR_LEVELS.map((option) => ({ value: option.level, label: `${option.label} (${option.level})` }))
const SIZE_OPTIONS = QR_SIZES.map((size) => ({ value: String(size), label: `${size} px wide` }))
const MARGIN_OPTIONS = QR_MARGINS.map((margin) => ({ value: String(margin), label: margin === 1 ? '1 square' : `${margin} squares` }))

function isErrorLevel(value: string): value is QrErrorLevel {
  return QR_ERROR_LEVELS.some((option) => option.level === value)
}

function QrSettingsFields({ settings, onChange }: { settings: QrSettings; onChange: (settings: QrSettings) => void }) {
  const levelNote = QR_ERROR_LEVELS.find((option) => option.level === settings.errorLevel)?.note

  return (
    <fieldset className="space-y-5 border-t border-outline-variant/40 pt-5">
      <legend className="sr-only">How the code looks</legend>
      <div className="grid grid-cols-2 gap-4">
        <ColourField id="qr-foreground" label="Code colour" value={settings.foreground} onChange={(foreground) => onChange({ ...settings, foreground })} />
        <ColourField id="qr-background" label="Background" value={settings.background} onChange={(background) => onChange({ ...settings, background })} />
      </div>
      <SelectField
        id="qr-error-level"
        label="Error correction"
        value={settings.errorLevel}
        options={ERROR_LEVEL_OPTIONS}
        hint={levelNote}
        onChange={(value) => onChange(isErrorLevel(value) ? { ...settings, errorLevel: value } : settings)}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField id="qr-size" label="PNG size" value={String(settings.size)} options={SIZE_OPTIONS} onChange={(value) => onChange({ ...settings, size: Number(value) })} />
        <SelectField id="qr-margin" label="Blank border" value={String(settings.margin)} options={MARGIN_OPTIONS} onChange={(value) => onChange({ ...settings, margin: Number(value) })} />
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-on-surface">
        <input
          type="checkbox"
          checked={settings.credit}
          onChange={(event) => onChange({ ...settings, credit: event.target.checked })}
          className="h-5 w-5 shrink-0 cursor-pointer accent-primary"
        />
        <span>Add a small &ldquo;{QR_CREDIT_TEXT}&rdquo; line under the code</span>
      </label>
    </fieldset>
  )
}

function Warning({ children }: { children: string }) {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      {children}
    </p>
  )
}

type QrFormat = 'png' | 'svg'

async function saveQr(layout: QrLayout, number: string, size: number, format: QrFormat): Promise<void> {
  const blob = format === 'png' ? await qrPngBlob(layout, size) : qrSvgBlob(layout, size)
  saveBlob(blob, qrFileName(number, format))
  // The tool's name only: the number, the message and the colours stay in the browser.
  trackEvent('tool_used', { tool: TOOL_ID })
}

interface QrOutputProps {
  layout: QrLayout
  number: string
  size: number
  colourProblem: QrColourProblem | null
}

function QrOutput({ layout, number, size, colourProblem }: QrOutputProps) {
  const [saveError, setSaveError] = useState('')
  const preview = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvgMarkup(layout, PREVIEW_SIZE))}`

  async function save(format: QrFormat): Promise<void> {
    try {
      await saveQr(layout, number, size, format)
      setSaveError('')
    } catch (error: unknown) {
      console.error('The QR code could not be saved.', error)
      setSaveError(format === 'png' ? 'Your browser could not save the PNG. Try the SVG instead.' : 'Your browser could not save the file. Try again.')
    }
  }

  return (
    <div className="tool-pop space-y-5">
      <img
        src={preview}
        alt={`QR code that opens a WhatsApp chat with +${number}`}
        width={PREVIEW_SIZE}
        height={Math.round((PREVIEW_SIZE * layout.height) / layout.width)}
        className="mx-auto h-auto w-full max-w-64 rounded-2xl border border-outline-variant/40 bg-white shadow-xs"
      />
      {colourProblem ? <Warning>{COLOUR_WARNING[colourProblem]}</Warning> : null}
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => void save('png')} className={PRIMARY_BUTTON}>
          <Download className="h-4 w-4" aria-hidden="true" />
          Download PNG
        </button>
        <button type="button" onClick={() => void save('svg')} className={SECONDARY_BUTTON}>
          <Download className="h-4 w-4" aria-hidden="true" />
          Download SVG
        </button>
      </div>
      {saveError ? <Warning>{saveError}</Warning> : null}
      <p className="flex items-start gap-2 text-sm text-on-surface-variant">
        <ScanLine className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        Scan it before you print. Point your phone camera at this preview and check that WhatsApp opens with the right number and message.
      </p>
    </div>
  )
}

/** Fills the output column until there is a code, so the card never has a blank half. */
function QrPending({ text }: { text: string }) {
  return (
    <div className="flex min-h-56 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-outline-variant bg-white/60 p-8 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary-light text-primary" aria-hidden="true">
        <QrCode className="h-6 w-6" />
      </span>
      <p className="text-sm text-on-surface-variant leading-relaxed">{text}</p>
    </div>
  )
}

type QrDrawing = { layout: QrLayout } | { message: string }

/** The drawing for a link, or the one sentence that explains why there is none yet. */
function drawQr(url: string, settings: QrSettings, encode: QrEncoder | null, failed: boolean): QrDrawing {
  if (failed) return { message: 'The QR code could not load. Check your connection and reload the page.' }
  if (!encode) return { message: 'Preparing the QR code…' }
  try {
    return { layout: qrLayout(encode(url, settings.errorLevel), settings) }
  } catch (error: unknown) {
    console.error('The link does not fit in a QR code.', error)
    return { message: 'That message is too long for a QR code. Shorten it, or choose a lower error correction level.' }
  }
}

export function QrBuilder() {
  const [value, setValue] = useState(emptyWhatsAppNumber)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const { encode, failed } = useQrEncoder()
  useHandedOverNumber(setValue)

  const link = buildWhatsAppLink(value)
  const url = link.ok ? link.url : ''
  const drawing = useMemo(() => (url ? drawQr(url, settings, encode, failed) : null), [url, settings, encode, failed])

  function output(): JSX.Element {
    if (!link.ok) return <QrPending text={numberProblemText(link.problem, 'the QR code')} />
    if (!drawing || 'message' in drawing) return <QrPending text={drawing?.message ?? ''} />
    return <QrOutput layout={drawing.layout} number={link.number} size={settings.size} colourProblem={qrColourProblem(settings.foreground, settings.background)} />
  }

  return (
    <ToolCard
      inputTitle="Your details"
      outputTitle="Your QR code"
      input={
        <WhatsAppNumberFields value={value} onChange={setValue}>
          <QrSettingsFields settings={settings} onChange={setSettings} />
        </WhatsAppNumberFields>
      }
      output={output()}
    />
  )
}

function HowItWorks() {
  return (
    <section className="max-w-3xl mx-auto mb-20">
      <h2 className={SECTION_HEADING}>How does a WhatsApp QR code work?</h2>
      <div className={PROSE}>
        <p>
          A WhatsApp QR code is a picture of a click-to-chat link, a web address in the form{' '}
          <span className="font-mono text-on-surface">https://wa.me/&lt;number&gt;</span>. When someone points a phone camera at the code, the phone reads the
          link and opens a WhatsApp chat with that number. They do not need the number saved in their contacts.
        </p>
        <p>
          If you add a pre-filled message, it is stored in the same link. The person sees it in their text box and chooses whether to send it, so nothing is sent
          until they press send.
        </p>
        <p>
          The code is static: it holds the link itself and does not pass through Vyostra AI. That is why it never expires, and also why the number and message
          cannot be changed after printing. To change either, make a new code. If you only need the link, use the{' '}
          <Link to="/whatsapp-link-generator" className={TEXT_LINK}>WhatsApp link generator</Link>. To make the pre-filled message easier to read, use the{' '}
          <Link to="/tools/whatsapp-text-formatter" className={TEXT_LINK}>WhatsApp text formatter</Link>.
        </p>
      </div>
    </section>
  )
}

function Settings() {
  return (
    <section className="max-w-3xl mx-auto mb-20">
      <h2 className={SECTION_HEADING}>Which QR code settings should you choose?</h2>
      <div className={PROSE}>
        <p>The defaults work for most uses: a black code on white, medium error correction and a border of 4 squares. Change them only for a reason.</p>
        <ul className="list-disc space-y-3 pl-6">
          <li>
            <strong className="text-on-surface">Error correction</strong> lets a code be read when part of it is dirty or damaged. A higher level restores more of
            the code and makes it denser. Medium restores about 15% and is the level most often chosen; High restores about 25% and suits prints that get handled
            or dirty. Source:{' '}
            <a href={QR_ERROR_LEVEL_SOURCE} target="_blank" rel="noopener noreferrer" className={TEXT_LINK}>DENSO WAVE, the inventor of the QR Code</a> (checked
            6 October 2026).
          </li>
          <li>
            <strong className="text-on-surface">Colours</strong> should keep a dark code on a light background. The tool warns you when the two colours are close
            together or the wrong way round.
          </li>
          <li>
            <strong className="text-on-surface">Blank border</strong> is the empty space a scanner uses to find the code. Keep it, and leave more when the code sits
            on a busy design.
          </li>
          <li>
            <strong className="text-on-surface">File type</strong>: PNG for screens and documents, SVG for print, because an SVG stays sharp at any size.
          </li>
        </ul>
      </div>
    </section>
  )
}

function PlacesToUse() {
  return (
    <section className="max-w-5xl mx-auto mb-20">
      <h2 className={SECTION_HEADING}>Where can you use a WhatsApp QR code?</h2>
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
      <h2 className="text-2xl md:text-3xl font-extrabold mb-4">What happens after someone scans it?</h2>
      <p className="text-white/80 leading-relaxed mb-8">
        A QR code starts the conversation; someone still has to answer it. Vyostra AI captures leads on your website with an AI agent and sends each one to your
        WhatsApp the moment it arrives.
      </p>
      <Link
        to="/features/whatsapp"
        onClick={() => trackEvent('tool_cta_click', { tool: TOOL_ID })}
        className="inline-flex items-center justify-center rounded-xl bg-primary px-8 py-4 font-bold text-white hover:opacity-95 transition-opacity"
      >
        See WhatsApp lead alerts
      </Link>
    </section>
  )
}

export default function WhatsAppQrCodeGenerator() {
  return (
    <>
      <PageMeta
        title="Free WhatsApp QR Code Generator — Vyostra AI"
        description="Create a QR code that opens a WhatsApp chat with your number and a pre-filled message. Free, no sign-up, PNG or SVG, and nothing leaves your browser."
        path={PAGE.path}
      />
      <StructuredData data={jsonLdGraph([organizationSchema(), ...toolPageNodes(PAGE), faqPageSchema(QR_GENERATOR_FAQ)])} />
      <MarketingPageShell
        badge="FREE TOOL"
        headline="WhatsApp QR code generator"
        lead="The Vyostra AI WhatsApp QR code generator turns a phone number and an optional pre-filled message into a QR code. Anyone who scans it with a phone camera opens a WhatsApp chat with that number, without saving it as a contact first. It is free, needs no sign-up, downloads as PNG or SVG, and runs entirely in your browser."
      >
        <section className="max-w-5xl mx-auto mb-20">
          <h2 className={SECTION_HEADING}>Which number should your QR code open?</h2>
          <QrBuilder />
        </section>
        <HowItWorks />
        <Settings />
        <PlacesToUse />
        <section className="max-w-3xl mx-auto">
          <h2 className={SECTION_HEADING}>What do people ask about WhatsApp QR codes?</h2>
          <FaqList items={QR_GENERATOR_FAQ} />
        </section>
        <NextStep />
      </MarketingPageShell>
    </>
  )
}
