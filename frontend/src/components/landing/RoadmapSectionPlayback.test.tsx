import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RoadmapSection from './RoadmapSection'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('RoadmapSection journey playback', () => {
  // Its own file because motion/react's useReducedMotion caches the first
  // preference it reads per module instance -- sharing a file with the
  // reduced-motion case would make whichever test ran second assert against
  // the other one's preference.
  it('starts with every step still to come', () => {
    const { container } = render(<RoadmapSection />)

    // Playback has not advanced yet, so all seven read as pending. This is the
    // half of the contract the reduced-motion test cannot see: if dimming ever
    // stopped rendering, that test would still pass on a count of zero.
    expect(container.querySelectorAll('.opacity-45')).toHaveLength(7)
  })

  // The steps look interactive -- they lift, glow and change under a pointer --
  // so they have to BE interactive. They were plain divs: a reader who clicked
  // one got nothing back, and a keyboard reader could not reach them at all.
  it('pins a step when it is clicked, and releases it when clicked again', () => {
    render(<RoadmapSection />)

    const step = screen.getByRole('button', { name: /Checks: Visit booked yet\?/ })
    expect(step.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(step)
    expect(step.getAttribute('aria-pressed')).toBe('true')

    // Clicking the pinned step releases it. Without this a reader who pinned a
    // card would have no way to hand the journey back to its timer.
    fireEvent.click(step)
    expect(step.getAttribute('aria-pressed')).toBe('false')
  })

  it('gives every step an accessible name carrying its timing', () => {
    render(<RoadmapSection />)

    // The timing line ("up to 24 hours") is what makes each step meaningful,
    // and it is the part a screen reader would otherwise get last or not at all.
    expect(
      screen.getByRole('button', { name: 'Hands off: Over to your team, instead of nagging' }),
    ).toBeDefined()
    expect(screen.getAllByRole('button', { name: /Agent:/ })).toHaveLength(3)
  })
})
