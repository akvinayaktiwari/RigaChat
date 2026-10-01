import { Suspense } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { lazyWithPreload } from './lazy-with-preload'

function Page() {
  return <p>the page</p>
}

function renderWithFallback(Component: React.ComponentType): string {
  return renderToString(
    <Suspense fallback={<span>loading</span>}>
      <Component />
    </Suspense>,
  )
}

describe('lazyWithPreload', () => {
  it('suspends like lazy() until it has been preloaded', () => {
    const Preloadable = lazyWithPreload(async () => ({ default: Page }))
    expect(renderWithFallback(Preloadable)).toContain('loading')
  })

  // This is the property hydration depends on: no suspension on first render,
  // so the boundary around a prerendered page is never left half-hydrated.
  it('renders the real component on the first render once preloaded', async () => {
    const Preloadable = lazyWithPreload(async () => ({ default: Page }))
    await Preloadable.preload()
    const html = renderWithFallback(Preloadable)
    expect(html).toContain('the page')
    expect(html).not.toContain('loading')
  })

  it('rejects when the chunk fails to load, so the caller can fall back', async () => {
    const Preloadable = lazyWithPreload(async () => {
      throw new Error('chunk 404')
    })
    await expect(Preloadable.preload()).rejects.toThrow('chunk 404')
  })
})
