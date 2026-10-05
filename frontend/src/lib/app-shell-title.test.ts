import { describe, expect, it } from 'vitest'
import shell from '../../index.html?raw'
import landingPage from '../pages/LandingPage.tsx?raw'

/**
 * The prerender drops the shell's <title> on every page that sets its own, so
 * the shell's title is what the routes that are not prerendered show: login,
 * signup, the dashboard. It was typed once and left behind when the homepage
 * title changed, and the tab and GA4 kept reporting a product line the site
 * no longer used.
 */
describe('the app shell title', () => {
  const shellTitle = shell.match(/<title>([^<]*)<\/title>/)?.[1]
  const homeTitle = landingPage.match(/<PageMeta\s+title="([^"]*)"/)?.[1]

  it('is the homepage title', () => {
    expect(homeTitle).toBeTruthy()
    expect(shellTitle).toBe(homeTitle)
  })

  it('is the only title in the shell, so the prerender has one tag to drop', () => {
    expect(shell.match(/<title[\s>]/g)).toHaveLength(1)
  })
})
