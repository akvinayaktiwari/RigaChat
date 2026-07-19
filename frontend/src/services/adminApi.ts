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
