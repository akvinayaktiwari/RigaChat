import { useEffect, useState } from 'react'

/**
 * The one preference-level reason never to start the canvas.
 *
 * A media query rather than a one-off read, because it can change while the
 * page is open -- a system motion setting toggled in another window. Reading it
 * once on mount left the hero animating for a user who had just asked it not
 * to.
 *
 * Screen size is deliberately NOT a guard here. Phones get the field too, at a
 * lighter render budget and with a falloff that clears the stacked copy; see
 * STACKED_RESOLUTION_SCALE in ./gl and falloffStacked in ./shaders.
 */
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

/** Below this the hero stacks into one column and the field has to move. */
export const WIDE_LAYOUT = '(min-width: 1024px)'

function matches(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(query).matches
}

/** True unless the user has asked for less motion. */
export function useAuroraGuards(): boolean {
  const [allowed, setAllowed] = useState<boolean>(() => !matches(REDUCED_MOTION))

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

    const motion = window.matchMedia(REDUCED_MOTION)
    const sync = () => setAllowed(!motion.matches)

    sync()
    motion.addEventListener('change', sync)

    return () => motion.removeEventListener('change', sync)
  }, [])

  return allowed
}

/** True when the hero is the two-column desktop layout. */
export function isWideLayout(): boolean {
  return matches(WIDE_LAYOUT)
}
