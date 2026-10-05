import { beforeEach, describe, expect, it, vi } from 'vitest'

const getByAccountId = vi.fn()
vi.mock('../repositories/subscription-repository.js', () => ({ getByAccountId }))

const getCachedEntitlements = vi.fn()
vi.mock('../repositories/redis-repository.js', () => ({
  getCachedEntitlements,
  setCachedEntitlements: vi.fn(),
  deleteCachedEntitlements: vi.fn(),
}))
vi.mock('../repositories/usage-repository.js', () => ({}))
vi.mock('../repositories/bot-repository.js', () => ({}))

const { resolveApiAccess } = await import('./entitlement-service.js')

function subscription(overrides: Record<string, unknown>) {
  return { accountId: 'client-1', status: 'active', plan: 'growth', addons: {}, overrides: {}, isInternal: false, ...overrides }
}

beforeEach(() => {
  vi.clearAllMocks()
  getCachedEntitlements.mockResolvedValue(null)
})

describe('resolveApiAccess', () => {
  it.each([
    ['free', null],
    ['starter', 'read'],
    ['growth', 'full'],
    ['agency', 'full'],
  ])('gives an active %s plan %s', async (plan, expected) => {
    getByAccountId.mockResolvedValue(subscription({ plan }))

    expect(await resolveApiAccess('client-1')).toBe(expected)
  })

  it('gives a trial account none', async () => {
    getByAccountId.mockResolvedValue(null)

    expect(await resolveApiAccess('client-1')).toBeNull()
  })

  it.each(['past_due', 'suspended', 'cancelled', 'trial_expired'])(
    'takes access away from a growth account that is %s',
    async (status) => {
      getByAccountId.mockResolvedValue(subscription({ status }))

      expect(await resolveApiAccess('client-1')).toBeNull()
    }
  )

  it('reads a cached entitlement from before the api field existed as no access', async () => {
    getCachedEntitlements.mockResolvedValue({ accountId: 'client-1', status: 'active', features: {} })

    expect(await resolveApiAccess('client-1')).toBeNull()
  })
})
