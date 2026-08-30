import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { metaWhatsAppProvider } from './meta-whatsapp-provider.js'
import { gupshupProvider } from './gupshup-provider.js'
import type { MetaDirectCredentials, WhatsAppTemplateSend } from '../lib/whatsapp-provider.js'

const credentials: MetaDirectCredentials = {
  provider: 'meta_direct',
  phoneNumberId: '111222333',
  accessToken: 'test-token',
}

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function okResponse(): Response {
  return new Response(JSON.stringify({ messages: [{ id: 'wamid.TEST' }] }), { status: 200 })
}

function sentBody(): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  return JSON.parse(String(init.body)) as Record<string, unknown>
}

describe('MetaWhatsAppProvider.sendTemplate', () => {
  it('omits components entirely when the template has no placeholders', async () => {
    fetchMock.mockResolvedValueOnce(okResponse())
    const template: WhatsAppTemplateSend = { templateName: 'hello_world', languageCode: 'en_US', bodyParams: [] }

    const result = await metaWhatsAppProvider.sendTemplate('919876543210', template, credentials)

    expect(result).toEqual({ success: true, messageId: 'wamid.TEST' })
    const body = sentBody()
    expect(body.type).toBe('template')
    // Meta rejects a body component carrying an empty parameters array, so the
    // key must be absent rather than present-and-empty.
    expect(body.template).toEqual({ name: 'hello_world', language: { code: 'en_US' } })
    expect(body.template).not.toHaveProperty('components')
  })

  it('sends body parameters in order when the template has placeholders', async () => {
    fetchMock.mockResolvedValueOnce(okResponse())
    const template: WhatsAppTemplateSend = {
      templateName: 'site_visit_confirmed_1',
      languageCode: 'en',
      bodyParams: ['Skyline Residences', 'Sat, 22 Aug', '11:00 AM'],
    }

    await metaWhatsAppProvider.sendTemplate('919876543210', template, credentials)

    expect(sentBody().template).toEqual({
      name: 'site_visit_confirmed_1',
      language: { code: 'en' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: 'Skyline Residences' },
            { type: 'text', text: 'Sat, 22 Aug' },
            { type: 'text', text: '11:00 AM' },
          ],
        },
      ],
    })
  })

  it('sends a dynamic URL button as its own component alongside the body', async () => {
    fetchMock.mockResolvedValueOnce(okResponse())
    const template: WhatsAppTemplateSend = {
      templateName: 'lead_handoff_alert_3',
      languageCode: 'en',
      bodyParams: ['Ravi Kumar', '+91 98765 43210', 'No booking after 3 follow-ups', 'Lead: pricing?'],
      urlButtonParam: 'Y2hhdHxib3QtMXxsZWFkLTE',
    }

    await metaWhatsAppProvider.sendTemplate('919876543210', template, credentials)

    const components = (sentBody().template as { components: unknown[] }).components
    // A button parameter is a SEPARATE component, never a fifth body param:
    // folding it in fails the send with a parameter count mismatch (132000).
    expect(components).toHaveLength(2)
    expect(components[1]).toEqual({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: 'Y2hhdHxib3QtMXxsZWFkLTE' }],
    })
  })

  it('omits the button component for a template that has no dynamic button', async () => {
    fetchMock.mockResolvedValueOnce(okResponse())
    const template: WhatsAppTemplateSend = {
      templateName: 'lead_handoff_alert_2',
      languageCode: 'en',
      bodyParams: ['Ravi Kumar', '+91 98765 43210', 'No booking after 3 follow-ups'],
    }

    await metaWhatsAppProvider.sendTemplate('919876543210', template, credentials)

    const components = (sentBody().template as { components: unknown[] }).components
    expect(components).toHaveLength(1)
  })

  // The zero-placeholder case has to stay component-free even with the button
  // branch added: Meta rejects an empty components array outright.
  it('still omits components when there is neither a body param nor a button', async () => {
    fetchMock.mockResolvedValueOnce(okResponse())
    const template: WhatsAppTemplateSend = { templateName: 'connection_test_1', languageCode: 'en', bodyParams: [] }

    await metaWhatsAppProvider.sendTemplate('919876543210', template, credentials)

    expect(sentBody().template).not.toHaveProperty('components')
  })

  it('posts to the phone number id, not the WABA id', async () => {
    fetchMock.mockResolvedValueOnce(okResponse())
    const template: WhatsAppTemplateSend = { templateName: 'hello_world', languageCode: 'en', bodyParams: [] }

    await metaWhatsAppProvider.sendTemplate('919876543210', template, credentials)

    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toContain('/111222333/messages')
  })

  it('does not retry an unapproved template (4xx is not retryable)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'Template name does not exist', code: 132001 } }), {
        status: 400,
      })
    )
    const template: WhatsAppTemplateSend = { templateName: 'nope', languageCode: 'en', bodyParams: [] }

    const result = await metaWhatsAppProvider.sendTemplate('919876543210', template, credentials)

    expect(result.success).toBe(false)
    expect(result.retryable).toBe(false)
    expect(result.error).toContain('Template name does not exist')
  })

  it('marks a 5xx as retryable', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 503 }))
    const template: WhatsAppTemplateSend = { templateName: 'hello_world', languageCode: 'en', bodyParams: [] }

    const result = await metaWhatsAppProvider.sendTemplate('919876543210', template, credentials)

    expect(result.success).toBe(false)
    expect(result.retryable).toBe(true)
  })

  it('rejects Gupshup credentials without calling the API', async () => {
    const template: WhatsAppTemplateSend = { templateName: 'hello_world', languageCode: 'en', bodyParams: [] }

    const result = await metaWhatsAppProvider.sendTemplate(
      '919876543210',
      template,
      { provider: 'gupshup', apiKey: 'k', appName: 'a', sourceNumber: '1' }
    )

    expect(result.success).toBe(false)
    expect(result.retryable).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('GupshupProvider.sendTemplate', () => {
  it('reports an unsupported capability as non-retryable so retries are not burned on it', async () => {
    const template: WhatsAppTemplateSend = { templateName: 'lead_notification_1', languageCode: 'en', bodyParams: [] }

    const result = await gupshupProvider.sendTemplate(
      '919876543210',
      template,
      { provider: 'gupshup', apiKey: 'k', appName: 'a', sourceNumber: '1' }
    )

    expect(result.success).toBe(false)
    expect(result.retryable).toBe(false)
    expect(result.error).toContain('lead_notification_1')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('MetaWhatsAppProvider.createMessageTemplate', () => {
  it('emits HEADER, BODY, FOOTER in the order Meta requires and honours the language override', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: '1', status: 'PENDING', category: 'UTILITY' }), { status: 200 })
    )

    await metaWhatsAppProvider.createMessageTemplate('waba-1', 'tok', {
      name: 'hello_world',
      category: 'UTILITY',
      language: 'en_US',
      header: 'Hello World',
      footer: 'sample message',
      body: 'Welcome!',
      bodyExample: [],
      sentBy: 'test',
    })

    const body = sentBody()
    expect(body.language).toBe('en_US')
    expect((body.components as { type: string }[]).map((c) => c.type)).toEqual(['HEADER', 'BODY', 'FOOTER'])
    // A zero-placeholder body must carry no example at all.
    const bodyComponent = (body.components as { type: string; example?: unknown }[])[1]
    expect(bodyComponent.example).toBeUndefined()
  })

  it('surfaces error_user_msg rather than the generic "Invalid parameter"', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            message: 'Invalid parameter',
            error_user_title: 'Leading or trailing params not allowed',
            error_user_msg: "Variables can't be at the start or end of the template.",
          },
        }),
        { status: 400 }
      )
    )

    const result = await metaWhatsAppProvider.createMessageTemplate('waba-1', 'tok', {
      name: 'bad',
      category: 'UTILITY',
      body: '{{1}}',
      bodyExample: ['x'],
      sentBy: 'test',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain("Variables can't be at the start or end")
      expect(result.error).not.toBe('Invalid parameter')
    }
  })
})

describe('MetaWhatsAppProvider.exchangeCodeForToken', () => {
  beforeEach(() => {
    process.env.META_APP_ID = 'app-1'
    process.env.META_APP_SECRET = 'secret-1'
  })

  // The whole point of this function. Storing the short-lived token produces a
  // connection that works for an hour and then dies while still looking
  // connected -- the bug df5405a already fixed once for Lead Ads.
  it('exchanges the code AND then upgrades to a long-lived token', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'SHORT' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'LONG' }), { status: 200 }))

    const token = await metaWhatsAppProvider.exchangeCodeForToken('code-1', 'https://vyostra.com/cb')

    expect(token).toBe('LONG')
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const [firstUrl] = fetchMock.mock.calls[0] as [string]
    const [secondUrl] = fetchMock.mock.calls[1] as [string]
    // Step 1 must echo the redirect_uri; step 2 must not, and must carry the
    // short-lived token as fb_exchange_token.
    expect(firstUrl).toContain('redirect_uri=')
    expect(secondUrl).toContain('grant_type=fb_exchange_token')
    expect(secondUrl).toContain('fb_exchange_token=SHORT')
  })

  it('throws rather than falling back to the short-lived token', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'SHORT' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'nope' } }), { status: 400 }))

    await expect(metaWhatsAppProvider.exchangeCodeForToken('code-1', 'https://vyostra.com/cb')).rejects.toThrow(
      'long-lived token exchange failed'
    )
  })
})

describe('MetaWhatsAppProvider.registerPhoneNumber', () => {
  it('posts messaging_product and the pin to the register endpoint', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))

    await metaWhatsAppProvider.registerPhoneNumber('phone-1', '123456', 'tok')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://graph.facebook.com/v21.0/phone-1/register')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ messaging_product: 'whatsapp', pin: '123456' })
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  // A 200 that does not say success:true is a failure. Meta returns exactly
  // {"success": true} here, so anything else means the number is not live --
  // treating a bare 200 as success is how an unregistered number would get
  // reported to a client as connected.
  it('throws when the response is 200 without success:true', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))

    await expect(metaWhatsAppProvider.registerPhoneNumber('phone-1', '123456', 'tok')).rejects.toThrow(/phone-1/)
  })

  it('surfaces error_user_msg in preference to the generic message', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { message: 'Invalid parameter', error_user_msg: 'Phone number needs to be verified first.' },
        }),
        { status: 400 }
      )
    )

    await expect(metaWhatsAppProvider.registerPhoneNumber('phone-1', '123456', 'tok')).rejects.toThrow(
      /Phone number needs to be verified first/
    )
  })
})
