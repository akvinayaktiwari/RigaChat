import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

/**
 * MEASUREMENT_ID is read from import.meta.env at module load, and
 * isAnalyticsEnabled() is false under DEV, so the tag is only reachable from a
 * freshly imported copy of the module with both stubbed.
 */
async function loadAnalyticsAsProduction(): Promise<typeof import('./analytics')> {
  vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TESTID0000')
  vi.stubEnv('DEV', false)
  vi.resetModules()
  return import('./analytics')
}

interface TaggedWindow extends Window {
  dataLayer?: unknown[]
  gtag?: unknown
}

describe('initAnalytics', () => {
  beforeEach(() => {
    const w = window as TaggedWindow
    delete w.dataLayer
    delete w.gtag
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  // The bug that made GA4 report nothing while every other signal said the tag
  // was live: the queue held plain arrays. gtag.js only treats a dataLayer
  // entry as a command when it is an `arguments` object, and drops anything
  // else without a word, so config, consent and every page_view went nowhere.
  it('queues commands as arguments objects, the only shape gtag.js executes', async () => {
    const { initAnalytics, trackPageView } = await loadAnalyticsAsProduction()

    initAnalytics()
    trackPageView('/pricing', 'Pricing')

    const queue = (window as TaggedWindow).dataLayer ?? []
    expect(queue.length).toBeGreaterThan(0)
    for (const entry of queue) {
      expect(Object.prototype.toString.call(entry)).toBe('[object Arguments]')
    }
  })

  it('sends consent, js, config and the page view in that order', async () => {
    const { initAnalytics, trackPageView } = await loadAnalyticsAsProduction()

    initAnalytics()
    trackPageView('/pricing', 'Pricing')

    const queue = (window as TaggedWindow).dataLayer ?? []
    const commands = queue.map((entry) => (entry as IArguments)[0] as string)
    expect(commands).toEqual(['consent', 'js', 'config', 'event'])
  })

  // An untracked route must not reach the queue at all -- not merely be
  // filtered inside GA, where the path would already have been transmitted.
  it('queues nothing for the signed-in app', async () => {
    const { initAnalytics, trackPageView } = await loadAnalyticsAsProduction()

    initAnalytics()
    const queuedAfterInit = ((window as TaggedWindow).dataLayer ?? []).length
    trackPageView('/dashboard/leads/lead-1', 'Leads')

    expect(((window as TaggedWindow).dataLayer ?? []).length).toBe(queuedAfterInit)
  })
})
