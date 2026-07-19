import type { ApiResponse } from '../types/index'

const BASE_URL = import.meta.env.VITE_API_URL

export interface AdminFeatureState {
  enabled: boolean
  mode?: 'full' | 'degraded' | null
  limits: Record<string, number | null>
}

export interface AdminAccountSummary {
  accountId: string
  email: string | null
  name: string | null
  plan: string
  status: string
  isInternal: boolean
  trialEndsAt: string | null
  entitlements: {
    chat: AdminFeatureState
    crm: AdminFeatureState
    agents: AdminFeatureState
    voice: AdminFeatureState
  }
  createdAt: string
}

// Deliberately does not use services/api.ts's apiClient()/setAuthToken() —
// those hold a shared module-level customer token. Admin requests take the
// staff token explicitly per call so the two auth contexts can never
// cross-contaminate, mirroring the backend's fully separate verifiers.
export async function getAdminAccounts(staffToken: string): Promise<ApiResponse<AdminAccountSummary[]>> {
  const response = await fetch(`${BASE_URL}/api/admin/accounts`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${staffToken}`,
    },
  })

  const parsed = (await response.json()) as ApiResponse<AdminAccountSummary[]>

  if (!response.ok && !parsed.error) {
    throw new Error(`Admin accounts request failed with status ${response.status}`)
  }

  return parsed
}

export type PlanTier = 'free' | 'starter' | 'growth' | 'agency'

export interface SubscriptionOverrides {
  chat?: { conversations?: number | null }
  leads?: { max?: number | null }
  agents?: { max?: number | null }
  voice?: { minutes?: number | null }
}

export interface AdminSubscription {
  accountId: string
  status: string
  plan: PlanTier
  addons: { voice?: { subscribed: boolean; subscribedAt: string } }
  overrides: SubscriptionOverrides
  isInternal: boolean
  trialStartedAt: string | null
  trialEndsAt: string | null
  currentPeriodStart: string
  currentPeriodEnd: string | null
  paymentProvider: 'razorpay' | null
  providerSubscriptionId: string | null
  providerCustomerId: string | null
  createdAt: string
  updatedAt: string
}

export type AuditAction = 'toggle_internal' | 'extend_trial' | 'change_plan' | 'set_overrides'

export interface AuditEntry {
  accountId: string
  timestamp: string
  auditId: string
  actorEmail: string
  action: AuditAction
  reason: string
  before: Record<string, unknown>
  after: Record<string, unknown>
}

async function postAdminAction<T>(staffToken: string, path: string, body: unknown): Promise<ApiResponse<T>> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${staffToken}`,
    },
    body: JSON.stringify(body),
  })

  const parsed = (await response.json()) as ApiResponse<T>

  if (!response.ok && !parsed.error) {
    throw new Error(`Admin action request failed with status ${response.status}`)
  }

  return parsed
}

export async function toggleInternal(
  staffToken: string,
  accountId: string,
  isInternal: boolean,
  reason: string
): Promise<ApiResponse<AdminSubscription>> {
  return postAdminAction<AdminSubscription>(staffToken, `/api/admin/accounts/${accountId}/toggle-internal`, {
    isInternal,
    reason,
  })
}

export async function extendTrial(
  staffToken: string,
  accountId: string,
  newTrialEndsAt: string,
  reason: string
): Promise<ApiResponse<AdminSubscription>> {
  return postAdminAction<AdminSubscription>(staffToken, `/api/admin/accounts/${accountId}/extend-trial`, {
    newTrialEndsAt,
    reason,
  })
}

export async function changePlan(
  staffToken: string,
  accountId: string,
  plan: PlanTier,
  reason: string
): Promise<ApiResponse<AdminSubscription>> {
  return postAdminAction<AdminSubscription>(staffToken, `/api/admin/accounts/${accountId}/change-plan`, {
    plan,
    reason,
  })
}

export async function setOverrides(
  staffToken: string,
  accountId: string,
  overrides: SubscriptionOverrides,
  reason: string
): Promise<ApiResponse<AdminSubscription>> {
  return postAdminAction<AdminSubscription>(staffToken, `/api/admin/accounts/${accountId}/set-overrides`, {
    overrides,
    reason,
  })
}

export async function getAuditHistory(staffToken: string, accountId: string): Promise<ApiResponse<AuditEntry[]>> {
  const response = await fetch(`${BASE_URL}/api/admin/accounts/${accountId}/audit-log`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${staffToken}`,
    },
  })

  const parsed = (await response.json()) as ApiResponse<AuditEntry[]>

  if (!response.ok && !parsed.error) {
    throw new Error(`Admin audit history request failed with status ${response.status}`)
  }

  return parsed
}
