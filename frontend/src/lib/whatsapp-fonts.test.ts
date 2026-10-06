import { describe, expect, it } from 'vitest'
import { WHATSAPP_FONTS, convertWithFont } from './whatsapp-fonts'

describe('convertWithFont', () => {
  it('writes bold serif letters and digits', () => {
    expect(convertWithFont('Hello 2026', 'bold')).toBe('𝐇𝐞𝐥𝐥𝐨 𝟐𝟎𝟐𝟔')
  })

  it('writes script with the letterlike exceptions, not holes in the block', () => {
    expect(convertWithFont('Beg', 'script')).toBe('ℬℯℊ')
  })

  it('writes italic h as the Planck constant sign, the one gap in that block', () => {
    expect(convertWithFont('hi', 'italic')).toBe('ℎ𝑖')
  })

  it('writes gothic and double-struck exceptions', () => {
    expect(convertWithFont('CHZ', 'fraktur')).toBe('ℭℌℨ')
    expect(convertWithFont('NQR', 'doubleStruck')).toBe('ℕℚℝ')
  })

  it('writes circled digits, where zero is not next to one', () => {
    expect(convertWithFont('a0 1 9', 'circled')).toBe('ⓐ⓪ ① ⑨')
  })

  it('writes small caps for either case and keeps digits', () => {
    expect(convertWithFont('Sale 50', 'smallCaps')).toBe('ꜱᴀʟᴇ 50')
  })

  it('leaves spaces, punctuation, accents and emoji alone', () => {
    expect(convertWithFont('é, 😀!', 'bold')).toBe('é, 😀!')
  })

  it('does not split a character outside the basic plane', () => {
    expect(convertWithFont('😀a', 'sans')).toBe('😀𝖺')
  })

  it('turns an empty message into an empty one', () => {
    expect(WHATSAPP_FONTS.map((font) => font.convert(''))).toEqual(WHATSAPP_FONTS.map(() => ''))
  })

  it('maps every letter of every style to a different character from the plain one', () => {
    const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
    for (const font of WHATSAPP_FONTS) {
      const converted = Array.from(font.convert(alphabet))
      expect(converted).toHaveLength(52)
      // Small caps keeps "x" as it is; no other letter may survive unchanged.
      const unchanged = converted.filter((char, index) => char === alphabet[index])
      expect(unchanged.length, font.label).toBeLessThanOrEqual(font.id === 'smallCaps' ? 2 : 0)
    }
  })

  it('has a unique id and label for every style', () => {
    expect(new Set(WHATSAPP_FONTS.map((font) => font.id)).size).toBe(WHATSAPP_FONTS.length)
    expect(new Set(WHATSAPP_FONTS.map((font) => font.label)).size).toBe(WHATSAPP_FONTS.length)
  })

  it('throws for a style that does not exist', () => {
    expect(() => convertWithFont('a', 'nope' as never)).toThrow('Unknown WhatsApp font')
  })
})
