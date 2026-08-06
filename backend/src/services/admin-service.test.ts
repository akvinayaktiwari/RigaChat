import { beforeEach, describe, expect, it, vi } from 'vitest'

// admin-service imports a wide dependency tree (subscriptions, clients, audit
// log, entitlements) at module load, all of which resolve DynamoDB table names
// eagerly. Only the contact-message path is under test here, so the rest are
// mocked to keep this file from needing the full env.
vi.mock('../repositories/subscription-repository.js', () => ({
  getAllSubscriptions: vi.fn(),
  getByAccountId: vi.fn(),
  updatePartial: vi.fn(),
}))
vi.mock('../repositories/client-repository.js', () => ({ getClientById: vi.fn() }))
vi.mock('../repositories/audit-log-repository.js', () => ({
  getAuditHistory: vi.fn(),
  writeAuditEntry: vi.fn(),
}))
vi.mock('./entitlement-service.js', () => ({
  resolveEntitlements: vi.fn(),
  invalidateEntitlementsCache: vi.fn(),
}))

const getContactMessages = vi.fn()
vi.mock('../repositories/contact-message-repository.js', () => ({ getContactMessages }))

const { listContactMessages } = await import('./admin-service.js')

function message(messageId: string, notified: boolean) {
  return {
    messageId,
    name: 'Asha Rao',
    email: 'asha@example.com',
    subject: 'Demo request',
    message: 'Interested in a demo.',
    recordType: 'contact_message' as const,
    sourceIp: '203.0.113.9',
    notified,
    createdAt: '2026-08-04T10:00:00.000Z',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  getContactMessages.mockResolvedValue([message('a', true), message('b', false), message('c', true)])
})

describe('listContactMessages', () => {
  it('returns only un-notified messages by default — the ones nobody was emailed about', async () => {
    const result = await listContactMessages({ unnotifiedOnly: true })

    expect(result.map((m) => m.messageId)).toEqual(['b'])
  })

  it('returns everything when unnotifiedOnly is false', async () => {
    const result = await listContactMessages({ unnotifiedOnly: false })

    expect(result.map((m) => m.messageId)).toEqual(['a', 'b', 'c'])
  })

  it('returns everything when called with no options', async () => {
    const result = await listContactMessages()

    expect(result).toHaveLength(3)
  })

  it('passes the limit through to the repository', async () => {
    await listContactMessages({ limit: 10 })

    expect(getContactMessages).toHaveBeenCalledWith(10)
  })

  it('returns an empty list (not an error) when every message was emailed', async () => {
    getContactMessages.mockResolvedValue([message('a', true)])

    await expect(listContactMessages({ unnotifiedOnly: true })).resolves.toEqual([])
  })
})
