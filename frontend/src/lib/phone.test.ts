import { describe, expect, it } from 'vitest'
import { toDialNumber, toWhatsAppNumber } from './phone'

// The inbox holds free text from three different capture paths, so these are
// the shapes a real Indian lead actually arrives in.
describe('toWhatsAppNumber', () => {
  it('prefixes a bare 10-digit number with the India country code', () => {
    expect(toWhatsAppNumber('9648658889')).toBe('919648658889')
  })

  it('drops the domestic trunk prefix before adding the country code', () => {
    expect(toWhatsAppNumber('09648658889')).toBe('919648658889')
  })

  it('strips punctuation and spacing', () => {
    expect(toWhatsAppNumber('+91 96486 58889')).toBe('919648658889')
    expect(toWhatsAppNumber('(964) 865-8889')).toBe('919648658889')
  })

  it('trusts an explicit + and never applies the India default over it', () => {
    // A US number is 11 digits with its country code. Prefixing 91 would dial
    // a different country entirely.
    expect(toWhatsAppNumber('+1 415 555 0134')).toBe('14155550134')
  })

  it('treats 00 as an international prefix and removes it', () => {
    expect(toWhatsAppNumber('0044 7700 900123')).toBe('447700900123')
  })

  it('leaves a number that already carries a country code alone', () => {
    expect(toWhatsAppNumber('919648658889')).toBe('919648658889')
  })

  it('returns null for anything too short to dial', () => {
    expect(toWhatsAppNumber('12345')).toBeNull()
    expect(toWhatsAppNumber('+1 234')).toBeNull()
  })

  it('returns null for absent or non-numeric input', () => {
    expect(toWhatsAppNumber(undefined)).toBeNull()
    expect(toWhatsAppNumber('')).toBeNull()
    expect(toWhatsAppNumber('   ')).toBeNull()
    expect(toWhatsAppNumber('not a phone number')).toBeNull()
  })

  it('handles surrounding whitespace', () => {
    expect(toWhatsAppNumber('  9648658889  ')).toBe('919648658889')
  })

  // Multiple leading zeros are junk rather than a trunk prefix, but stripping
  // them all is what leaves a dialable national number behind.
  it('strips repeated leading zeros', () => {
    expect(toWhatsAppNumber('009648658889')).toBe('9648658889')
  })
})

// An account that has picked its country in Settings. The cases are the ways a
// local lead writes a number without its country code.
describe('toWhatsAppNumber with an account default country', () => {
  it('prefixes a bare US number with 1, not with the legacy India code', () => {
    expect(toWhatsAppNumber('(415) 555-0134', '1')).toBe('14155550134')
  })

  it('drops the trunk zero from a UK or UAE number before adding the code', () => {
    expect(toWhatsAppNumber('07700 900123', '44')).toBe('447700900123')
    expect(toWhatsAppNumber('050 123 4567', '971')).toBe('971501234567')
  })

  it('leaves a number that already carries its country code alone', () => {
    expect(toWhatsAppNumber('14155550134', '1')).toBe('14155550134')
    expect(toWhatsAppNumber('971501234567', '971')).toBe('971501234567')
  })

  it('never applies the default over an explicit +', () => {
    expect(toWhatsAppNumber('+91 96486 58889', '1')).toBe('919648658889')
  })

  it('returns null for a number too short for the country', () => {
    expect(toWhatsAppNumber('555 0134', '1')).toBeNull()
    expect(toWhatsAppNumber('12345', '44')).toBeNull()
  })
})

describe('toDialNumber', () => {
  it('keeps domestic formatting but strips punctuation', () => {
    expect(toDialNumber('(964) 865-8889')).toBe('9648658889')
  })

  it('preserves a leading + because tel: accepts it', () => {
    expect(toDialNumber('+91 96486 58889')).toBe('+919648658889')
  })

  it('does not add a country code', () => {
    expect(toDialNumber('9648658889')).toBe('9648658889')
  })

  it('returns null when nothing dialable remains', () => {
    expect(toDialNumber(undefined)).toBeNull()
    expect(toDialNumber('')).toBeNull()
    expect(toDialNumber('no digits here')).toBeNull()
  })
})
