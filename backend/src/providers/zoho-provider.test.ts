import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
      { f1: 'Test', f2: '9000000001', f3: '4 BHK', f4: 'test@gmail.com', f5: 'investor' },
      fields,
      SOURCE_URL
    )

    expect(lead.email).toBe('test@gmail.com')
    expect(lead.lastName).toBe('Test')
    expect(lead.phone).toBe('9000000001')
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

// An account lives in one Zoho data centre, and its tokens work nowhere else.
// Every host below used to be the India constant, which is why only zoho.in
// accounts could connect.
describe('Zoho data centres', () => {
  const US = { accountsServer: 'https://accounts.zoho.com', apiDomain: 'https://www.zohoapis.com' }
  const LATER = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  const PAST = new Date(Date.now() - 60 * 1000).toISOString()
  const lead = { lastName: 'Reyes', leadSource: 'VyostraAI', description: '', sourceUrl: 'https://example.com/' }
  const created = { data: [{ code: 'SUCCESS', status: 'success', details: { id: 'z1' } }] }

  const fetchMock = vi.fn()

  function respond(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status })
  }

  function requestedUrls(): string[] {
    return fetchMock.mock.calls.map((call) => String(call[0]))
  }

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('redeems the code at the data centre the callback names, and records it', async () => {
    fetchMock.mockResolvedValue(
      respond({ access_token: 'a', refresh_token: 'r', expires_in: 3600, api_domain: 'https://www.zohoapis.com' })
    )

    const credentials = await zohoProvider.exchangeCodeForTokens('code', 'https://accounts.zoho.com')

    expect(requestedUrls()).toEqual(['https://accounts.zoho.com/oauth/v2/token'])
    expect(credentials).toMatchObject(US)
  })

  it('treats a callback with no accounts-server as the India data centre', async () => {
    fetchMock.mockResolvedValue(respond({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }))

    const credentials = await zohoProvider.exchangeCodeForTokens('code')

    expect(requestedUrls()).toEqual(['https://accounts.zoho.in/oauth/v2/token'])
    expect(credentials.apiDomain).toBe('https://www.zohoapis.in')
  })

  // The exchange carries our client secret, and accounts-server arrives in a
  // query string anyone can craft.
  it.each(['https://accounts.zoho.com.evil.example', 'https://evil.example', 'http://accounts.zoho.com', 'not a url'])(
    'refuses to send the code to %s',
    async (accountsServer) => {
      await expect(zohoProvider.exchangeCodeForTokens('code', accountsServer)).rejects.toThrow(/Unrecognised Zoho/)
      expect(fetchMock).not.toHaveBeenCalled()
    }
  )

  it('ignores an api_domain that is not a Zoho API host', async () => {
    fetchMock.mockResolvedValue(
      respond({ access_token: 'a', refresh_token: 'r', expires_in: 3600, api_domain: 'https://evil.example' })
    )

    const credentials = await zohoProvider.exchangeCodeForTokens('code', 'https://accounts.zoho.eu')

    expect(credentials.apiDomain).toBe('https://www.zohoapis.eu')
  })

  it('refreshes against the stored accounts server and keeps the data centre', async () => {
    fetchMock.mockResolvedValue(respond({ access_token: 'a2', expires_in: 3600 }))

    const refreshed = await zohoProvider.refreshAccessToken({
      provider: 'zoho',
      accessToken: 'a',
      refreshToken: 'r',
      tokenExpiry: PAST,
      ...US,
    })

    expect(requestedUrls()).toEqual(['https://accounts.zoho.com/oauth/v2/token'])
    expect(refreshed).toMatchObject({ accessToken: 'a2', ...US })
  })

  it('pushes the lead to the stored API domain', async () => {
    fetchMock.mockResolvedValue(respond(created, 201))

    const result = await zohoProvider.syncLead(lead, {
      provider: 'zoho',
      accessToken: 'a',
      refreshToken: 'r',
      tokenExpiry: LATER,
      ...US,
    })

    expect(result).toEqual({ success: true, externalId: 'z1' })
    expect(requestedUrls()).toEqual(['https://www.zohoapis.com/crm/v2/Leads'])
  })

  // Every connection stored before the data centre was recorded.
  it('keeps a connection with no recorded data centre on India', async () => {
    fetchMock.mockResolvedValue(respond(created, 201))

    await zohoProvider.syncLead(lead, { provider: 'zoho', accessToken: 'a', refreshToken: 'r', tokenExpiry: LATER })

    expect(requestedUrls()).toEqual(['https://www.zohoapis.in/crm/v2/Leads'])
  })
})
