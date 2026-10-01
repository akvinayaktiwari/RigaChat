import { afterEach, describe, expect, it, vi } from 'vitest'

/** prerender-boot reads #root once, at import, so each case imports it fresh. */
async function bootWith(rootHtml: string): Promise<typeof import('./prerender-boot')> {
  document.body.innerHTML = `<div id="root">${rootHtml}</div>`
  vi.resetModules()
  return import('./prerender-boot')
}

describe('bootedFromPrerender', () => {
  afterEach(() => {
    window.history.pushState({}, '', '/')
  })

  it('is true on the page whose markup arrived prerendered', async () => {
    const boot = await bootWith('<h1>Prerendered</h1>')
    expect(boot.bootedFromPrerender()).toBe(true)
  })

  it('is false when the page arrived as the empty app shell', async () => {
    const boot = await bootWith('')
    expect(boot.bootedFromPrerender()).toBe(false)
  })

  // After a client-side navigation the page on screen was rendered by React,
  // so its entrance animations are free to run.
  it('is false once the visitor has navigated to another page', async () => {
    const boot = await bootWith('<h1>Prerendered</h1>')
    window.history.pushState({}, '', '/features')
    expect(boot.bootedFromPrerender()).toBe(false)
  })
})
