import { Hono } from 'hono'
import { requireAuth } from '../lib/cognito.js'
import { BillingError, subscribeToTier } from '../services/billing-service.js'
import type { BillableTier, SubscribeResult } from '../services/billing-service.js'
import type { ApiResponse } from '../types/index.js'

interface AuthEnv {
  Variables: {
    user: { sub: string; email: string; name?: string; [key: string]: unknown }
  }
}

export const billingRoutes = new Hono<AuthEnv>()

const VALID_TIERS: BillableTier[] = ['starter', 'growth', 'agency']

interface SubscribeBody {
  tier?: string
}

// error stays for backward-compat/human-readable logging; code is the new
// stable field callers should switch on instead of matching message text.
interface BillingErrorResponse extends ApiResponse<null> {
  code: BillingError['code']
  details?: Record<string, unknown>
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// 409 for guard failures (already subscribed / internal account), 400 for a
// bad tier, 500 for config or Razorpay-side failures. NO_SUBSCRIPTION_RECORD
// isn't caller-fixable (missing server-side data, not a bad request), so it
// falls into the 500 bucket alongside CONFIG_ERROR/PROVIDER_ERROR.
function billingErrorStatus(code: BillingError['code']): 409 | 500 {
  if (code === 'INTERNAL_ACCOUNT_NO_BILLING' || code === 'ALREADY_SUBSCRIBED') {
    return 409
  }
  return 500
}

// clientId derives strictly from the JWT (c.get('user').sub), never the
// request body — this must only ever create a subscription for the caller.
billingRoutes.post('/subscribe', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const body = await c.req.json<SubscribeBody>()

  if (!body.tier || !VALID_TIERS.includes(body.tier as BillableTier)) {
    return c.json<ApiResponse<null>>({ success: false, error: 'tier must be one of: starter, growth, agency' }, 400)
  }

  try {
    const result = await subscribeToTier(clientId, body.tier as BillableTier)
    return c.json<ApiResponse<SubscribeResult>>({ success: true, data: result }, 200)
  } catch (error) {
    if (error instanceof BillingError) {
      return c.json<BillingErrorResponse>(
        { success: false, error: error.message, code: error.code, details: error.details },
        billingErrorStatus(error.code)
      )
    }
    console.error('Billing subscribe error:', error)
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})
