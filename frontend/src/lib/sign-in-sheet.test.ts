import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONSENT_TEXT,
  DEFAULT_ROW_COUNT,
  buildSignInSheet,
  chosenColumns,
  columnWidths,
  defaultFieldIds,
  formatSheetDate,
  logoProblem,
  whatsAppGreeting,
  type SignInSettings,
} from './sign-in-sheet'

function settings(overrides: Partial<SignInSettings>): SignInSettings {
  return {
    agentName: 'Sam Rivera',
    brokerage: 'Harbor Realty',
    address: '12 Example Street',
    date: '2026-10-17',
    fields: defaultFieldIds(),
    rows: DEFAULT_ROW_COUNT,
    includeConsent: true,
    consentText: DEFAULT_CONSENT_TEXT,
    includeQr: false,
    countryCode: '1',
    phone: '',
    ...overrides,
  }
}

describe('formatSheetDate', () => {
  it('writes the day, month name and year without touching a time zone', () => {
    expect(formatSheetDate('2026-10-17')).toBe('17 October 2026')
    expect(formatSheetDate('2026-01-01')).toBe('1 January 2026')
  })

  it('returns nothing for an empty or impossible date', () => {
    expect(formatSheetDate('')).toBe('')
    expect(formatSheetDate('2026-02-30')).toBe('')
    expect(formatSheetDate('17/10/2026')).toBe('')
  })
})

describe('chosenColumns', () => {
  it('always includes the name and keeps the field order', () => {
    expect(chosenColumns(['email']).map((column) => column.id)).toEqual(['name', 'email'])
    expect(chosenColumns(['comments', 'phone']).map((column) => column.id)).toEqual(['name', 'phone', 'comments'])
  })
})

describe('columnWidths', () => {
  it('shares the width in proportion to each weight, adding to 100', () => {
    const widths = columnWidths(chosenColumns(defaultFieldIds()))
    expect(Math.round(widths.reduce((sum, width) => sum + width, 0))).toBe(100)
    expect(widths[2]).toBeGreaterThan(widths[0] ?? 0)
  })
})

describe('buildSignInSheet', () => {
  it('lists the address, date and agent, and skips what is blank', () => {
    expect(buildSignInSheet(settings({})).details).toEqual(['12 Example Street', '17 October 2026', 'Sam Rivera, Harbor Realty'])
    expect(buildSignInSheet(settings({ address: ' ', date: '', brokerage: '' })).details).toEqual(['Sam Rivera'])
  })

  it('keeps the agent’s name apart from the other detail lines', () => {
    expect(buildSignInSheet(settings({ agentName: ' Sam Rivera ', address: '' })).agentName).toBe('Sam Rivera')
  })

  it('adds the consent line only when asked and not blank', () => {
    expect(buildSignInSheet(settings({})).consent).toBe(DEFAULT_CONSENT_TEXT)
    expect(buildSignInSheet(settings({ includeConsent: false })).consent).toBeNull()
    expect(buildSignInSheet(settings({ consentText: '  ' })).consent).toBeNull()
  })

  it('makes a WhatsApp link that names the home, only when the number is usable', () => {
    expect(buildSignInSheet(settings({ includeQr: true, phone: '' })).whatsAppUrl).toBeNull()
    const url = buildSignInSheet(settings({ includeQr: true, phone: '202 555 0147' })).whatsAppUrl
    expect(url).toBe(`https://wa.me/12025550147?text=${encodeURIComponent('Hi, I just visited the open house at 12 Example Street.')}`)
  })

  it('makes no link when the agent did not ask for a code', () => {
    expect(buildSignInSheet(settings({ includeQr: false, phone: '202 555 0147' })).whatsAppUrl).toBeNull()
  })
})

describe('whatsAppGreeting', () => {
  it('works without an address', () => {
    expect(whatsAppGreeting('')).toBe('Hi, I just visited your open house.')
  })
})

describe('logoProblem', () => {
  it('accepts an image of a normal size', () => {
    expect(logoProblem({ type: 'image/png', size: 1000 })).toBeNull()
  })

  it('refuses other types and large files', () => {
    expect(logoProblem({ type: 'application/pdf', size: 1000 })).toBe('type')
    expect(logoProblem({ type: 'image/png', size: 3 * 1024 * 1024 })).toBe('size')
  })
})
