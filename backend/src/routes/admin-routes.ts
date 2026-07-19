import { Hono } from 'hono'
import { requireStaffAuth } from '../lib/cognito-staff.js'
import {
  AdminValidationError,
  changePlan,
  extendTrial,
  getAccountAuditHistory,
  listAccountsWithEntitlements,
  setOverrides,
  toggleInternal,
} from '../services/admin-service.js'
import type { ApiResponse, AuditEntry, PlanTier, Subscription, SubscriptionOverrides } from '../types/index.js'

export const adminRoutes = new Hono()

// requireStaffAuth is applied once, at router level, to '*' — every route
// added to this file (including the four below) is covered automatically,
// no per-route re-declaration needed.
adminRoutes.use('*', requireStaffAuth)

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

adminRoutes.get('/accounts', async (c) => {
  try {
    const accounts = await listAccountsWithEntitlements()
    return c.json<ApiResponse<typeof accounts>>({ success: true, data: accounts }, 200)
  } catch (error) {
    console.error('Admin accounts list error:', error)
    return c.json<ApiResponse<null>>({ success: false, error: 'Failed to load accounts' }, 500)
  }
})

adminRoutes.get('/accounts/:accountId/audit-log', async (c) => {
  const accountId = c.req.param('accountId')
  try {
    const history = await getAccountAuditHistory(accountId)
    return c.json<ApiResponse<AuditEntry[]>>({ success: true, data: history }, 200)
  } catch (error) {
    console.error('Admin audit history error:', error)
    return c.json<ApiResponse<null>>({ success: false, error: 'Failed to load audit history' }, 500)
  }
})

interface ToggleInternalBody {
  isInternal?: boolean
  reason?: string
}

adminRoutes.post('/accounts/:accountId/toggle-internal', async (c) => {
  const accountId = c.req.param('accountId')
  const actorEmail = c.get('staffUser').email
  const body = await c.req.json<ToggleInternalBody>()

  if (typeof body.isInternal !== 'boolean') {
    return c.json<ApiResponse<null>>({ success: false, error: 'isInternal must be a boolean' }, 400)
  }

  try {
    const subscription = await toggleInternal(accountId, body.isInternal, body.reason ?? '', actorEmail)
    return c.json<ApiResponse<Subscription>>({ success: true, data: subscription }, 200)
  } catch (error) {
    if (error instanceof AdminValidationError) {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 400)
    }
    if (error instanceof Error && error.message === 'Subscription not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

interface ExtendTrialBody {
  newTrialEndsAt?: string
  reason?: string
}

adminRoutes.post('/accounts/:accountId/extend-trial', async (c) => {
  const accountId = c.req.param('accountId')
  const actorEmail = c.get('staffUser').email
  const body = await c.req.json<ExtendTrialBody>()

  if (!body.newTrialEndsAt) {
    return c.json<ApiResponse<null>>({ success: false, error: 'newTrialEndsAt is required' }, 400)
  }

  try {
    const subscription = await extendTrial(accountId, body.newTrialEndsAt, body.reason ?? '', actorEmail)
    return c.json<ApiResponse<Subscription>>({ success: true, data: subscription }, 200)
  } catch (error) {
    if (error instanceof AdminValidationError) {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 400)
    }
    if (error instanceof Error && error.message === 'Subscription not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

interface ChangePlanBody {
  plan?: PlanTier
  reason?: string
}

adminRoutes.post('/accounts/:accountId/change-plan', async (c) => {
  const accountId = c.req.param('accountId')
  const actorEmail = c.get('staffUser').email
  const body = await c.req.json<ChangePlanBody>()

  if (!body.plan) {
    return c.json<ApiResponse<null>>({ success: false, error: 'plan is required' }, 400)
  }

  try {
    const subscription = await changePlan(accountId, body.plan, body.reason ?? '', actorEmail)
    return c.json<ApiResponse<Subscription>>({ success: true, data: subscription }, 200)
  } catch (error) {
    if (error instanceof AdminValidationError) {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 400)
    }
    if (error instanceof Error && error.message === 'Subscription not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

interface SetOverridesBody {
  overrides?: SubscriptionOverrides
  reason?: string
}

adminRoutes.post('/accounts/:accountId/set-overrides', async (c) => {
  const accountId = c.req.param('accountId')
  const actorEmail = c.get('staffUser').email
  const body = await c.req.json<SetOverridesBody>()

  if (!body.overrides || typeof body.overrides !== 'object' || Array.isArray(body.overrides)) {
    return c.json<ApiResponse<null>>({ success: false, error: 'overrides must be an object' }, 400)
  }

  try {
    const subscription = await setOverrides(accountId, body.overrides, body.reason ?? '', actorEmail)
    return c.json<ApiResponse<Subscription>>({ success: true, data: subscription }, 200)
  } catch (error) {
    if (error instanceof AdminValidationError) {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 400)
    }
    if (error instanceof Error && error.message === 'Subscription not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})
