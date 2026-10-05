/**
 * Builds wa.me click-to-chat links for the free link generator.
 *
 * WhatsApp's format is https://wa.me/<number>, where the number is in full
 * international form with no +, no leading zeros, no brackets and no dashes,
 * and an optional ?text= carrying a URL-encoded message. A link that breaks
 * any of that opens WhatsApp's "phone number shared via url is invalid" page,
 * so everything here either produces a link that works or says why it cannot.
 *
 * Unlike lib/phone.ts this never guesses a country: the person building the
 * link picks it.
 */

/** E.164 allows at most 15 digits, country code included. */
const MAX_NUMBER_DIGITS = 15
/** The shortest national numbers in use are 4 digits; anything less is a partial entry. */
const MIN_NATIONAL_DIGITS = 4

export interface DialCode {
  /** Country name as shown in the picker. */
  country: string
  /** Country calling code, digits only. */
  code: string
}

/**
 * The markets the product is sold in first, then the rest alphabetically. The
 * first entry is the picker's default, so the order is a product decision.
 */
export const DIAL_CODES: readonly DialCode[] = [
  { country: 'United States', code: '1' },
  { country: 'United Arab Emirates', code: '971' },
  { country: 'United Kingdom', code: '44' },
  { country: 'Australia', code: '61' },
  { country: 'India', code: '91' },
  { country: 'Canada', code: '1' },
  { country: 'Bahrain', code: '973' },
  { country: 'Bangladesh', code: '880' },
  { country: 'Brazil', code: '55' },
  { country: 'Germany', code: '49' },
  { country: 'Indonesia', code: '62' },
  { country: 'Kuwait', code: '965' },
  { country: 'Malaysia', code: '60' },
  { country: 'Nepal', code: '977' },
  { country: 'Nigeria', code: '234' },
  { country: 'Oman', code: '968' },
  { country: 'Pakistan', code: '92' },
  { country: 'Qatar', code: '974' },
  { country: 'Saudi Arabia', code: '966' },
  { country: 'Singapore', code: '65' },
  { country: 'South Africa', code: '27' },
  { country: 'Sri Lanka', code: '94' },
]

export interface WhatsAppLinkInput {
  /** Country calling code, with or without a +. Ignored when `phone` carries its own. */
  countryCode: string
  /** The number as typed: spaces, dashes, brackets and a leading 0 are all fine. */
  phone: string
  /** Text to pre-fill in the chat. Empty for none. */
  message: string
}

export type WhatsAppLinkProblem = 'empty' | 'too_short' | 'too_long'

export type WhatsAppLinkResult = { ok: true; url: string; number: string } | { ok: false; problem: WhatsAppLinkProblem }

function digitsOf(value: string): string {
  return value.replace(/\D/g, '')
}

/**
 * The full international number, digits only.
 *
 * A number typed with + or 00 already names its country, so the picker is
 * ignored. Otherwise the leading zeros are a domestic trunk prefix, which is
 * dialled inside the country and never part of the international number.
 */
export function internationalNumber(countryCode: string, phone: string): string {
  const trimmed = phone.trim()
  if (trimmed.startsWith('+')) return digitsOf(trimmed)
  if (trimmed.startsWith('00')) return digitsOf(trimmed).replace(/^00/, '')
  const national = digitsOf(trimmed).replace(/^0+/, '')
  return national ? `${digitsOf(countryCode)}${national}` : ''
}

/** Whether the phone field names its own country, with + or the 00 prefix. */
function namesItsCountry(phone: string): boolean {
  const trimmed = phone.trim()
  return trimmed.startsWith('+') || trimmed.startsWith('00')
}

export function buildWhatsAppLink(input: WhatsAppLinkInput): WhatsAppLinkResult {
  if (digitsOf(input.phone).length === 0) return { ok: false, problem: 'empty' }

  const number = internationalNumber(input.countryCode, input.phone)
  // A typed country code is 1 to 3 digits; assume the longest so a partial number is still caught.
  const countryDigits = namesItsCountry(input.phone) ? 3 : digitsOf(input.countryCode).length
  if (number.length > MAX_NUMBER_DIGITS) return { ok: false, problem: 'too_long' }
  if (number.length - countryDigits < MIN_NATIONAL_DIGITS) return { ok: false, problem: 'too_short' }

  const message = input.message.trim()
  const query = message ? `?text=${encodeURIComponent(message)}` : ''
  return { ok: true, url: `https://wa.me/${number}${query}`, number }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** An HTML link to paste into a web page. Label and URL are escaped, so the snippet cannot break out of its tag. */
export function whatsAppLinkHtml(url: string, label: string): string {
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`
}
