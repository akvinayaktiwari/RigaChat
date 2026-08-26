import { beforeEach, describe, expect, it, vi } from 'vitest'

const createClient = vi.fn()
const getClientById = vi.fn()
const updateClient = vi.fn()
vi.mock('../repositories/client-repository.js', () => ({
  createClient: (...a: unknown[]) => createClient(...a),
  getClientById: (...a: unknown[]) => getClientById(...a),
  updateClient: (...a: unknown[]) => updateClient(...a),
}))

const createSubscription = vi.fn()
const getByAccountId = vi.fn()
vi.mock('../repositories/subscription-repository.js', () => ({
  create: (...a: unknown[]) => createSubscription(...a),
  getByAccountId: (...a: unknown[]) => getByAccountId(...a),
}))

const countBotsForClient = vi.fn()
vi.mock('../repositories/bot-repository.js', () => ({
  countBotsForClient: (...a: unknown[]) => countBotsForClient(...a),
}))

const { upsertClient, ensureTrialSubscription, getAppBootstrap } = await import('./client-service.js')

const CLIENT_ID = 'client-1'
const SIGNED_UP_AT = '2026-07-09T16:14:12.496Z'

const clientRecord = {
  clientId: CLIENT_ID,
  email: 'someone@example.com',
  name: 'Someone',
  authProvider: 'email' as const,
  plan: 'starter' as const,
  createdAt: SIGNED_UP_AT,
}

// Repositories throw synchronously rather than returning a rejected promise.
// The code under test awaits them inside try/catch, which handles both
// identically, and Vitest's tracking of a mock's returned promise otherwise
// strands a derived rejection and reports it as a phantom extra failure.
function failWith(mock: ReturnType<typeof vi.fn>, times: number, error: Error): void {
  let seen = 0
  mock.mockImplementation(() => {
    seen++
    if (seen <= times) throw error
    return Promise.resolve(clientRecord)
  })
}

beforeEach(() => {
  createClient.mockReset()
  getClientById.mockReset()
  updateClient.mockReset()
  createSubscription.mockReset()
  getByAccountId.mockReset()
  // restoreAllMocks first: a spyOn spy persists across tests, so without this
  // the "no alarm on a successful retry" assertion sees console.error calls
  // made by the preceding tests rather than its own.
  vi.restoreAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

// THE INVARIANT THIS FILE EXISTS TO PROTECT.
//
// A failed subscription write must never fail a signup whose client row already
// succeeded -- losing the account is strictly worse than losing the trial row.
// But on 2026-08-22 four clients were found with no subscriptions row from
// signups six weeks earlier, and nothing had surfaced: /api/billing/subscribe
// threw NO_SUBSCRIPTION_RECORD and 500'd forever, while computeEntitlements()
// treats a null subscription as a full trial with no expiry, so they also had
// unlimited access. Both directions, silently.
describe('when the trial subscription write fails at signup', () => {
  const boom = new Error('DynamoDB throttled')

  it('still returns the created client rather than failing the signup', async () => {
    getClientById.mockResolvedValue(null)
    createClient.mockResolvedValue(clientRecord)
    createSubscription.mockImplementation(() => {
      throw boom
    })

    await expect(
      upsertClient({ clientId: CLIENT_ID, email: clientRecord.email, name: clientRecord.name, authProvider: 'email' })
    ).resolves.toEqual(clientRecord)
  })

  it('retries before giving up, since a throttle is usually transient', async () => {
    getClientById.mockResolvedValue(null)
    createClient.mockResolvedValue(clientRecord)
    createSubscription.mockImplementation(() => {
      throw boom
    })

    await upsertClient({ clientId: CLIENT_ID, email: clientRecord.email, name: clientRecord.name, authProvider: 'email' })

    expect(createSubscription.mock.calls.length).toBeGreaterThan(1)
  })

  it('succeeds without alarming when a retry works', async () => {
    getClientById.mockResolvedValue(null)
    createClient.mockResolvedValue(clientRecord)
    failWith(createSubscription, 1, boom)

    await upsertClient({ clientId: CLIENT_ID, email: clientRecord.email, name: clientRecord.name, authProvider: 'email' })

    expect(console.error).not.toHaveBeenCalled()
  })

  // The failure that actually happened was invisible. If every attempt fails,
  // that has to be loud enough to alert on and name the repair.
  it('logs an alertable marker once every attempt has failed', async () => {
    getClientById.mockResolvedValue(null)
    createClient.mockResolvedValue(clientRecord)
    createSubscription.mockImplementation(() => {
      throw boom
    })

    await upsertClient({ clientId: CLIENT_ID, email: clientRecord.email, name: clientRecord.name, authProvider: 'email' })

    const logged = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls.flat().join(' ')
    expect(logged).toContain('[signup-integrity]')
    expect(logged).toContain(CLIENT_ID)
    expect(logged).toContain('repair-missing-trial-subscriptions')
  })
})

describe('ensureTrialSubscription', () => {
  it('returns the existing row without writing anything', async () => {
    const existing = { accountId: CLIENT_ID, status: 'active' }
    getByAccountId.mockResolvedValue(existing)

    await expect(ensureTrialSubscription(CLIENT_ID)).resolves.toBe(existing)
    expect(createSubscription).not.toHaveBeenCalled()
  })

  it('creates the row signup should have written when it is missing', async () => {
    getByAccountId.mockResolvedValue(null)
    getClientById.mockResolvedValue(clientRecord)
    createSubscription.mockImplementation((row: unknown) => Promise.resolve(row))

    await ensureTrialSubscription(CLIENT_ID)

    expect(createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: CLIENT_ID, status: 'trialing', plan: 'free', isInternal: false })
    )
  })

  // Repairing a six-week-old account must not hand it a fresh 14 days as a
  // reward for the bug -- it gets exactly the window it was originally due.
  it('backdates the trial to the client signup date, not now', async () => {
    getByAccountId.mockResolvedValue(null)
    getClientById.mockResolvedValue(clientRecord)
    createSubscription.mockImplementation((row: unknown) => Promise.resolve(row))

    await ensureTrialSubscription(CLIENT_ID)

    const row = createSubscription.mock.calls[0][0] as { trialStartedAt: string; trialEndsAt: string }
    expect(row.trialStartedAt).toBe(SIGNED_UP_AT)
    expect(new Date(row.trialEndsAt).getTime()).toBeLessThan(Date.now())
  })

  it('returns null when no client record exists, rather than inventing one', async () => {
    getByAccountId.mockResolvedValue(null)
    getClientById.mockResolvedValue(null)

    await expect(ensureTrialSubscription(CLIENT_ID)).resolves.toBeNull()
    expect(createSubscription).not.toHaveBeenCalled()
  })
})

// The mobile app's launch call. Readiness is bot count > 0 (decision D1), and
// capabilities are the runtime half of the web/mobile contract -- see
// vyostra-mobile docs/designs/web-mobile-contract.md.
describe('getAppBootstrap', () => {
  beforeEach(() => {
    countBotsForClient.mockReset()
  })

  it('gates a client with no bots and hands back no capabilities', async () => {
    countBotsForClient.mockResolvedValue(0)

    await expect(getAppBootstrap('client-1')).resolves.toEqual({
      ready: false,
      reason: 'no_bot',
      capabilities: [],
    })
  })

  it('unlocks at one bot and declares the phase-1 capabilities', async () => {
    countBotsForClient.mockResolvedValue(1)

    await expect(getAppBootstrap('client-1')).resolves.toEqual({
      ready: true,
      capabilities: ['lead.read', 'lead.state', 'lead.note'],
    })
  })

  // A capability the app cannot render yet must not be advertised: an installed
  // build would show a control for a screen that does not exist.
  it('does not advertise lead.timeline while it is still phase 2', async () => {
    countBotsForClient.mockResolvedValue(3)

    const bootstrap = await getAppBootstrap('client-1')

    expect(bootstrap.capabilities).not.toContain('lead.timeline')
  })

  it('reads bot count scoped to the caller, never across clients', async () => {
    countBotsForClient.mockResolvedValue(2)

    await getAppBootstrap('client-42')

    expect(countBotsForClient).toHaveBeenCalledWith('client-42')
  })
})
