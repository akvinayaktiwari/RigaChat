import { describe, expect, it } from 'vitest'
import type { FormField } from '../types/index.js'
import { toPublicWebsiteUrl, zohoProvider } from './zoho-provider.js'

// mapLead is the only place a captured lead is translated into Zoho's field
// names. Anything it fails to recognise does not error -- it silently lands in
// Description, which is how a client's Email column ended up empty in Zoho
// while the address sat in the notes.

const SOURCE_URL = 'https://wonderise-zoya-site.s3.ap-south-1.amazonaws.com/index.html'

function field(partial: Partial<FormField> & { fieldId: string; label: string; type: FormField['type'] }): FormField {
  return { required: false, ...partial }
}

describe('mapLead', () => {
  // The live "Zoya" form saved its Email field as plain text. The address has
  // to reach Zoho's Email field on the label alone.
  it('maps an email field that was saved as plain text', () => {
    const fields: FormField[] = [
      field({ fieldId: 'f1', label: 'Name', type: 'text' }),
      field({ fieldId: 'f2', label: 'Phone', type: 'phone' }),
      field({ fieldId: 'f3', label: 'Interested In', type: 'options' }),
      field({ fieldId: 'f4', label: 'Email', type: 'text' }),
      field({ fieldId: 'f5', label: 'Buyer Type', type: 'text' }),
    ]

    const lead = zohoProvider.mapLead(
      { f1: 'Test', f2: '9648658889', f3: '4 BHK', f4: 'test@gmail.com', f5: 'investor' },
      fields,
      SOURCE_URL
    )

    expect(lead.email).toBe('test@gmail.com')
    expect(lead.lastName).toBe('Test')
    expect(lead.phone).toBe('9648658889')
    expect(lead.description).not.toContain('test@gmail.com')
    expect(lead.description).toContain('Interested In: 4 BHK')
    expect(lead.description).toContain('Buyer Type: investor')
  })

  it('still maps a correctly typed email field', () => {
    const fields: FormField[] = [
      field({ fieldId: 'f1', label: 'Full Name', type: 'text' }),
      field({ fieldId: 'f2', label: 'Email', type: 'email' }),
      field({ fieldId: 'f3', label: 'Phone Number', type: 'phone' }),
    ]

    const lead = zohoProvider.mapLead(
      { f1: 'Suresh Babu', f2: 'suresh@example.com', f3: '9876543210' },
      fields,
      SOURCE_URL
    )

    expect(lead.email).toBe('suresh@example.com')
    expect(lead.phone).toBe('9876543210')
    expect(lead.lastName).toBe('Suresh Babu')
  })

  // "Company/Project Name" contains "name". Before company was checked first,
  // it overwrote the lead's actual name and Zoho showed the company as the lead.
  it('files "Company/Project Name" as the company, not the lead name', () => {
    const fields: FormField[] = [
      field({ fieldId: 'f1', label: 'Name', type: 'text' }),
      field({ fieldId: 'f2', label: 'Email', type: 'email' }),
      field({ fieldId: 'f3', label: 'Company/Project Name', type: 'text' }),
      field({ fieldId: 'f4', label: 'Monthly Spent Budget', type: 'options' }),
    ]

    const lead = zohoProvider.mapLead(
      { f1: 'Vinayak', f2: 'v@example.com', f3: 'Wonderise', f4: '50k-1L' },
      fields,
      SOURCE_URL
    )

    expect(lead.lastName).toBe('Vinayak')
    expect(lead.company).toBe('Wonderise')
    expect(lead.description).toContain('Monthly Spent Budget: 50k-1L')
  })

  it('keeps the first match and sends later duplicates to the description', () => {
    const fields: FormField[] = [
      field({ fieldId: 'f1', label: 'Email', type: 'email' }),
      field({ fieldId: 'f2', label: 'Alternate Email', type: 'text' }),
    ]

    const lead = zohoProvider.mapLead(
      { f1: 'primary@example.com', f2: 'backup@example.com' },
      fields,
      SOURCE_URL
    )

    expect(lead.email).toBe('primary@example.com')
    expect(lead.description).toContain('Alternate Email: backup@example.com')
  })

  it('leaves company undefined when the form has no company field', () => {
    const fields: FormField[] = [field({ fieldId: 'f1', label: 'Name', type: 'text' })]

    const lead = zohoProvider.mapLead({ f1: 'Test' }, fields, SOURCE_URL)

    expect(lead.company).toBeUndefined()
    expect(lead.leadSource).toBe('VyostraAI')
  })

  it('skips blank values rather than claiming a field with an empty string', () => {
    const fields: FormField[] = [
      field({ fieldId: 'f1', label: 'Email', type: 'email' }),
      field({ fieldId: 'f2', label: 'Work Email', type: 'text' }),
    ]

    const lead = zohoProvider.mapLead({ f1: '', f2: 'work@example.com' }, fields, SOURCE_URL)

    expect(lead.email).toBe('work@example.com')
  })
})

describe('toPublicWebsiteUrl', () => {
  it('accepts the public URLs a real embed submits from', () => {
    expect(toPublicWebsiteUrl(SOURCE_URL)).toBe(SOURCE_URL)
    expect(toPublicWebsiteUrl('https://wonderise.com/projects/zoya')).toBe(
      'https://wonderise.com/projects/zoya'
    )
    expect(toPublicWebsiteUrl('http://example.co.in/contact?utm_source=meta')).toBe(
      'http://example.co.in/contact?utm_source=meta'
    )
  })

  // These fall back to Description rather than being sent as Website, which is
  // what the original comment was guarding against.
  it('rejects hosts Zoho will not accept, so they stay in the description', () => {
    expect(toPublicWebsiteUrl('http://localhost:5173/form')).toBeNull()
    expect(toPublicWebsiteUrl('http://127.0.0.1:3000/')).toBeNull()
    expect(toPublicWebsiteUrl('http://192.168.1.20/form')).toBeNull()
    expect(toPublicWebsiteUrl('http://my-macbook.local/form')).toBeNull()
    expect(toPublicWebsiteUrl('file:///Users/test/index.html')).toBeNull()
    expect(toPublicWebsiteUrl('not a url at all')).toBeNull()
    expect(toPublicWebsiteUrl('')).toBeNull()
  })

  it('rejects a URL longer than the Zoho field allows', () => {
    expect(toPublicWebsiteUrl(`https://example.com/${'a'.repeat(260)}`)).toBeNull()
  })
})
