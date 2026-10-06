/**
 * What goes on a printed open house sign-in sheet, decided in one place so the
 * preview on the page and the paper that prints are the same thing.
 *
 * The module holds no legal text of its own beyond a neutral default consent
 * line the agent can edit. Whether a consent line is enough, and what else a
 * sheet must say, depends on the market and on what the agent does with the
 * details afterwards, so the page tells the agent to check their local rules
 * and their brokerage's policy instead of claiming a sheet is compliant.
 */

import { buildWhatsAppLink } from './whatsapp-link'

export type SignInFieldId = 'name' | 'phone' | 'email' | 'postcode' | 'withAgent' | 'preApproved' | 'source' | 'comments'

export interface SignInField {
  id: SignInFieldId
  /** The column heading on the sheet and the label of the checkbox that adds it. */
  label: string
  /** Relative width of the column, so a comments column is wider than a postcode one. */
  weight: number
  /** On when the page opens. Name is always on. */
  defaultOn: boolean
}

export const SIGN_IN_FIELDS: readonly SignInField[] = [
  { id: 'name', label: 'Name', weight: 3, defaultOn: true },
  { id: 'phone', label: 'Phone', weight: 3, defaultOn: true },
  { id: 'email', label: 'Email', weight: 4, defaultOn: true },
  { id: 'postcode', label: 'Postcode / ZIP', weight: 2, defaultOn: false },
  { id: 'withAgent', label: 'Working with an agent?', weight: 2, defaultOn: true },
  { id: 'preApproved', label: 'Pre-approved for a mortgage?', weight: 2, defaultOn: false },
  { id: 'source', label: 'How did you hear about this home?', weight: 3, defaultOn: false },
  { id: 'comments', label: 'Comments', weight: 4, defaultOn: false },
]

export const SIGN_IN_ROW_OPTIONS: readonly number[] = [10, 15, 20]
export const DEFAULT_ROW_COUNT = 15

export const DEFAULT_CONSENT_TEXT =
  'By writing my details here I agree that the agent named above may contact me about this property and similar ones. I can ask to be removed at any time.'

/** The chat message the sheet's QR code opens with. The address makes it say which home the person saw. */
export function whatsAppGreeting(address: string): string {
  const where = address.trim()
  return where ? `Hi, I just visited the open house at ${where}.` : 'Hi, I just visited your open house.'
}

export interface SignInSettings {
  agentName: string
  brokerage: string
  address: string
  /** ISO date, as a date input gives it: YYYY-MM-DD. Empty for a blank to fill in by hand. */
  date: string
  fields: readonly SignInFieldId[]
  rows: number
  includeConsent: boolean
  consentText: string
  /** Show a QR code that opens the agent's WhatsApp. */
  includeQr: boolean
  countryCode: string
  phone: string
}

export interface SignInSheet {
  heading: string
  details: string[]
  /** The agent's name alone, for the QR code's description. Empty when none was typed. */
  agentName: string
  columns: SignInField[]
  rows: number
  consent: string | null
  /** The wa.me link the QR code holds, or null when the agent asked for none or the number is not usable yet. */
  whatsAppUrl: string | null
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "2026-10-17" as "17 October 2026". Never goes through a time zone, so the day cannot shift. Empty if it is not a real date. */
export function formatSheetDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return ''
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const check = new Date(Date.UTC(year, month - 1, day))
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return ''
  return `${day} ${MONTHS[month - 1] ?? ''} ${year}`
}

/** Name is always a column, and columns keep the order of SIGN_IN_FIELDS however they were ticked. */
export function chosenColumns(ids: readonly SignInFieldId[]): SignInField[] {
  return SIGN_IN_FIELDS.filter((field) => field.id === 'name' || ids.includes(field.id))
}

export function defaultFieldIds(): SignInFieldId[] {
  return SIGN_IN_FIELDS.filter((field) => field.defaultOn).map((field) => field.id)
}

function detailLines(settings: SignInSettings): string[] {
  const agent = [settings.agentName.trim(), settings.brokerage.trim()].filter(Boolean).join(', ')
  const lines = [settings.address.trim(), formatSheetDate(settings.date), agent]
  return lines.filter((line) => line !== '')
}

function whatsAppUrlFor(settings: SignInSettings): string | null {
  if (!settings.includeQr) return null
  const link = buildWhatsAppLink({ countryCode: settings.countryCode, phone: settings.phone, message: whatsAppGreeting(settings.address) })
  return link.ok ? link.url : null
}

export function buildSignInSheet(settings: SignInSettings): SignInSheet {
  const consent = settings.consentText.trim()
  return {
    heading: 'Open house sign-in',
    details: detailLines(settings),
    agentName: settings.agentName.trim(),
    columns: chosenColumns(settings.fields),
    rows: settings.rows,
    consent: settings.includeConsent && consent ? consent : null,
    whatsAppUrl: whatsAppUrlFor(settings),
  }
}

/** Column widths as percentages that add to 100, in proportion to each field's weight, after a narrow numbering column. */
export function columnWidths(columns: readonly SignInField[]): number[] {
  const total = columns.reduce((sum, column) => sum + column.weight, 0)
  return columns.map((column) => Math.round((column.weight / total) * 1000) / 10)
}

/** The file types a logo may be, and the largest one. A bigger image would only slow the preview and print. */
export const LOGO_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
export const LOGO_MAX_BYTES = 2 * 1024 * 1024

export type LogoProblem = 'type' | 'size'

export function logoProblem(file: { type: string; size: number }): LogoProblem | null {
  if (!LOGO_TYPES.includes(file.type)) return 'type'
  if (file.size > LOGO_MAX_BYTES) return 'size'
  return null
}
