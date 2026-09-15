// @vitest-environment node
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { detectRegion } from '../../lib/pricingTiers'
import { bootedFromPrerender, isServerRender } from '../../lib/prerender-boot'
import { Reveal, RevealGroup, RevealItem } from './motion-primitives'
import StatsBar from './StatsBar'

/**
 * What the build-time prerender bakes into the static homepage. These run in a
 * node environment -- no window -- because that is the prerender's world, and
 * every failure here ships silently: the page still renders, just wrong for
 * every crawler that reads it.
 */
describe('landing components in a server render', () => {
  it('knows it is on the server, and that nothing booted from prerendered HTML', () => {
    expect(isServerRender()).toBe(true)
    expect(bootedFromPrerender()).toBe(false)
  })

  // Entrance animations start at opacity 0 and only a browser animates them
  // back; in static HTML that would be the final state forever.
  it('renders reveal wrappers visible, not at their animation start', () => {
    const html = renderToString(
      <>
        <Reveal>headline</Reveal>
        <RevealGroup>
          <RevealItem>card</RevealItem>
        </RevealGroup>
      </>,
    )
    expect(html).toContain('headline')
    expect(html).not.toMatch(/opacity:\s*0/)
  })

  it('renders the stats at their real values, not the count-up start of 0', () => {
    const html = renderToString(<StatsBar />).replace(/<!-- -->/g, '')
    expect(html).toContain('50,000+')
    expect(html).toContain('500+')
  })

  // CI builds in UTC; timezone detection there would bake dollar prices in.
  it('prices in rupees regardless of the build machine timezone', () => {
    expect(detectRegion()).toBe('in')
  })
})
