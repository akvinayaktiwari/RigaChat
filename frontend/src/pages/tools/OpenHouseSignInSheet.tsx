import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { ImagePlus, Printer, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import FaqList from '../../components/landing/FaqList'
import MarketingPageShell from '../../components/landing/MarketingPageShell'
import PageMeta from '../../components/seo/PageMeta'
import StructuredData from '../../components/seo/StructuredData'
import ToolCard from '../../components/tools/ToolCard'
import { FIELD_HINT, FIELD_INPUT, FIELD_LABEL, PRIMARY_BUTTON, PROSE, SECONDARY_BUTTON, SECTION_HEADING, TEXT_LINK } from '../../components/tools/tool-styles'
import { useQrEncoder } from '../../hooks/useQrEncoder'
import { trackEvent } from '../../lib/analytics'
import { DEFAULT_QR_BACKGROUND, DEFAULT_QR_FOREGROUND, QR_CREDIT_TEXT, qrLayout, qrSvgMarkup } from '../../lib/qr-code'
import {
  DEFAULT_CONSENT_TEXT,
  DEFAULT_ROW_COUNT,
  SIGN_IN_FIELDS,
  SIGN_IN_ROW_OPTIONS,
  buildSignInSheet,
  columnWidths,
  defaultFieldIds,
  logoProblem,
  type SignInFieldId,
  type SignInSettings,
  type SignInSheet,
} from '../../lib/sign-in-sheet'
import { faqPageSchema, jsonLdGraph, organizationSchema, toolPageNodes, type FaqItem } from '../../lib/structured-data'
import { DIAL_CODES } from '../../lib/whatsapp-link'

const PAGE = {
  name: 'Open House Sign-In Sheet',
  path: '/tools/open-house-sign-in-sheet/',
  description:
    'A free printable open house sign-in sheet: add your name, brokerage, address and logo, choose the columns, add a QR code that opens your WhatsApp, and print. It runs in the browser.',
}

/** The name analytics sees. Nothing typed on the sheet goes with it. */
const TOOL_ID = 'open_house_sign_in_sheet'

const SHEET_ID = 'sign-in-sheet'
const QR_PIXELS = 160
const QR_MARGIN = 2

/**
 * Rendered on the page and published as FAQPage from this one array.
 *
 * No answer says what any law requires. It names the rules an agent should
 * check and sends them to their brokerage, because what counts as consent
 * differs by country and by what is done with the details. The privacy answer
 * is true because the sheet is built by lib/sign-in-sheet.ts in the browser,
 * the logo is read by the browser and never uploaded, and the one analytics
 * event carries only the tool's name.
 */
export const SIGN_IN_FAQ: FaqItem[] = [
  {
    question: 'What should an open house sign-in sheet include?',
    answer:
      'At least the visitor’s name and a way to reach them, with the property address and date at the top so the sheet can be matched to the event. Many agents add whether the visitor already works with an agent, since that decides how you follow up. Ask only for what you will use.',
  },
  {
    question: 'Is the sign-in sheet free to print?',
    answer: 'Yes. It is free, needs no account, and has no limit on how many sheets you make. The only mark on it is an optional “Made with vyostra.com” line, which you can turn off.',
  },
  {
    question: 'Do I need consent to contact people who sign in?',
    answer:
      'It depends on where you are and how you contact them. Rules such as the TCPA in the United States, the Spam Act 2003 in Australia and PECR in the United Kingdom cover marketing messages, and what counts as consent differs. The consent line on this sheet is a neutral starting point you can edit, not legal advice, so check it with your brokerage or a lawyer.',
  },
  {
    question: 'Can I put my logo on the sheet?',
    answer: 'Yes. Choose a PNG, JPEG, WebP or SVG file up to 2 MB. It is shown on the sheet by your own browser and is never uploaded to Vyostra AI.',
  },
  {
    question: 'What does the QR code do?',
    answer:
      'If you add your WhatsApp number, the sheet carries a QR code. A visitor who scans it opens a WhatsApp chat with you, with a message already saying they visited the open house at your address. Visitors who prefer not to write their details on paper can message you instead.',
  },
  {
    question: 'How do I print it?',
    answer:
      'Press Print and choose your printer. The sheet is laid out to print on its own, in landscape, so pick landscape if your print dialog does not. Check the preview in the dialog first, and if a row spills onto a second page, choose fewer rows.',
  },
  {
    question: 'Do you store what I type?',
    answer:
      'No. The sheet is built inside your browser. Your name, address, number and logo are never sent to Vyostra AI or saved, and they are gone when you close the page.',
  },
]

function useLogoUrl(): { url: string | null; error: string | null; choose: (file: File | undefined) => void; clear: () => void } {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // An object URL holds the file in memory until it is released.
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

  function choose(file: File | undefined): void {
    if (!file) return
    const problem = logoProblem(file)
    if (problem) {
      setError(problem === 'type' ? 'Choose a PNG, JPEG, WebP or SVG image.' : 'That image is over 2 MB. Choose a smaller one.')
      return
    }
    setError(null)
    setUrl(URL.createObjectURL(file))
  }

  return { url, error, choose, clear: () => { setUrl(null); setError(null) } }
}

function TextField(props: { id: string; label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label htmlFor={props.id} className={FIELD_LABEL}>{props.label}</label>
      <input id={props.id} type={props.type ?? 'text'} value={props.value} onChange={(event) => props.onChange(event.target.value)} placeholder={props.placeholder} autoComplete="off" className={FIELD_INPUT} />
    </div>
  )
}

function LogoField({ logo }: { logo: ReturnType<typeof useLogoUrl> }) {
  return (
    <div>
      <p className={FIELD_LABEL}>Logo (optional)</p>
      <div className="flex flex-wrap items-center gap-3">
        <label className={`${SECONDARY_BUTTON} relative`}>
          <ImagePlus className="h-4 w-4" aria-hidden="true" />
          {logo.url ? 'Change logo' : 'Choose a logo'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            aria-label="Logo file"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            onChange={(event: ChangeEvent<HTMLInputElement>) => logo.choose(event.target.files?.[0])}
          />
        </label>
        {logo.url ? (
          <button type="button" onClick={logo.clear} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-on-surface-variant hover:text-primary cursor-pointer">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Remove
          </button>
        ) : null}
      </div>
      {logo.error ? <p role="alert" className="mt-1.5 text-sm text-error">{logo.error}</p> : <p className={FIELD_HINT}>Stays in your browser. PNG, JPEG, WebP or SVG, up to 2 MB.</p>}
    </div>
  )
}

function ColumnChoices({ selected, onChange }: { selected: readonly SignInFieldId[]; onChange: (ids: SignInFieldId[]) => void }) {
  function toggle(id: SignInFieldId): void {
    onChange(selected.includes(id) ? selected.filter((candidate) => candidate !== id) : [...selected, id])
  }
  return (
    <fieldset>
      <legend className={FIELD_LABEL}>What should visitors write?</legend>
      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        {SIGN_IN_FIELDS.map((field) => (
          <label key={field.id} className="inline-flex min-h-11 items-center gap-2 text-sm text-on-surface cursor-pointer">
            <input type="checkbox" checked={field.id === 'name' || selected.includes(field.id)} disabled={field.id === 'name'} onChange={() => toggle(field.id)} className="h-4 w-4 accent-primary" />
            {field.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function ConsentAndQrFields({ settings, onChange }: { settings: SignInSettings; onChange: (settings: SignInSettings) => void }) {
  return (
    <>
      <div>
        <label className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-on-surface cursor-pointer">
          <input type="checkbox" checked={settings.includeConsent} onChange={(event) => onChange({ ...settings, includeConsent: event.target.checked })} className="h-4 w-4 accent-primary" />
          Add a consent line
        </label>
        {settings.includeConsent ? (
          <>
            <label htmlFor="sheet-consent" className="sr-only">Consent line</label>
            <textarea id="sheet-consent" rows={3} value={settings.consentText} onChange={(event) => onChange({ ...settings, consentText: event.target.value })} className={FIELD_INPUT} aria-describedby="sheet-consent-hint" />
            <p id="sheet-consent-hint" className={FIELD_HINT}>A neutral starting point. Check it against your local rules and your brokerage’s policy before you use it.</p>
          </>
        ) : null}
      </div>
      <div>
        <label className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-on-surface cursor-pointer">
          <input type="checkbox" checked={settings.includeQr} onChange={(event) => onChange({ ...settings, includeQr: event.target.checked })} className="h-4 w-4 accent-primary" />
          Add a QR code that opens my WhatsApp
        </label>
        {settings.includeQr ? (
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="sheet-country" className={FIELD_LABEL}>Country</label>
              <select id="sheet-country" value={settings.countryCode} onChange={(event) => onChange({ ...settings, countryCode: event.target.value })} className={FIELD_INPUT}>
                {DIAL_CODES.map((entry) => <option key={entry.country} value={entry.code}>{`${entry.country} (+${entry.code})`}</option>)}
              </select>
            </div>
            <TextField id="sheet-phone" label="WhatsApp number" type="tel" value={settings.phone} onChange={(phone) => onChange({ ...settings, phone })} />
          </div>
        ) : null}
      </div>
    </>
  )
}

interface SettingsFormProps {
  settings: SignInSettings
  logo: ReturnType<typeof useLogoUrl>
  onChange: (settings: SignInSettings) => void
}

function SettingsForm({ settings, logo, onChange }: SettingsFormProps) {
  return (
    <form onSubmit={(event) => event.preventDefault()} className="space-y-5">
      <TextField id="sheet-agent" label="Your name" value={settings.agentName} onChange={(agentName) => onChange({ ...settings, agentName })} />
      <TextField id="sheet-brokerage" label="Brokerage or agency" value={settings.brokerage} onChange={(brokerage) => onChange({ ...settings, brokerage })} />
      <TextField id="sheet-address" label="Property address" value={settings.address} onChange={(address) => onChange({ ...settings, address })} />
      <TextField id="sheet-date" label="Date of the open house" type="date" value={settings.date} onChange={(date) => onChange({ ...settings, date })} />
      <LogoField logo={logo} />
      <ColumnChoices selected={settings.fields} onChange={(fields) => onChange({ ...settings, fields })} />
      <div>
        <label htmlFor="sheet-rows" className={FIELD_LABEL}>Rows for visitors</label>
        <select id="sheet-rows" value={settings.rows} onChange={(event) => onChange({ ...settings, rows: Number(event.target.value) })} className={FIELD_INPUT}>
          {SIGN_IN_ROW_OPTIONS.map((count) => <option key={count} value={count}>{count}</option>)}
        </select>
      </div>
      <ConsentAndQrFields settings={settings} onChange={onChange} />
    </form>
  )
}

function PrintPanel() {
  return (
    <div className="space-y-4">
      {/* The tool's name only: nothing on the sheet goes with it. */}
      <button type="button" onClick={() => { trackEvent('tool_used', { tool: TOOL_ID }); window.print() }} className={PRIMARY_BUTTON}>
        <Printer className="h-4 w-4" aria-hidden="true" />
        Print the sheet
      </button>
      <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-on-surface-variant">
        <li>The sheet prints on its own, in landscape. The preview below is what you will get.</li>
        <li>In the print dialog, turn off “headers and footers” for a clean page.</li>
        <li>Scan the QR code with your own phone before you print a stack.</li>
        <li>Visitors’ details are personal data. Keep the sheets somewhere safe.</li>
      </ul>
      <p className={FIELD_HINT}>The consent line is a starting point, not legal advice.</p>
    </div>
  )
}

function SheetQr({ url, agent }: { url: string; agent: string }) {
  const { encode } = useQrEncoder()
  const source = useMemo(() => {
    if (!encode) return null
    const layout = qrLayout(encode(url, 'M'), { margin: QR_MARGIN, foreground: DEFAULT_QR_FOREGROUND, background: DEFAULT_QR_BACKGROUND, credit: false })
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvgMarkup(layout, QR_PIXELS))}`
  }, [encode, url])
  if (!source) return null
  return (
    <figure className="flex w-28 shrink-0 flex-col items-center text-center">
      <img src={source} alt={`QR code that opens a WhatsApp chat with ${agent || 'the agent'}`} width={QR_PIXELS} height={QR_PIXELS} className="h-28 w-28" />
      <figcaption className="text-[11px] leading-tight">Scan to message me on WhatsApp</figcaption>
    </figure>
  )
}

function SheetTable({ sheet }: { sheet: SignInSheet }) {
  const widths = columnWidths(sheet.columns)
  return (
    <table className="w-full table-fixed border-collapse text-left text-xs">
      <thead>
        <tr>
          <th scope="col" className="w-8 border border-black px-1.5 py-1.5"><span className="sr-only">Number</span></th>
          {sheet.columns.map((column, index) => (
            <th key={column.id} scope="col" style={{ width: `${widths[index]}%` }} className="border border-black px-1.5 py-1.5 font-bold">{column.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: sheet.rows }, (_, row) => (
          <tr key={row} className="h-[8mm]">
            <td className="border border-black px-1.5 text-center text-[10px] text-neutral-500">{row + 1}</td>
            {sheet.columns.map((column) => <td key={column.id} className="border border-black" />)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function SignInSheetView({ sheet, logoUrl, credit }: { sheet: SignInSheet; logoUrl: string | null; credit: boolean }) {
  return (
    <div id={SHEET_ID} className="mx-auto w-full max-w-5xl rounded-lg border border-outline-variant bg-white p-6 text-black shadow-md">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {logoUrl ? <img src={logoUrl} alt="Your logo" className="max-h-16 max-w-40 object-contain" /> : null}
          <div>
            <h3 className="text-2xl font-extrabold">{sheet.heading}</h3>
            {sheet.details.map((line, index) => <p key={index} className="text-sm">{line}</p>)}
          </div>
        </div>
        {sheet.whatsAppUrl ? <SheetQr url={sheet.whatsAppUrl} agent={sheet.agentName} /> : null}
      </header>
      <SheetTable sheet={sheet} />
      {sheet.consent ? <p className="mt-3 text-[11px] leading-snug">{sheet.consent}</p> : null}
      {credit ? <p className="mt-2 text-right text-[10px] text-neutral-500">{QR_CREDIT_TEXT}</p> : null}
    </div>
  )
}

/** Hides everything but the sheet while printing. It lives only as long as the tool is on the page. */
const PRINT_CSS = `@media print {
  body * { visibility: hidden !important; }
  #${SHEET_ID}, #${SHEET_ID} * { visibility: visible !important; }
  #${SHEET_ID} { position: absolute; left: 0; top: 0; width: 100%; max-width: none; margin: 0; border: 0; border-radius: 0; box-shadow: none; padding: 0; }
  @page { size: landscape; margin: 12mm; }
}`

const INITIAL_SETTINGS: SignInSettings = {
  agentName: '',
  brokerage: '',
  address: '',
  date: '',
  fields: defaultFieldIds(),
  rows: DEFAULT_ROW_COUNT,
  includeConsent: true,
  consentText: DEFAULT_CONSENT_TEXT,
  includeQr: false,
  countryCode: DIAL_CODES[0]?.code ?? '1',
  phone: '',
}

export function SignInSheetTool() {
  const [settings, setSettings] = useState<SignInSettings>(INITIAL_SETTINGS)
  const [credit, setCredit] = useState(true)
  const logo = useLogoUrl()
  const sheet = useMemo(() => buildSignInSheet(settings), [settings])

  return (
    <>
      <style>{PRINT_CSS}</style>
      <ToolCard
        inputTitle="Fill in the sheet"
        outputTitle="Print it"
        input={<SettingsForm settings={settings} logo={logo} onChange={setSettings} />}
        output={
          <>
            <PrintPanel />
            <label className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm text-on-surface cursor-pointer">
              <input type="checkbox" checked={credit} onChange={(event) => setCredit(event.target.checked)} className="h-4 w-4 accent-primary" />
              Add “{QR_CREDIT_TEXT}” to the sheet
            </label>
          </>
        }
      />
      <div className="mt-10">
        <h3 className="mb-4 text-center text-sm font-bold uppercase tracking-wider text-on-surface-variant">Preview</h3>
        <SignInSheetView sheet={sheet} logoUrl={logo.url} credit={credit} />
      </div>
    </>
  )
}

function NextStep() {
  return (
    <section className="mx-auto mt-20 max-w-3xl rounded-3xl bg-on-surface p-10 text-center text-white">
      <h2 className="mb-4 text-2xl font-extrabold md:text-3xl">Want sign-ins to land in a CRM instead of a folder?</h2>
      <p className="mb-8 leading-relaxed text-white/80">
        Paper sheets still have to be typed up. Vyostra AI captures leads on your website and from your ads into a lead list with the conversation attached, and
        follows up on WhatsApp.
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

export default function OpenHouseSignInSheet() {
  return (
    <>
      <PageMeta
        title="Open House Sign-In Sheet: Free Printable — Vyostra AI"
        description="Make a printable open house sign-in sheet with your name, address and logo, the columns you want and an optional WhatsApp QR code. Free, in your browser."
        path={PAGE.path}
      />
      <StructuredData data={jsonLdGraph([organizationSchema(), ...toolPageNodes(PAGE), faqPageSchema(SIGN_IN_FAQ)])} />
      <MarketingPageShell
        badge="FREE TOOL"
        headline="Open house sign-in sheet"
        lead="The Vyostra AI open house sign-in sheet makes a printable page for visitors to write their details on. Add your name, brokerage, the address, the date and a logo, choose which columns to include, add a QR code that opens your WhatsApp, and print. It is free, needs no sign-up, and runs entirely in your browser."
      >
        <section className="mx-auto mb-20 max-w-5xl">
          <h2 className={SECTION_HEADING}>What goes on your sign-in sheet?</h2>
          <SignInSheetTool />
        </section>
        <section className="mx-auto mb-20 max-w-3xl">
          <h2 className={SECTION_HEADING}>Before you collect visitors’ details</h2>
          <div className={PROSE}>
            <p>
              A sign-in sheet collects personal data, so decide what you will ask for and what you will do with it before the day. Ask only for what you will use,
              keep the sheets somewhere safe, and tell visitors how you will contact them. Rules on contacting people by phone, text or email differ by country,
              so check yours with your brokerage.
            </p>
            <p>
              Need people to message you straight away? Make a <Link to="/tools/whatsapp-qr-code-generator" className={TEXT_LINK}>WhatsApp QR code</Link> or a{' '}
              <Link to="/whatsapp-link-generator" className={TEXT_LINK}>click-to-chat link</Link>.
            </p>
          </div>
        </section>
        <section className="mx-auto max-w-3xl">
          <h2 className={SECTION_HEADING}>What do people ask about open house sign-in sheets?</h2>
          <FaqList items={SIGN_IN_FAQ} />
        </section>
        <NextStep />
      </MarketingPageShell>
    </>
  )
}
