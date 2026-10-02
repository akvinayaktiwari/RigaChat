import { describe, expect, it } from 'vitest'
import { DIAL_CODES, buildWhatsAppLink, internationalNumber, whatsAppLinkHtml } from './whatsapp-link'

function link(phone: string, message = '', countryCode = '91') {
  return buildWhatsAppLink({ countryCode, phone, message })
}

describe('internationalNumber', () => {
  it('joins the picked country code to the national number', () => {
    expect(internationalNumber('91', '98765 43210')).toBe('919876543210')
  })

  // wa.me rejects a number that still carries the domestic trunk 0.
  it('drops the leading zero dialled inside the country', () => {
    expect(internationalNumber('91', '098765-43210')).toBe('919876543210')
    expect(internationalNumber('+44', '(020) 7946 0958')).toBe('442079460958')
  })

  it('trusts a number that names its own country and ignores the picker', () => {
    expect(internationalNumber('91', '+971 50 123 4567')).toBe('971501234567')
    expect(internationalNumber('91', '00971 50 123 4567')).toBe('971501234567')
  })

  it('returns nothing for a number with no digits', () => {
    expect(internationalNumber('91', 'call me')).toBe('')
  })
})

describe('buildWhatsAppLink', () => {
  it('builds a bare wa.me link when there is no message', () => {
    expect(link('98765 43210')).toEqual({ ok: true, url: 'https://wa.me/919876543210', number: '919876543210' })
  })

  it('URL-encodes the pre-filled message', () => {
    const result = link('9876543210', 'Hi, is the 3BHK available? Budget ₹80L & up')
    expect(result.ok && result.url).toBe(
      'https://wa.me/919876543210?text=Hi%2C%20is%20the%203BHK%20available%3F%20Budget%20%E2%82%B980L%20%26%20up',
    )
  })

  it('keeps line breaks in the message', () => {
    const result = link('9876543210', 'Hello\nI saw your listing')
    expect(result.ok && result.url).toContain('?text=Hello%0AI%20saw%20your%20listing')
  })

  it('treats a message of only spaces as no message', () => {
    const result = link('9876543210', '   ')
    expect(result.ok && result.url).toBe('https://wa.me/919876543210')
  })

  it('says why it cannot build a link instead of building a broken one', () => {
    expect(link('')).toEqual({ ok: false, problem: 'empty' })
    expect(link('---')).toEqual({ ok: false, problem: 'empty' })
    expect(link('123')).toEqual({ ok: false, problem: 'too_short' })
    expect(link('1234567890123456')).toEqual({ ok: false, problem: 'too_long' })
    expect(link('+971 50')).toEqual({ ok: false, problem: 'too_short' })
  })

  it('never puts anything but digits in the number', () => {
    const result = link('+91 (98765) 43210 ext.')
    expect(result.ok && result.number).toMatch(/^\d+$/)
  })
})

describe('whatsAppLinkHtml', () => {
  it('wraps the link in an anchor that opens in a new tab', () => {
    expect(whatsAppLinkHtml('https://wa.me/919876543210', 'Chat on WhatsApp')).toBe(
      '<a href="https://wa.me/919876543210" target="_blank" rel="noopener">Chat on WhatsApp</a>',
    )
  })

  it('escapes a label that would otherwise close the tag', () => {
    expect(whatsAppLinkHtml('https://wa.me/1', '</a><script>"x"&')).toContain('&lt;/a&gt;&lt;script&gt;&quot;x&quot;&amp;')
  })
})

describe('DIAL_CODES', () => {
  it('holds digit-only codes and no country twice', () => {
    expect(DIAL_CODES.filter((entry) => !/^\d{1,3}$/.test(entry.code))).toEqual([])
    expect(new Set(DIAL_CODES.map((entry) => entry.country)).size).toBe(DIAL_CODES.length)
  })
})
