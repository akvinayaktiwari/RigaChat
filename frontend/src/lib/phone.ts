// wa.me needs a full international number with no punctuation and no leading
// zero. Real captured leads are nothing like that: the chat widget and the form
// builder both take free text, so the same inbox holds "1234567890",
// "09876543210" and "+91 98765 43210". Linking those straight through lands on
// WhatsApp's "phone number shared via url is invalid" page every time.
//
// A lead typed without a country code needs one guessed. The guess is the
// account's own default country (Settings), because no single code is right
// for every customer. LEGACY_COUNTRY_CODE is what an account that has not
// chosen keeps getting: India, where the product started, so nothing changes
// for an existing account until it picks.
export const LEGACY_COUNTRY_CODE = '91'

// National number lengths, without the trunk zero. India and the +1 countries
// use exactly ten digits; elsewhere the length varies by country and by line
// type, so a range is the honest check.
const EXACT_NATIONAL_LENGTH: Record<string, number> = { '91': 10, '1': 10 }
const MIN_NATIONAL_LENGTH = 7
const MAX_NATIONAL_LENGTH = 10
/** Shortest full international number worth linking to. */
const MIN_INTERNATIONAL_LENGTH = 10

function isNationalNumber(national: string, countryCode: string): boolean {
  const exact = EXACT_NATIONAL_LENGTH[countryCode]
  if (exact !== undefined) return national.length === exact
  return national.length >= MIN_NATIONAL_LENGTH && national.length <= MAX_NATIONAL_LENGTH
}

/**
 * Best-effort E.164 digits (no `+`) for a wa.me link.
 *
 * Returns null when there is nothing plausible to dial, so callers can disable
 * the action rather than offer a link that is guaranteed to fail.
 *
 * Known limit: a national number longer than ten digits (some German mobiles)
 * reads as already carrying its country code and is left alone.
 */
export function toWhatsAppNumber(raw: string | undefined, defaultCountryCode: string = LEGACY_COUNTRY_CODE): string | null {
  if (!raw) return null

  const trimmed = raw.trim()
  // An explicit + means the author already told us the country code. Trust it
  // and never apply the account default over the top.
  const isExplicitlyInternational = trimmed.startsWith('+') || trimmed.startsWith('00')
  const digits = trimmed.replace(/\D/g, '')

  if (digits.length === 0) return null

  if (isExplicitlyInternational) {
    // "00" is the other international prefix; wa.me wants neither form.
    const withoutPrefix = trimmed.startsWith('00') ? digits.replace(/^00/, '') : digits
    return withoutPrefix.length >= MIN_INTERNATIONAL_LENGTH ? withoutPrefix : null
  }

  // Domestic trunk prefix: a leading 0 is dialled inside the country and must be dropped.
  const national = digits.replace(/^0+/, '')

  if (isNationalNumber(national, defaultCountryCode)) return `${defaultCountryCode}${national}`

  // Already carries a country code (91 + 10 digits, or any other plausible
  // international length). Left alone rather than second-guessed.
  if (national.length > MAX_NATIONAL_LENGTH) return national

  // Shorter than a national number: a partial entry or junk. Nothing to dial.
  return null
}

/** `tel:` is happy with domestic formatting, so this only strips punctuation. */
export function toDialNumber(raw: string | undefined): string | null {
  if (!raw) return null
  const cleaned = raw.replace(/[^\d+]/g, '')
  return cleaned.length > 0 ? cleaned : null
}
