// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { getRoutes, renderRoute } from '../../prerender-entry'

/**
 * A screen reader user moves through a page by its headings, so a page that
 * jumps from an h1 to an h4 reads as if two levels of it were missing. Nothing
 * looks wrong -- every heading here is sized by its classes, not its tag -- so
 * the only thing that notices a skipped level is this file or an audit.
 */

/** Public pages that are not prerendered, and so are not in getRoutes(). */
const UNPRERENDERED_ROUTES = ['/system-status', '/data-deletion-status', '/login', '/signup']

function headingLevels(html: string): number[] {
  return [...html.matchAll(/<h([1-6])[\s>]/g)].map((match) => Number(match[1]))
}

/** Each place a heading sits more than one level below the one before it. */
function skippedLevels(levels: number[]): string[] {
  return levels.flatMap((level, index) => {
    const previous = levels[index - 1] ?? level
    return level - previous > 1 ? [`h${previous} then h${level}`] : []
  })
}

function unlabelledSelects(html: string): number {
  return (html.match(/<select(?![^>]*aria-label)/g) ?? []).length
}

describe('skippedLevels', () => {
  it('flags a jump down of more than one level, and nothing else', () => {
    expect(skippedLevels([1, 2, 3, 2, 3, 4, 2])).toEqual([])
    expect(skippedLevels([1, 4, 2, 4])).toEqual(['h1 then h4', 'h2 then h4'])
  })
})

describe.each([...getRoutes(), ...UNPRERENDERED_ROUTES])('%s', (route) => {
  it('starts at an h1 and never skips a heading level', async () => {
    const levels = headingLevels((await renderRoute(route)).html)
    expect(levels[0]).toBe(1)
    expect(skippedLevels(levels)).toEqual([])
  })

  // A <select> with no label is announced as just "combo box".
  it('labels every dropdown', async () => {
    expect(unlabelledSelects((await renderRoute(route)).html)).toBe(0)
  })
})
