import { describe, expect, it } from 'vitest'
import { siteOrigin } from './site'

describe('siteOrigin', () => {
  it('takes the origin of the login redirect, dropping the callback path', () => {
    expect(siteOrigin('https://vyostra.com/auth/callback')).toBe('https://vyostra.com')
  })

  it('keeps a non-default port, which local builds use', () => {
    expect(siteOrigin('http://localhost:5173/auth/callback')).toBe('http://localhost:5173')
  })

  it('is empty when the variable is unset', () => {
    expect(siteOrigin(undefined)).toBe('')
    expect(siteOrigin('')).toBe('')
  })

  it('throws on a malformed value instead of emitting a broken canonical', () => {
    expect(() => siteOrigin('vyostra.com/auth/callback')).toThrow(/not a valid URL/)
  })
})
