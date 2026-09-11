import { useEffect, useState } from 'react'

/**
 * The two preference-level reasons never to start the canvas at all.
 *
 * Both are media queries rather than one-off reads, because both can change
 * while the page is open -- a system motion setting toggled in another window,
 * or a phone rotated across the breakpoint. Reading them once on mount left the
 * hero animating for a user who had just asked it not to.
 */
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

/**
 * Below this the canvas is skipped entirely. Small screens get the least out of
 * an ambient background -- most of the field sits behind the stacked hero
 * content -- and pay the most for it in battery.
 */
const MIN_WIDTH = '(min-width: 768px)'

function matches(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(query).matches
}

/** True only when the viewport is wide enough AND the user has not asked for less motion. */
export function useAuroraGuards(): boolean {
  const [allowed, setAllowed] = useState<boolean>(
    () => !matches(REDUCED_MOTION) && matches(MIN_WIDTH),
  )

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

    const motion = window.matchMedia(REDUCED_MOTION)
    const width = window.matchMedia(MIN_WIDTH)
    const sync = () => setAllowed(!motion.matches && width.matches)

    sync()
    motion.addEventListener('change', sync)
    width.addEventListener('change', sync)

    return () => {
      motion.removeEventListener('change', sync)
      width.removeEventListener('change', sync)
    }
  }, [])

  return allowed
}
