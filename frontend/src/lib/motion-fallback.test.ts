import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MOTION_UNAVAILABLE_CLASS, createMotionLoader } from './motion-fallback'

const TIMEOUT_MS = 1000

function isMarkedUnavailable(): boolean {
  return document.documentElement.classList.contains(MOTION_UNAVAILABLE_CLASS)
}

describe('createMotionLoader', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    document.documentElement.classList.remove(MOTION_UNAVAILABLE_CLASS)
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns the features and leaves the page alone when the chunk loads in time', async () => {
    const load = createMotionLoader(async () => 'features', TIMEOUT_MS)

    await expect(load()).resolves.toBe('features')
    vi.advanceTimersByTime(TIMEOUT_MS * 2)

    expect(isMarkedUnavailable()).toBe(false)
  })

  it('shows content when the chunk fails to load, without rejecting', async () => {
    const load = createMotionLoader<string>(async () => {
      throw new Error('Failed to fetch dynamically imported module')
    }, TIMEOUT_MS)
    const settled = vi.fn()

    void load().then(settled, settled)
    await vi.advanceTimersByTimeAsync(0)

    expect(isMarkedUnavailable()).toBe(true)
    expect(settled).not.toHaveBeenCalled()
  })

  it('shows content when the chunk has not arrived by the deadline', async () => {
    const load = createMotionLoader(() => new Promise<string>(() => {}), TIMEOUT_MS)

    void load()
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS - 1)
    expect(isMarkedUnavailable()).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    expect(isMarkedUnavailable()).toBe(true)
  })

  it('keeps content shown when the chunk arrives after the deadline', async () => {
    let arrive: (features: string) => void = () => {}
    const load = createMotionLoader(() => new Promise<string>((resolve) => (arrive = resolve)), TIMEOUT_MS)

    const pending = load()
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS)
    arrive('features')

    await expect(pending).resolves.toBe('features')
    expect(isMarkedUnavailable()).toBe(true)
  })
})
