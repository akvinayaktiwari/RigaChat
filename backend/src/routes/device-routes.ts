// Device registry for the mobile app. Mounted at /api/devices.
//
// clientId comes from the JWT on every route and NEVER from a body or a path
// param. That is what makes a cross-tenant write structurally impossible here
// rather than merely conventional -- clientId is the table's partition key, so
// a caller cannot address another client's row even by guessing a deviceId.

import { Hono } from 'hono'
import { requireAuth } from '../lib/cognito.js'
import {
  upsertDeviceToken,
  deleteDeviceToken,
} from '../repositories/device-token-repository.js'
import type { ApiResponse, DevicePlatform, DeviceToken } from '../types/index.js'

interface AuthEnv {
  Variables: {
    user: { sub: string; email: string; name?: string; [key: string]: unknown }
  }
}

export const deviceRoutes = new Hono<AuthEnv>()

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

interface RegisterDeviceBody {
  deviceId?: string
  expoPushToken?: string
  platform?: string
  appVersion?: string
}

const VALID_PLATFORMS: DevicePlatform[] = ['android', 'ios']

// Expo tokens look like ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx] or, for a
// bare FCM/APNs passthrough, ExpoPushToken[...]. Validated here rather than at
// send time: a malformed token stored now is a silent delivery failure on every
// future lead, and the app is the only writer so a bad value is a client bug
// worth surfacing immediately.
const EXPO_TOKEN_PATTERN = /^Expo(nent)?PushToken\[[^\]]+\]$/

// Idempotent upsert. Called on login and on every token rotation, so calling it
// twice with the same deviceId must leave exactly one row -- see
// upsertDeviceToken, which preserves registeredAt via if_not_exists.
deviceRoutes.post('/', requireAuth, async (c) => {
  const clientId = c.get('user').sub

  try {
    const body = await c.req.json<RegisterDeviceBody>().catch(() => ({}) as RegisterDeviceBody)

    if (!body.deviceId || !body.expoPushToken || !body.platform || !body.appVersion) {
      return c.json<ApiResponse<null>>(
        { success: false, error: 'deviceId, expoPushToken, platform and appVersion are all required' },
        400
      )
    }

    if (!VALID_PLATFORMS.includes(body.platform as DevicePlatform)) {
      return c.json<ApiResponse<null>>(
        { success: false, error: `platform must be one of: ${VALID_PLATFORMS.join(', ')}` },
        400
      )
    }

    if (!EXPO_TOKEN_PATTERN.test(body.expoPushToken)) {
      return c.json<ApiResponse<null>>(
        { success: false, error: 'expoPushToken is not a valid Expo push token' },
        400
      )
    }

    const device = await upsertDeviceToken({
      clientId,
      deviceId: body.deviceId,
      expoPushToken: body.expoPushToken,
      platform: body.platform as DevicePlatform,
      appVersion: body.appVersion,
    })

    return c.json<ApiResponse<DeviceToken>>({ success: true, data: device }, 201)
  } catch (error) {
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

// Called on sign-out. Answers 200 on a second call too: DynamoDB's delete
// succeeds on a row that is not there, so there is no read-before-delete and no
// way for a client to learn whether a deviceId existed.
deviceRoutes.delete('/:deviceId', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const deviceId = c.req.param('deviceId')

  try {
    await deleteDeviceToken(clientId, deviceId)
    return c.json<ApiResponse<null>>({ success: true, data: null }, 200)
  } catch (error) {
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})
