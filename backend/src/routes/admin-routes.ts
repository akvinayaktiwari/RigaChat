import { Hono } from 'hono'
import { requireStaffAuth } from '../lib/cognito-staff.js'
import { listAccountsWithEntitlements } from '../services/admin-service.js'
import type { ApiResponse } from '../types/index.js'

export const adminRoutes = new Hono()

adminRoutes.use('*', requireStaffAuth)

adminRoutes.get('/accounts', async (c) => {
  try {
    const accounts = await listAccountsWithEntitlements()
    return c.json<ApiResponse<typeof accounts>>({ success: true, data: accounts }, 200)
  } catch (error) {
    console.error('Admin accounts list error:', error)
    return c.json<ApiResponse<null>>({ success: false, error: 'Failed to load accounts' }, 500)
  }
})
