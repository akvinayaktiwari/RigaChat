import { describe, expect, it } from 'vitest'

import {
  buildLeadAdsOAuthState,
  buildWhatsAppOAuthState,
  clientIdFromState,
  isWhatsAppOAuthState,
} from './meta-oauth-state.js'

const CLIENT_ID = '91130d2a-10f1-703c-5a21-0e70ba5dac0c'

describe('meta OAuth state discrimination', () => {
  it('recognises a WhatsApp state', () => {
    expect(isWhatsAppOAuthState(buildWhatsAppOAuthState(CLIENT_ID))).toBe(true)
  })

  // The important one: Lead Ads is pending App Review, and a false positive
  // here would divert its callback into the WhatsApp handler and break it.
  it('never mistakes a Lead Ads state for a WhatsApp one, across many samples', () => {
    for (let i = 0; i < 500; i++) {
      expect(isWhatsAppOAuthState(buildLeadAdsOAuthState(CLIENT_ID))).toBe(false)
    }
  })

  it('treats a missing state as not-WhatsApp', () => {
    expect(isWhatsAppOAuthState(undefined)).toBe(false)
  })

  it('recovers the clientId from either state shape', () => {
    expect(clientIdFromState(buildWhatsAppOAuthState(CLIENT_ID))).toBe(CLIENT_ID)
    expect(clientIdFromState(buildLeadAdsOAuthState(CLIENT_ID))).toBe(CLIENT_ID)
  })
})
