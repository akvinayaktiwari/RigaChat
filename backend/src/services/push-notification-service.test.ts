import { beforeEach, describe, expect, it, vi } from 'vitest'

const getDeviceTokensForClient = vi.fn()
const deleteDeviceToken = vi.fn()
vi.mock('../repositories/device-token-repository.js', () => ({
  getDeviceTokensForClient,
  deleteDeviceToken,
}))

const sendExpoPushNotifications = vi.fn()
vi.mock('../providers/expo-push-provider.js', () => ({
  sendExpoPushNotifications,
  EXPO_MAX_MESSAGES_PER_REQUEST: 100,
}))

const { sendLeadPush } = await import('./push-notification-service.js')

const leadRef = { source: 'chat', botId: 'bot-1', leadId: 'lead-1' } as const

const input = {
  clientId: 'client-1',
  kind: 'lead_captured' as const,
  leadRef,
  title: 'New lead: Ravi Kumar',
  body: '3 BHK in Wakad · from Website chat',
}

function device(deviceId: string, token: string) {
  return {
    clientId: 'client-1',
    deviceId,
    expoPushToken: token,
    platform: 'android' as const,
    appVersion: '1.0.0',
    registeredAt: '2026-08-01T00:00:00.000Z',
    lastSeenAt: '2026-08-26T00:00:00.000Z',
    failureCount: 0,
  }
}

beforeEach(() => {
  delete process.env.PUSH_DISABLED
  getDeviceTokensForClient.mockReset()
  getDeviceTokensForClient.mockResolvedValue([device('dev-1', 'ExponentPushToken[aaa]')])
  deleteDeviceToken.mockReset()
  deleteDeviceToken.mockResolvedValue(undefined)
  sendExpoPushNotifications.mockReset()
  sendExpoPushNotifications.mockResolvedValue([{ expoPushToken: 'ExponentPushToken[aaa]', ok: true }])
})

describe('sendLeadPush', () => {
  it('sends one message per registered device', async () => {
    getDeviceTokensForClient.mockResolvedValue([
      device('dev-1', 'ExponentPushToken[aaa]'),
      device('dev-2', 'ExponentPushToken[bbb]'),
    ])
    sendExpoPushNotifications.mockResolvedValue([
      { expoPushToken: 'ExponentPushToken[aaa]', ok: true },
      { expoPushToken: 'ExponentPushToken[bbb]', ok: true },
    ])

    const result = await sendLeadPush(input)

    expect(result).toEqual({ sent: 2, failed: 0, retired: 0 })
    const sentMessages = sendExpoPushNotifications.mock.calls[0]?.[0]
    expect(sentMessages).toHaveLength(2)
    expect(sentMessages[0].to).toBe('ExponentPushToken[aaa]')
  })

  // The property that makes this safe to deploy: until a client installs the
  // app there are no rows, so nothing reaches the network and production
  // behaviour is unchanged on day one.
  it('makes no external call when the client has no registered devices', async () => {
    getDeviceTokensForClient.mockResolvedValue([])

    const result = await sendLeadPush(input)

    expect(result).toEqual({ sent: 0, failed: 0, retired: 0, skipped: 'no_devices' })
    expect(sendExpoPushNotifications).not.toHaveBeenCalled()
  })

  it('carries the full leadRef in data so the app needs no reconstruction', async () => {
    await sendLeadPush(input)

    const message = sendExpoPushNotifications.mock.calls[0]?.[0][0]
    expect(message.data).toEqual({ kind: 'lead_captured', leadRef })
  })

  it('routes lead_captured to the leads channel and handoff to handoffs', async () => {
    await sendLeadPush(input)
    expect(sendExpoPushNotifications.mock.calls[0]?.[0][0].channelId).toBe('leads')

    sendExpoPushNotifications.mockClear()
    await sendLeadPush({ ...input, kind: 'handoff' })
    expect(sendExpoPushNotifications.mock.calls[0]?.[0][0].channelId).toBe('handoffs')
  })

  it('deletes the row when Expo reports DeviceNotRegistered', async () => {
    sendExpoPushNotifications.mockResolvedValue([
      { expoPushToken: 'ExponentPushToken[aaa]', ok: false, code: 'DeviceNotRegistered', error: 'gone' },
    ])

    const result = await sendLeadPush(input)

    expect(deleteDeviceToken).toHaveBeenCalledWith('client-1', 'dev-1')
    expect(result).toEqual({ sent: 0, failed: 1, retired: 1 })
  })

  // A network blip must not cost a live device its registration.
  it('does NOT delete the row for a failure that is not DeviceNotRegistered', async () => {
    sendExpoPushNotifications.mockResolvedValue([
      { expoPushToken: 'ExponentPushToken[aaa]', ok: false, error: 'expo push HTTP 503' },
    ])

    const result = await sendLeadPush(input)

    expect(deleteDeviceToken).not.toHaveBeenCalled()
    expect(result).toEqual({ sent: 0, failed: 1, retired: 0 })
  })

  it('chunks at the Expo per-request limit', async () => {
    const devices = Array.from({ length: 150 }, (_, i) => device(`dev-${i}`, `ExponentPushToken[t${i}]`))
    getDeviceTokensForClient.mockResolvedValue(devices)
    sendExpoPushNotifications.mockImplementation((batch: { to: string }[]) =>
      Promise.resolve(batch.map((m) => ({ expoPushToken: m.to, ok: true })))
    )

    const result = await sendLeadPush(input)

    expect(sendExpoPushNotifications).toHaveBeenCalledTimes(2)
    expect(sendExpoPushNotifications.mock.calls[0]?.[0]).toHaveLength(100)
    expect(sendExpoPushNotifications.mock.calls[1]?.[0]).toHaveLength(50)
    expect(result.sent).toBe(150)
  })

  it('honours the PUSH_DISABLED kill switch without reading the table', async () => {
    process.env.PUSH_DISABLED = '1'

    const result = await sendLeadPush(input)

    expect(result).toEqual({ sent: 0, failed: 0, retired: 0, skipped: 'disabled' })
    expect(getDeviceTokensForClient).not.toHaveBeenCalled()
    expect(sendExpoPushNotifications).not.toHaveBeenCalled()
  })

  // The contract the two call sites depend on. Both of them sit inside
  // try/catch blocks whose catch branches change behaviour, so a throw here
  // would corrupt a working WhatsApp path.
  it('never throws when the repository fails', async () => {
    getDeviceTokensForClient.mockRejectedValue(new Error('dynamo is down'))

    await expect(sendLeadPush(input)).resolves.toEqual({ sent: 0, failed: 0, retired: 0 })
  })

  it('never throws when the provider fails', async () => {
    sendExpoPushNotifications.mockRejectedValue(new Error('fetch exploded'))

    await expect(sendLeadPush(input)).resolves.toEqual({ sent: 0, failed: 0, retired: 0 })
  })

  it('never throws when retiring a dead token fails', async () => {
    sendExpoPushNotifications.mockResolvedValue([
      { expoPushToken: 'ExponentPushToken[aaa]', ok: false, code: 'DeviceNotRegistered' },
    ])
    deleteDeviceToken.mockRejectedValue(new Error('delete failed'))

    await expect(sendLeadPush(input)).resolves.toEqual({ sent: 0, failed: 1, retired: 1 })
  })
})
