import { Suspense } from 'react'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RouteErrorBoundary } from '../components/RouteErrorBoundary/RouteErrorBoundary'
import { CHUNK_RELOAD_KEY, importOrReload, lazyRoute } from './chunk-reload'

/**
 * A dashboard tab open across a deploy asks for a chunk the deploy deleted.
 * That used to unmount the whole app and leave a blank white page; it now
 * reloads once onto the current build, and anything still failing shows a
 * recovery screen.
 */

const chunkGone = () => Promise.reject(new TypeError('Failed to fetch dynamically imported module'))

/** Resolves to 'pending' when the promise has not settled within a few ticks. */
async function settled<T>(promise: Promise<T>): Promise<T | 'pending'> {
  return await Promise.race([promise, new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 20))])
}

afterEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
})

describe('importOrReload', () => {
  it('returns the module when the chunk loads, without reloading', async () => {
    const reload = vi.fn()
    await expect(importOrReload(async () => 'module', reload)).resolves.toBe('module')
    expect(reload).not.toHaveBeenCalled()
  })

  it('reloads once on a missing chunk and does not reject before the page goes', async () => {
    const reload = vi.fn()
    expect(await settled(importOrReload(chunkGone, reload))).toBe('pending')
    expect(reload).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem(CHUNK_RELOAD_KEY)).not.toBeNull()
  })

  // Still missing straight after a reload means a broken deploy or no network.
  // Reloading again would loop forever.
  it('rethrows instead of reloading again straight after a reload', async () => {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
    const reload = vi.fn()
    await expect(importOrReload(chunkGone, reload)).rejects.toThrow('dynamically imported module')
    expect(reload).not.toHaveBeenCalled()
  })

  it('reloads again once the guard window has passed', async () => {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now() - 60_000))
    const reload = vi.fn()
    expect(await settled(importOrReload(chunkGone, reload))).toBe('pending')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('rethrows rather than risk a loop when storage cannot be read', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })
    const reload = vi.fn()
    await expect(importOrReload(chunkGone, reload)).rejects.toThrow('dynamically imported module')
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('a route whose chunk will not load', () => {
  it('shows the recovery screen with a way to sign in, not a blank page', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
    const Page = lazyRoute(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module')))

    const { container } = render(
      <RouteErrorBoundary>
        <Suspense fallback={<div>loading</div>}>
          <Page />
        </Suspense>
      </RouteErrorBoundary>,
    )

    expect(await screen.findByText("This page didn't load")).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login')
    expect(container.childElementCount).toBeGreaterThan(0)
  })
})
