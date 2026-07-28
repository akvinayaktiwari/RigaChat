import { describe, expect, it } from 'vitest'
import { normalizePhoneForMatching, phonesMatch } from './phone-match.js'

describe('normalizePhoneForMatching', () => {
  it('strips non-digit characters and keeps the last 10 digits', () => {
    expect(normalizePhoneForMatching('+91 82988 82194')).toBe('8298882194')
    expect(normalizePhoneForMatching('918298882194')).toBe('8298882194')
    expect(normalizePhoneForMatching('8298882194')).toBe('8298882194')
  })

  it('returns a short string unpadded when there are fewer than 10 digits', () => {
    expect(normalizePhoneForMatching('12345')).toBe('12345')
  })
})

describe('phonesMatch', () => {
  it('matches the same number across differing formats/country-code prefixes', () => {
    expect(phonesMatch('+91 82988 82194', '918298882194')).toBe(true)
    expect(phonesMatch('8298882194', '+918298882194')).toBe(true)
  })

  it('does not match different numbers', () => {
    expect(phonesMatch('8298882194', '9999999999')).toBe(false)
  })

  it('does not match when either number has fewer than 10 significant digits', () => {
    expect(phonesMatch('12345', '12345')).toBe(false)
  })
})
