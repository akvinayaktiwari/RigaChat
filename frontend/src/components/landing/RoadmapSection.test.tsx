import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RoadmapSection from './RoadmapSection'
import { setReducedMotion } from '../../test-setup'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  setReducedMotion(false)
})

describe('RoadmapSection journey strip', () => {
  // The strip plays itself, lighting one step at a time and dimming the ones it
  // has not reached. Under reduced motion there is no playback to watch, so the
  // journey has to present its FINISHED state -- all seven steps legible at
  // once. Freezing playback at its starting index instead would leave every
  // card at 45% opacity: a reader who asked for less motion would get a greyed
  // out diagram rather than a still one, which is worse than the animation.
  //
  // This is the only test in this file, deliberately. motion/react's
  // useReducedMotion caches the first value it reads in module scope, so a
  // second test here would inherit this one's preference no matter what
  // setReducedMotion says. A complementary "unreached steps are dimmed" case
  // needs its own file.
  it('shows every step at full strength under prefers-reduced-motion', () => {
    setReducedMotion(true)

    const { container } = render(<RoadmapSection />)

    expect(screen.getByText('Greets the new lead')).toBeDefined()
    expect(screen.getByText('Over to your team')).toBeDefined()
    expect(container.querySelectorAll('.journey-track > *')).toHaveLength(7)
    expect(container.querySelectorAll('.opacity-45')).toHaveLength(0)
  })
})
