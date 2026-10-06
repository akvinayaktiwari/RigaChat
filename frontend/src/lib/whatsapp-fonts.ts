/**
 * Unicode "fonts" for the free WhatsApp fonts tool.
 *
 * These are not fonts. Each style swaps the letters A-Z, a-z and the digits for
 * look-alike characters from other parts of Unicode (mostly the Mathematical
 * Alphanumeric Symbols block), so the result is ordinary text that survives
 * copy and paste into any app. That is also why it has limits: a screen reader
 * reads the characters by their Unicode names, search cannot match them to the
 * plain word, and a phone without a glyph for one shows an empty box.
 *
 * Code points come from the Unicode charts. A few letters in the script,
 * fraktur, double-struck and italic blocks are holes in the block because the
 * character already existed elsewhere (the "letterlike symbols" block), so
 * those letters are listed as exceptions rather than computed.
 */

export type WhatsAppFontId =
  | 'bold'
  | 'italic'
  | 'boldItalic'
  | 'script'
  | 'boldScript'
  | 'fraktur'
  | 'boldFraktur'
  | 'doubleStruck'
  | 'sans'
  | 'sansBold'
  | 'sansItalic'
  | 'sansBoldItalic'
  | 'monospace'
  | 'circled'
  | 'fullwidth'
  | 'smallCaps'

interface Alphabet {
  /** Code point of "A" and of "a" in the style. */
  upper: number
  lower: number
  /** Code point of "0", when the style has digits of its own. */
  digit?: number
  /** Letters whose code point is not upper/lower + offset, by the plain letter. */
  exceptions?: Readonly<Record<string, number>>
}

export interface WhatsAppFont {
  id: WhatsAppFontId
  label: string
  /** Appears in the style's row when it needs a warning of its own. */
  note?: string
  convert: (text: string) => string
}

const UPPER_A = 0x41
const LOWER_A = 0x61
const DIGIT_0 = 0x30
const LETTERS = 26
const DIGITS = 10

function mapChar(char: string, alphabet: Alphabet): string {
  const exception = alphabet.exceptions?.[char]
  if (exception !== undefined) return String.fromCodePoint(exception)
  const code = char.codePointAt(0) ?? 0
  if (code >= UPPER_A && code < UPPER_A + LETTERS) return String.fromCodePoint(alphabet.upper + code - UPPER_A)
  if (code >= LOWER_A && code < LOWER_A + LETTERS) return String.fromCodePoint(alphabet.lower + code - LOWER_A)
  if (alphabet.digit !== undefined && code >= DIGIT_0 && code < DIGIT_0 + DIGITS) return String.fromCodePoint(alphabet.digit + code - DIGIT_0)
  return char
}

function fromAlphabet(alphabet: Alphabet): (text: string) => string {
  return (text) => Array.from(text, (char) => mapChar(char, alphabet)).join('')
}

const SCRIPT_EXCEPTIONS: Record<string, number> = {
  B: 0x212c, E: 0x2130, F: 0x2131, H: 0x210b, I: 0x2110, L: 0x2112, M: 0x2133, R: 0x211b, e: 0x212f, g: 0x210a, o: 0x2134,
}
const FRAKTUR_EXCEPTIONS: Record<string, number> = { C: 0x212d, H: 0x210c, I: 0x2111, R: 0x211c, Z: 0x2128 }
const DOUBLE_STRUCK_EXCEPTIONS: Record<string, number> = { C: 0x2102, H: 0x210d, N: 0x2115, P: 0x2119, Q: 0x211a, R: 0x211d, Z: 0x2124 }

/** Circled digits 1-9 are 0x2460-0x2468 and 0 is 0x24EA, so they are not one run. */
function circled(text: string): string {
  const letters = fromAlphabet({ upper: 0x24b6, lower: 0x24d0 })
  return Array.from(letters(text), (char) => {
    if (char === '0') return String.fromCodePoint(0x24ea)
    if (char >= '1' && char <= '9') return String.fromCodePoint(0x2460 + char.charCodeAt(0) - '1'.charCodeAt(0))
    return char
  }).join('')
}

const SMALL_CAPS: Readonly<Record<string, string>> = {
  a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ',
  n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ',
}

function smallCaps(text: string): string {
  return Array.from(text, (char) => SMALL_CAPS[char.toLowerCase()] ?? char).join('')
}

export const WHATSAPP_FONTS: readonly WhatsAppFont[] = [
  { id: 'bold', label: 'Bold serif', convert: fromAlphabet({ upper: 0x1d400, lower: 0x1d41a, digit: 0x1d7ce }) },
  { id: 'italic', label: 'Italic serif', convert: fromAlphabet({ upper: 0x1d434, lower: 0x1d44e, exceptions: { h: 0x210e } }) },
  { id: 'boldItalic', label: 'Bold italic serif', convert: fromAlphabet({ upper: 0x1d468, lower: 0x1d482 }) },
  { id: 'script', label: 'Script', convert: fromAlphabet({ upper: 0x1d49c, lower: 0x1d4b6, exceptions: SCRIPT_EXCEPTIONS }) },
  { id: 'boldScript', label: 'Bold script', convert: fromAlphabet({ upper: 0x1d4d0, lower: 0x1d4ea }) },
  { id: 'fraktur', label: 'Gothic', convert: fromAlphabet({ upper: 0x1d504, lower: 0x1d51e, exceptions: FRAKTUR_EXCEPTIONS }) },
  { id: 'boldFraktur', label: 'Bold gothic', convert: fromAlphabet({ upper: 0x1d56c, lower: 0x1d586 }) },
  { id: 'doubleStruck', label: 'Double-struck', convert: fromAlphabet({ upper: 0x1d538, lower: 0x1d552, digit: 0x1d7d8, exceptions: DOUBLE_STRUCK_EXCEPTIONS }) },
  { id: 'sans', label: 'Sans', convert: fromAlphabet({ upper: 0x1d5a0, lower: 0x1d5ba, digit: 0x1d7e2 }) },
  { id: 'sansBold', label: 'Bold sans', convert: fromAlphabet({ upper: 0x1d5d4, lower: 0x1d5ee, digit: 0x1d7ec }) },
  { id: 'sansItalic', label: 'Italic sans', convert: fromAlphabet({ upper: 0x1d608, lower: 0x1d622 }) },
  { id: 'sansBoldItalic', label: 'Bold italic sans', convert: fromAlphabet({ upper: 0x1d63c, lower: 0x1d656 }) },
  { id: 'monospace', label: 'Typewriter', convert: fromAlphabet({ upper: 0x1d670, lower: 0x1d68a, digit: 0x1d7f6 }) },
  { id: 'circled', label: 'Circled', convert: circled },
  { id: 'fullwidth', label: 'Wide', convert: fromAlphabet({ upper: 0xff21, lower: 0xff41, digit: 0xff10 }) },
  { id: 'smallCaps', label: 'Small caps', note: 'Capitals and lowercase look the same, and digits stay plain.', convert: smallCaps },
]

export function convertWithFont(text: string, id: WhatsAppFontId): string {
  const font = WHATSAPP_FONTS.find((candidate) => candidate.id === id)
  if (!font) throw new Error(`Unknown WhatsApp font: ${id}`)
  return font.convert(text)
}
