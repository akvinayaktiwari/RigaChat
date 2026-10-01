/**
 * What happens when the animation engine never arrives.
 *
 * The engine is its own chunk (see MotionProvider). Until it loads, an `m.*`
 * element sits in its `initial` state, which for every reveal on the site is
 * `opacity: 0`. If the chunk 404s after a deploy, or a flaky connection drops
 * it, nothing would ever animate that content back in.
 *
 * So the loader is given a deadline. On a failed import, or when the deadline
 * passes, <html> gets MOTION_UNAVAILABLE_CLASS and one rule in index.css shows
 * everything in its final state. It is CSS rather than a re-render on purpose:
 * an `m.*` element reads `initial` once at mount, so React could only undo it
 * by remounting the page, which would throw away whatever the visitor was doing
 * -- and on a slow connection that is exactly who hits the deadline.
 *
 * The class is never removed. A chunk that turns up late still drives its
 * animations, the rule simply wins over them, so nothing blinks out and back.
 */

export const MOTION_UNAVAILABLE_CLASS = 'motion-unavailable'

/** Long enough for a 14 kB chunk on a poor mobile connection, short enough that
 *  a page with invisible sections does not read as broken. */
export const MOTION_LOAD_TIMEOUT_MS = 4000

export function markMotionUnavailable(): void {
  document.documentElement.classList.add(MOTION_UNAVAILABLE_CLASS)
}

/**
 * Wraps a feature import with the deadline and the failure path.
 *
 * A failed import resolves to a promise that never settles rather than
 * rejecting: LazyMotion does not catch, so a rejection would surface as an
 * unhandled error for a failure that has already been handled here.
 */
export function createMotionLoader<Features>(
  importFeatures: () => Promise<Features>,
  timeoutMs: number = MOTION_LOAD_TIMEOUT_MS
): () => Promise<Features> {
  return async function loadWithFallback(): Promise<Features> {
    const deadline = setTimeout(markMotionUnavailable, timeoutMs)

    try {
      return await importFeatures()
    } catch (error) {
      console.warn('[motion] animation chunk failed to load; showing content without animation', error)
      markMotionUnavailable()
      return new Promise<Features>(() => {})
    } finally {
      clearTimeout(deadline)
    }
  }
}
