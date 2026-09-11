import { render, cleanup } from '@testing-library/react'
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
})
