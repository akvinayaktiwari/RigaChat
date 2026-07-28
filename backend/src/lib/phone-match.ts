// Best-effort phone matching, not a canonical format: Gupshup's inbound
// webhook carries a phone number in whatever format WhatsApp delivers it
// (country code prefixed, no "+", e.g. "918298882194"), while Lead.phone is
// whatever a client's lead-capture form/agent recorded (could be
// "+91 8298882194", "8298882194", or something else entirely -- no
// canonical format is enforced anywhere leads are created). Comparing the
// last 10 digits after stripping all non-digit characters is a common
// heuristic for matching across these differing conventions.
//
// Known limitation, stated plainly: this can produce a false match if two
// different real phone numbers happen to share the same last 10 digits
// (astronomically rare for real-world numbers, but not impossible), and a
// false negative if a number has fewer than 10 significant digits. Good
// enough for this pass; a real fix would normalize to E.164 at lead-capture
// time everywhere, which is a bigger, separate change to every lead-intake
// path in the app, not just this matcher.
const SIGNIFICANT_DIGITS = 10

export function normalizePhoneForMatching(phone: string): string {
  const digitsOnly = phone.replace(/\D/g, '')
  return digitsOnly.slice(-SIGNIFICANT_DIGITS)
}

export function phonesMatch(a: string, b: string): boolean {
  const normalizedA = normalizePhoneForMatching(a)
  const normalizedB = normalizePhoneForMatching(b)
  return normalizedA.length === SIGNIFICANT_DIGITS && normalizedA === normalizedB
}
