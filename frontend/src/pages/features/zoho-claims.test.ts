import { describe, expect, it } from 'vitest'
import { LEAD_CRM_FAQ } from './Crm'

/**
 * What reaches Zoho CRM is decided in backend/src/services/crm-service.ts:
 * only form-lead-service and meta-lead-service call it. Chat and voice leads
 * stay in the Vyostra AI CRM. The site said "every new lead" syncs from five
 * places, so each claim is pinned here against the backend's actual sources.
 */

const marketingSources: Record<string, string> = import.meta.glob<string>(
  [
    '../*.tsx',
    './*.tsx',
    '../../components/landing/**/*.tsx',
    '!../**/*.test.tsx',
    '!../../components/landing/TestimonialsSection.tsx',
  ],
  { query: '?raw', import: 'default', eager: true },
)

const OVERSTATED = [
  /every new lead is then sent to Zoho/i,
  /All new leads sync automatically/i,
  /pushed to Zoho/i,
  /Every new lead syncs automatically/i,
]

describe('Zoho CRM sync claims', () => {
  it('finds the files it checks', () => {
    expect(Object.keys(marketingSources).length).toBeGreaterThan(10)
  })

  it.each(Object.entries(marketingSources))('%s does not say every lead reaches Zoho', (_file, source) => {
    expect(OVERSTATED.filter((pattern) => pattern.test(source))).toEqual([])
  })

  it('names the two lead sources that sync in the CRM FAQ', () => {
    const answer = LEAD_CRM_FAQ.find((item) => /Zoho/.test(item.question + item.answer))?.answer ?? ''
    expect(answer).toMatch(/lead form/)
    expect(answer).toMatch(/Meta lead ad/)
  })
})
