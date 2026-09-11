import { vi } from 'vitest'

/**
 * jsdom implements neither IntersectionObserver nor matchMedia, and the landing
 * components depend on both: `useInView` needs the former, `useReducedMotion`
 * needs the latter. Without these stubs a test that renders any landing section
 * either throws or silently takes the non-reduced branch -- which is precisely
 * why the reduced-motion count-up bug shipped with nothing able to catch it.
 *
 * matchMedia defaults to matches:false so tests opt INTO reduced motion
 * explicitly via setReducedMotion(true); a default of true would flip every
 * unrelated test onto the reduced branch without saying so.
 */

class MockIntersectionObserver implements IntersectionObserver {
  readonly root = null
  readonly rootMargin = ''
  readonly thresholds: ReadonlyArray<number> = []
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

/**
 * Answers a `(min-width: Npx)` query against jsdom's viewport, which is 1024px
 * wide by default. The stub used to return false for every non-motion query,
 * which reported a phone-width viewport to anything that asked -- so a
 * component gated on a width breakpoint could never be exercised at all.
 */
function matchesWidth(query: string): boolean {
  const min = /\(min-width:\s*(\d+)px\)/.exec(query)
  if (min) return window.innerWidth >= Number(min[1])

  const max = /\(max-width:\s*(\d+)px\)/.exec(query)
  if (max) return window.innerWidth <= Number(max[1])

  return false
}

/** Flips the prefers-reduced-motion answer for the current test. */
export function setReducedMotion(enabled: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion')
      ? enabled
      : matchesWidth(query),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

setReducedMotion(false)
