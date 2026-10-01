// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { getRoutes, renderRoute } from '../../prerender-entry'

/** Public pages that are not prerendered, and so are not in getRoutes(). */
const UNPRERENDERED_ROUTES = ['/system-status', '/data-deletion-status', '/login', '/signup']

function unlabelledSelects(html: string): number {
  return (html.match(/<select(?![^>]*aria-label)/g) ?? []).length
}

describe.each([...getRoutes(), ...UNPRERENDERED_ROUTES])('%s', (route) => {
  // A <select> with no label is announced as just "combo box".
  it('labels every dropdown', async () => {
    expect(unlabelledSelects((await renderRoute(route)).html)).toBe(0)
  })
})
