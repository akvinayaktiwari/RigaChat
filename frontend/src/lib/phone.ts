// wa.me needs a full international number with no punctuation and no leading
// zero. Real captured leads are nothing like that: the chat widget and the form
// builder both take free text, so the same inbox holds "1234567890",
// "09876543210" and "+91 98765 43210". Linking those straight through lands on
// WhatsApp's "phone number shared via url is invalid" page every time.
//
// DEFAULT_COUNTRY_CODE is India because that is who this product sells to
// (INR pricing, RERA compliance, Gupshup/WhatsApp-first). A bare 10-digit
// number is assumed Indian. Selling outside India means making this a per-client
// setting, not changing the constant.
const DEFAULT_COUNTRY_CODE = '91'
const NATIONAL_NUMBER_LENGTH = 10

/**
 * Best-effort E.164 digits (no `+`) for a wa.me link.
 *
 * Returns null when there is nothing plausible to dial, so callers can disable
 * the action rather than offer a link that is guaranteed to fail.
 */
export function toWhatsAppNumber(raw: string | undefined): string | null {
  if (!raw) return null

  const trimmed = raw.trim()
  // An explicit + means the author already told us the country code. Trust it
  // and never apply the India default over the top.
  const isExplicitlyInternational = trimmed.startsWith('+') || trimmed.startsWith('00')
  const digits = trimmed.replace(/\D/g, '')

  if (digits.length === 0) return null

  if (isExplicitlyInternational) {
    // "00" is the other international prefix; wa.me wants neither form.
    const withoutPrefix = trimmed.startsWith('00') ? digits.replace(/^00/, '') : digits
    return withoutPrefix.length >= NATIONAL_NUMBER_LENGTH ? withoutPrefix : null
  }

  // Domestic trunk prefix: 0 is dialled inside India and must be dropped.
  const national = digits.replace(/^0+/, '')

  if (national.length === NATIONAL_NUMBER_LENGTH) {
    return `${DEFAULT_COUNTRY_CODE}${national}`
  }

  // Already carries a country code (91 + 10 digits, or any other plausible
  // international length). Left alone rather than second-guessed.
  if (national.length > NATIONAL_NUMBER_LENGTH) return national

  // Shorter than a national number: a partial entry or junk. Nothing to dial.
  return null
}

/** `tel:` is happy with domestic formatting, so this only strips punctuation. */
export function toDialNumber(raw: string | undefined): string | null {
  if (!raw) return null
  const cleaned = raw.replace(/[^\d+]/g, '')
  return cleaned.length > 0 ? cleaned : null
}
