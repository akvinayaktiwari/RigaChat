import { describe, expect, it } from 'vitest'
import {
  failureReasonOf,
  MetaConnectError,
  MetaMisconfiguredError,
  MetaNoPagesError,
  MetaPagesLookupError,
  MetaPageAlreadyConnectedError,
  MetaPermissionDeclinedError,
  MetaTokenExchangeError,
} from './meta-connect-errors.js'

// The point of this module is that a client never again sees "try again" for a
// failure that retrying cannot fix. These tests pin the reason each failure
// reports, because the reason is what the dashboard turns into advice.

describe('failureReasonOf', () => {
  it('reports no_pages for a client who manages no Facebook Page', () => {
    // The one failure here a client can fix themselves, and the one that used
    // to be flattened into "Failed to connect. Please try again."
    expect(failureReasonOf(new MetaNoPagesError())).toBe('no_pages')
  })

  it('reports page_already_connected for a Page claimed by another account', () => {
    expect(failureReasonOf(new MetaPageAlreadyConnectedError())).toBe('page_already_connected')
  })

  it('reports permission_declined when consent was refused', () => {
    expect(failureReasonOf(new MetaPermissionDeclinedError())).toBe('permission_declined')
  })

  it('reports token_exchange_failed and pages_lookup_failed separately', () => {
    expect(failureReasonOf(new MetaTokenExchangeError('bad redirect_uri'))).toBe(
      'token_exchange_failed'
    )
    expect(failureReasonOf(new MetaPagesLookupError('rate limited'))).toBe('pages_lookup_failed')
  })

  it('reports misconfigured for our own setup problems, not the client’s', () => {
    expect(failureReasonOf(new MetaMisconfiguredError('localhost redirect'))).toBe('misconfigured')
  })

  // The generic bucket must stay genuinely generic: an unrecognised failure is
  // the only thing allowed to say "try again".
  it('falls back to auth_failed for anything unrecognised', () => {
    expect(failureReasonOf(new Error('something else entirely'))).toBe('auth_failed')
    expect(failureReasonOf('a string')).toBe('auth_failed')
    expect(failureReasonOf(null)).toBe('auth_failed')
    expect(failureReasonOf(undefined)).toBe('auth_failed')
  })
})

describe('error messages', () => {
  it('keeps the actionable sentence on the no-pages error', () => {
    expect(new MetaNoPagesError().message).toMatch(/Connect a Page you manage/)
  })

  it('carries Meta’s own detail through on a token exchange failure', () => {
    // The detail is for our logs, not the client -- but losing it would make a
    // redirect_uri mismatch undiagnosable.
    expect(new MetaTokenExchangeError('redirect_uri mismatch').message).toContain(
      'redirect_uri mismatch'
    )
  })
})

describe('class hierarchy', () => {
  // The callback reads `.reason` off any connect failure rather than
  // instanceof-ing each class, so every one of them must be a MetaConnectError.
  it('makes every connect failure a MetaConnectError', () => {
    const errors = [
      new MetaNoPagesError(),
      new MetaPageAlreadyConnectedError(),
      new MetaPermissionDeclinedError(),
      new MetaTokenExchangeError('x'),
      new MetaPagesLookupError('x'),
      new MetaMisconfiguredError('x'),
    ]
    for (const error of errors) {
      expect(error).toBeInstanceOf(MetaConnectError)
      expect(error).toBeInstanceOf(Error)
    }
  })

  it('keeps each class distinguishable by name for log triage', () => {
    expect(new MetaNoPagesError().name).toBe('MetaNoPagesError')
    expect(new MetaMisconfiguredError('x').name).toBe('MetaMisconfiguredError')
  })
})
