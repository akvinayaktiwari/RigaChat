import { describe, expect, it } from 'vitest'
import { normalizePhoneForMatching, phonesMatch } from './phone-match.js'

describe('normalizePhoneForMatching', () => {
  it('strips non-digit characters and keeps the last 10 digits', () => {
    expect(normalizePhoneForMatching('+91 98765 43210')).toBe('9876543210')
    expect(normalizePhoneForMatching('919876543210')).toBe('9876543210')
    expect(normalizePhoneForMatching('9876543210')).toBe('9876543210')
  })

  it('returns a short string unpadded when there are fewer than 10 digits', () => {
    expect(normalizePhoneForMatching('12345')).toBe('12345')
  })
})

describe('phonesMatch', () => {
  it('matches the same number across differing formats/country-code prefixes', () => {
    expect(phonesMatch('+91 98765 43210', '919876543210')).toBe(true)
    expect(phonesMatch('9876543210', '+919876543210')).toBe(true)
  })

  it('does not match different numbers', () => {
    expect(phonesMatch('9876543210', '9999999999')).toBe(false)
  })

  it('does not match when either number has fewer than 10 significant digits', () => {
    expect(phonesMatch('12345', '12345')).toBe(false)
  })
})
