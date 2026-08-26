import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_POST_LOGIN_PATH,
  rememberPostLoginPath,
  safeNextPath,
  takePostLoginPath,
} from './post-login-redirect'

beforeEach(() => {
  sessionStorage.clear()
})

describe('safeNextPath', () => {
  it('accepts an ordinary in-app path', () => {
    expect(safeNextPath('/dashboard/leads/lead-1?source=chat&botId=bot-1')).toBe(
      '/dashboard/leads/lead-1?source=chat&botId=bot-1'
    )
  })

  // The whole reason this function exists. A client of this product opens links
  // that arrived over WhatsApp, so an open redirect here is reachable by anyone
  // who can get one message in front of them.
  it('rejects every off-origin form', () => {
    expect(safeNextPath('https://evil.com')).toBeNull()
    expect(safeNextPath('//evil.com')).toBeNull()
    expect(safeNextPath('/\\evil.com')).toBeNull()
    expect(safeNextPath('javascript:alert(1)')).toBeNull()
    expect(safeNextPath('dashboard/leads')).toBeNull()
  })

  it('rejects nothing at all', () => {
    expect(safeNextPath(null)).toBeNull()
    expect(safeNextPath(undefined)).toBeNull()
    expect(safeNextPath('')).toBeNull()
  })
})

describe('post-login path round trip', () => {
  it('returns the remembered path once', () => {
    rememberPostLoginPath('/dashboard/leads/lead-1?source=chat&botId=bot-1')

    expect(takePostLoginPath()).toBe('/dashboard/leads/lead-1?source=chat&botId=bot-1')
  })

  // A destination is good for exactly one login. Left behind, it would send the
  // NEXT sign-in in this tab to a lead the person already dealt with.
  it('clears the path so a second login lands on the default', () => {
    rememberPostLoginPath('/dashboard/leads/lead-1')

    takePostLoginPath()

    expect(takePostLoginPath()).toBe(DEFAULT_POST_LOGIN_PATH)
  })

  it('falls back to the dashboard when nothing was remembered', () => {
    expect(takePostLoginPath()).toBe(DEFAULT_POST_LOGIN_PATH)
  })

  // The guard has to hold on the way IN as well: a rejected path must not be
  // stored at all, rather than stored and screened later.
  it('never stores an off-origin path', () => {
    rememberPostLoginPath('//evil.com')

    expect(takePostLoginPath()).toBe(DEFAULT_POST_LOGIN_PATH)
  })
})
