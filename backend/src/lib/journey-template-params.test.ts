import { describe, expect, it } from 'vitest'

import { resolveTemplateParams } from '../lib/journey-template-params.js'
import type { JourneyLead } from '../types/index.js'

const lead: JourneyLead = {
  leadId: 'lead-1',
  clientId: 'client-1',
  source: 'chat',
  name: 'Ravi',
  phone: '919876543210',
  propertyInterest: '3 BHK in Wakad',
}

describe('resolveTemplateParams', () => {
  it('resolves lead references and passes literals through', () => {
    expect(resolveTemplateParams(['{{lead.name}}', 'Skyline Residences', '{{lead.propertyInterest}}'], lead)).toEqual([
      'Ravi',
      'Skyline Residences',
      '3 BHK in Wakad',
    ])
  })

  // Meta rejects an empty or whitespace-only parameter (132000), so a missing
  // field must never resolve to ''. A slightly generic message beats no message.
  it('never yields an empty parameter for a missing field', () => {
    const anonymous: JourneyLead = { leadId: 'l', clientId: 'c', source: 'chat' }
    expect(resolveTemplateParams(['{{lead.name}}', '{{lead.budgetRange}}'], anonymous)).toEqual(['there', 'there'])
  })

  it('never leaks an unresolved placeholder to a real person', () => {
    expect(resolveTemplateParams(['{{lead.secretField}}'], lead)).toEqual(['there'])
    expect(resolveTemplateParams(['{{lead.name}}'], lead)[0]).not.toContain('{{')
  })

  it('treats whitespace-only field values as missing', () => {
    expect(resolveTemplateParams(['{{lead.name}}'], { ...lead, name: '   ' })).toEqual(['there'])
  })

  it('tolerates surrounding whitespace in the placeholder itself', () => {
    expect(resolveTemplateParams(['  {{lead.name}}  '], lead)).toEqual(['Ravi'])
  })
})
