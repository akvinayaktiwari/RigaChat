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
