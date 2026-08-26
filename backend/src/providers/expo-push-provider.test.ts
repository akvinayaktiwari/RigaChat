import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendExpoPushNotifications, EXPO_MAX_MESSAGES_PER_REQUEST } from './expo-push-provider.js'
import type { ExpoPushMessage } from './expo-push-provider.js'

function message(token: string): ExpoPushMessage {
  return {
    to: token,
    title: 'New lead: Ravi Kumar',
    body: '3 BHK in Wakad',
    sound: 'default',
    channelId: 'leads',
    data: { kind: 'lead_captured', leadRef: { source: 'chat', botId: 'bot-1', leadId: 'lead-1' } },
  }
}

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve('') }
}

describe('sendExpoPushNotifications', () => {
  it('posts to exp.host and maps ok tickets in input order', async () => {
    fetchMock.mockResolvedValue(
      okResponse({ data: [{ status: 'ok', id: 'r-1' }, { status: 'ok', id: 'r-2' }] })
    )

    const tickets = await sendExpoPushNotifications([message('ExponentPushToken[a]'), message('ExponentPushToken[b]')])

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://exp.host/--/api/v2/push/send')
    expect(tickets).toEqual([
      { expoPushToken: 'ExponentPushToken[a]', ok: true },
      { expoPushToken: 'ExponentPushToken[b]', ok: true },
    ])
  })

  it('surfaces DeviceNotRegistered as a code the caller can act on', async () => {
    fetchMock.mockResolvedValue(
      okResponse({
        data: [{ status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } }],
      })
    )

    const [ticket] = await sendExpoPushNotifications([message('ExponentPushToken[a]')])

    expect(ticket).toEqual({
      expoPushToken: 'ExponentPushToken[a]',
      ok: false,
      code: 'DeviceNotRegistered',
      error: 'not registered',
    })
  })

  // A transport failure says nothing about any individual token. Inventing a
  // DeviceNotRegistered here would make the caller delete live devices on a
  // network blip, so the whole batch fails WITHOUT a code.
  it('fails the whole batch without a code when the request throws', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'))

    const tickets = await sendExpoPushNotifications([message('ExponentPushToken[a]'), message('ExponentPushToken[b]')])

    expect(tickets).toHaveLength(2)
    for (const ticket of tickets) {
      expect(ticket.ok).toBe(false)
      expect(ticket.code).toBeUndefined()
      expect(ticket.error).toContain('ECONNRESET')
    }
  })

  it('fails the whole batch without a code on a non-2xx response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.resolve('upstream unavailable'),
      json: () => Promise.resolve({}),
    })

    const [ticket] = await sendExpoPushNotifications([message('ExponentPushToken[a]')])

    expect(ticket.ok).toBe(false)
    expect(ticket.code).toBeUndefined()
    expect(ticket.error).toContain('503')
  })

  it('fails the batch without a code when Expo rejects the request itself', async () => {
    fetchMock.mockResolvedValue(okResponse({ errors: [{ code: 'PUSH_TOO_MANY_EXPERIENCE_IDS', message: 'mixed' }] }))

    const [ticket] = await sendExpoPushNotifications([message('ExponentPushToken[a]')])

    expect(ticket.ok).toBe(false)
    expect(ticket.code).toBeUndefined()
    expect(ticket.error).toContain('mixed')
  })

  // Expo guarantees response order matches request order, so a short array is
  // Expo misbehaving. Treat the missing entries as failed-but-alive rather than
  // silently reporting success for a message that may never have been queued.
  it('marks messages failed when Expo returns fewer tickets than sent', async () => {
    fetchMock.mockResolvedValue(okResponse({ data: [{ status: 'ok', id: 'r-1' }] }))

    const tickets = await sendExpoPushNotifications([message('ExponentPushToken[a]'), message('ExponentPushToken[b]')])

    expect(tickets[0]).toEqual({ expoPushToken: 'ExponentPushToken[a]', ok: true })
    expect(tickets[1]?.ok).toBe(false)
    expect(tickets[1]?.code).toBeUndefined()
  })

  it('makes no request for an empty batch', async () => {
    await expect(sendExpoPushNotifications([])).resolves.toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // A caller-side bug. Fail loudly here rather than letting Expo reject it with
  // a less obvious message.
  it('refuses a batch over the per-request limit without calling out', async () => {
    const tooMany = Array.from({ length: EXPO_MAX_MESSAGES_PER_REQUEST + 1 }, (_, i) =>
      message(`ExponentPushToken[t${i}]`)
    )

    const tickets = await sendExpoPushNotifications(tooMany)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(tickets).toHaveLength(EXPO_MAX_MESSAGES_PER_REQUEST + 1)
    expect(tickets[0]?.error).toContain('max is 100')
  })

  it('never puts a transcript in the payload it sends', async () => {
    fetchMock.mockResolvedValue(okResponse({ data: [{ status: 'ok', id: 'r-1' }] }))

    await sendExpoPushNotifications([message('ExponentPushToken[a]')])

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1].body as string)
    expect(Object.keys(body[0].data)).toEqual(['kind', 'leadRef'])
  })
})
