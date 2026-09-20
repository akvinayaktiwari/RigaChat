import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import StatsBar from './StatsBar'
import { setReducedMotion } from '../../test-setup'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  setReducedMotion(false)
})

describe('StatsBar', () => {
  // The regression this file exists for. `counting = reduced ? true : inView`
  // made `active` true under reduced motion, which is the flag that SCHEDULES
  // the animation -- so the counter seeded its final value and then animated up
  // from zero anyway, doing the opposite of what the preference asks. The seed
  // alone can never prove correctness here; only "no frame was ever requested"
  // can, because the bug lived entirely in the effect.
  it('never animates under prefers-reduced-motion', () => {
    setReducedMotion(true)
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame')

    render(<StatsBar />)

    expect(raf).not.toHaveBeenCalled()
  })

  it('renders every stat at its final value under prefers-reduced-motion', () => {
    setReducedMotion(true)

    render(<StatsBar />)

    // Final values, on the first paint, with no ticking.
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByText('24/7')).toBeTruthy()
    expect(screen.getByText('$49')).toBeTruthy()
    expect(screen.getByText('1')).toBeTruthy()
  })

  it('keeps the prefix and suffix attached to the counted number', () => {
    setReducedMotion(true)

    render(<StatsBar />)

    // The counter owns the formatting, which is why a stat is stored as
    // value/prefix/suffix rather than as a display string: "24/7" has no
    // single correct parse back into a number to animate.
    expect(screen.getByText('$49')).toBeTruthy()
    expect(screen.getByText('24/7')).toBeTruthy()
    // No current stat reaches four digits, so the thousands separator in
    // StatValue is unexercised here. It stays for the next stat that needs it.
  })

  // Deliberately NOT tested here: "out of view, motion allowed, holds at zero".
  // jsdom has no layout, so a stubbed IntersectionObserver cannot faithfully
  // report non-intersection -- such a test would assert the stub's behaviour
  // rather than the component's, and would pass whether or not the real
  // trigger works. That path belongs in a browser check, not here.
})
