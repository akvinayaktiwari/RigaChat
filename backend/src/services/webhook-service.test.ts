import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// This test only exercises verifyGupshupWebhookToken, which has zero
// dependency on Razorpay -- mocked here purely because
// webhook-service.ts's top-level import of razorpay-provider.js requires
// real RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET env vars to even load. Same
// "mock the boundary this test doesn't exercise" pattern used elsewhere
// (e.g. scheduler-service.test.ts's whatsapp-service.js mock).
vi.mock('../providers/razorpay-provider.js', () => ({ razorpayProvider: {} }))
vi.mock('./entitlement-service.js', () => ({ invalidateEntitlementsCache: vi.fn() }))

const { verifyGupshupWebhookToken } = await import('./webhook-service.js')

const ORIGINAL_TOKEN = process.env.GUPSHUP_WEBHOOK_TOKEN

describe('verifyGupshupWebhookToken', () => {
  beforeEach(() => {
    process.env.GUPSHUP_WEBHOOK_TOKEN = 'correct-secret'
  })

  afterEach(() => {
    process.env.GUPSHUP_WEBHOOK_TOKEN = ORIGINAL_TOKEN
  })

  it('accepts the correct token', () => {
    expect(verifyGupshupWebhookToken('correct-secret')).toBe(true)
  })

  it('rejects a wrong token', () => {
    expect(verifyGupshupWebhookToken('wrong-secret')).toBe(false)
  })

  it('rejects a missing token', () => {
    expect(verifyGupshupWebhookToken(undefined)).toBe(false)
  })

  // Regression guard: a naive substring/prefix comparison could accept
  // "correct-secret-extra" or similar. timingSafeEqual requires equal
  // buffer length, which the length check before it enforces explicitly
  // (timingSafeEqual itself throws on mismatched lengths rather than
  // returning false).
  it('rejects a token that only differs in length', () => {
    expect(verifyGupshupWebhookToken('correct-secret-extra')).toBe(false)
    expect(verifyGupshupWebhookToken('correct-secre')).toBe(false)
  })

  it('throws when GUPSHUP_WEBHOOK_TOKEN is not configured', () => {
    delete process.env.GUPSHUP_WEBHOOK_TOKEN
    expect(() => verifyGupshupWebhookToken('anything')).toThrow(/GUPSHUP_WEBHOOK_TOKEN/)
  })
})
