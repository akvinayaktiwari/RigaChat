import { Hono } from 'hono'
import { requireAuth } from '../lib/cognito.js'
import { getClient, updateClientProfile, upgradeClientPlan, upsertClient } from '../services/client-service.js'
import { getSubscriptionSummary } from '../services/entitlement-service.js'
import type { SubscriptionSummary } from '../services/entitlement-service.js'
import type { ApiResponse, ClientRecord } from '../types/index.js'

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
