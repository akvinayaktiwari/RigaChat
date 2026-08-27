import { Hono } from 'hono'
import { requireAuth } from '../lib/cognito.js'
import {
  getAppBootstrap,
  getClient,
  updateClientProfile,
  updateNotificationPreferences,
  upgradeClientPlan,
  upsertClient,
} from '../services/client-service.js'
import { getSubscriptionSummary } from '../services/entitlement-service.js'
import type { SubscriptionSummary } from '../services/entitlement-service.js'
import type { ApiResponse, AppBootstrap, ClientRecord, NotificationPreferences } from '../types/index.js'

interface AuthEnv {
  Variables: {
    user: { sub: string; email: string; name?: string; [key: string]: unknown }
  }
}

export const clientRoutes = new Hono<AuthEnv>()

const VALID_PLANS: ClientRecord['plan'][] = ['starter', 'growth', 'agency']

interface UpgradePlanBody {
  plan?: string
}

interface UpdateProfileBody {
  name?: string
}

interface NotificationPreferencesBody {
  push?: unknown
  whatsapp?: unknown
  email?: unknown
}

// Only booleans are accepted, and only for known keys. A truthy string like
// "false" would otherwise turn a channel ON while reading as off to whoever
// sent it.
function readPreferencePatch(body: NotificationPreferencesBody): Partial<NotificationPreferences> | null {
  const patch: Partial<NotificationPreferences> = {}
  for (const key of ['push', 'whatsapp', 'email'] as const) {
    const value = body[key]
    if (value === undefined) continue
    if (typeof value !== 'boolean') return null
    patch[key] = value
  }
  return Object.keys(patch).length > 0 ? patch : null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

clientRoutes.post('/me', requireAuth, async (c) => {
  const user = c.get('user')

  try {
    const client = await upsertClient({
      clientId: user.sub,
      email: user.email,
      name: user.name ?? user.email.split('@')[0],
      authProvider: 'google',
    })
    return c.json<ApiResponse<ClientRecord>>({ success: true, data: client }, 200)
  } catch (error) {
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

clientRoutes.get('/me', requireAuth, async (c) => {
  const clientId = c.get('user').sub

  try {
    const client = await getClient(clientId)
    return c.json<ApiResponse<ClientRecord>>({ success: true, data: client }, 200)
  } catch (error) {
    if (error instanceof Error && error.message === 'Client not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

// The mobile app's launch call: readiness gate + what the app may do.
// Consumed by vyostra-mobile; see docs/designs/web-mobile-contract.md there
// before changing the shape. Adding a capability is safe for installed builds
// (they ignore what they do not recognise); REMOVING one, renaming one, or
// changing this route's path is a breaking change for phones in the field that
// cannot be force-updated.
clientRoutes.get('/me/app-bootstrap', requireAuth, async (c) => {
  const clientId = c.get('user').sub

  try {
    const bootstrap = await getAppBootstrap(clientId)
    return c.json<ApiResponse<AppBootstrap>>({ success: true, data: bootstrap }, 200)
  } catch (error) {
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

// Which channels fire when a lead arrives. A separate route rather than an
// extension of PATCH /me, because that one hard-requires `name` and mixing an
// unrelated required field into a toggle would mean the UI has to send the
// user's name to turn off an email. /me/plan sets the same precedent.
clientRoutes.patch('/me/notification-preferences', requireAuth, async (c) => {
  const clientId = c.get('user').sub

  try {
    const body = await c.req.json<NotificationPreferencesBody>().catch(() => ({}))
    const patch = readPreferencePatch(body)
    if (!patch) {
      return c.json<ApiResponse<null>>(
        { success: false, error: 'Send at least one of push, whatsapp or email as a boolean' },
        400
      )
    }

    const client = await updateNotificationPreferences(clientId, patch)
    return c.json<ApiResponse<ClientRecord>>({ success: true, data: client }, 200)
  } catch (error) {
    if (error instanceof Error && error.message === 'Client not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

// clientId derives strictly from the JWT (c.get('user').sub), never a
// param/query/body — this must only ever return the caller's own data.
clientRoutes.get('/me/subscription', requireAuth, async (c) => {
  const clientId = c.get('user').sub

  try {
    const summary = await getSubscriptionSummary(clientId)
    return c.json<ApiResponse<SubscriptionSummary>>({ success: true, data: summary }, 200)
  } catch (error) {
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

clientRoutes.patch('/me', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const body = await c.req.json<UpdateProfileBody>()

  if (!body.name || !body.name.trim()) {
    return c.json<ApiResponse<null>>({ success: false, error: 'name is required' }, 400)
  }

  try {
    const client = await updateClientProfile(clientId, body.name.trim())
    return c.json<ApiResponse<ClientRecord>>({ success: true, data: client }, 200)
  } catch (error) {
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

// Legacy field, not read by entitlement-service.ts — no real access impact
// today. Do not wire to subscription.plan without payment verification.
clientRoutes.patch('/me/plan', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const body = await c.req.json<UpgradePlanBody>()

  if (!body.plan || !VALID_PLANS.includes(body.plan as ClientRecord['plan'])) {
    return c.json<ApiResponse<null>>(
      { success: false, error: 'plan must be one of: starter, growth, agency' },
      400
    )
  }

  try {
    const client = await upgradeClientPlan(clientId, body.plan as ClientRecord['plan'])
    return c.json<ApiResponse<ClientRecord>>({ success: true, data: client }, 200)
  } catch (error) {
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})
