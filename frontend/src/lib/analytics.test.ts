import { describe, expect, it } from 'vitest'
import { isTrackedPath } from './analytics'

describe('isTrackedPath', () => {
  it('tracks the marketing pages', () => {
    expect(isTrackedPath('/')).toBe(true)
    expect(isTrackedPath('/features/chatbot')).toBe(true)
    expect(isTrackedPath('/blog/some-post')).toBe(true)
    expect(isTrackedPath('/pricing')).toBe(true)
    expect(isTrackedPath('/login')).toBe(true)
  })

  // The whole point of the function. Dashboard traffic in a marketing property
  // makes every acquisition number meaningless, and the widget test routes and
  // lead links carry customer identifiers in the path.
  it('never tracks the signed-in app, lead links or test harnesses', () => {
    expect(isTrackedPath('/dashboard')).toBe(false)
    expect(isTrackedPath('/dashboard/leads/lead-1')).toBe(false)
    expect(isTrackedPath('/admin/login')).toBe(false)
    expect(isTrackedPath('/admin/contact-messages')).toBe(false)
    expect(isTrackedPath('/l/some-opaque-token')).toBe(false)
    expect(isTrackedPath('/widget-test')).toBe(false)
    expect(isTrackedPath('/widget-test/preview')).toBe(false)
    expect(isTrackedPath('/form-test/preview')).toBe(false)
    expect(isTrackedPath('/voice-test/preview')).toBe(false)
  })

  // A prefix must match whole segments, or the first marketing page whose slug
  // happens to start with an excluded word silently stops being measured.
  it('matches on segment boundaries, not on string prefix', () => {
    expect(isTrackedPath('/administration')).toBe(true)
    expect(isTrackedPath('/dashboards-for-agencies')).toBe(true)
    expect(isTrackedPath('/lead-generation')).toBe(true)
  })
})
