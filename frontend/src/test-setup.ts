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

/** Flips the prefers-reduced-motion answer for the current test. */
export function setReducedMotion(enabled: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: enabled && query.includes('prefers-reduced-motion'),
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
