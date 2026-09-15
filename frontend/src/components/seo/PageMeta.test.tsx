import { render } from '@testing-library/react'
import { HelmetProvider, type HelmetServerState } from 'react-helmet-async'
import { describe, expect, it } from 'vitest'
import PageMeta from './PageMeta'

function renderHead(): string {
  const context: { helmet?: HelmetServerState | null } = {}
  // Server dispatcher so the tags land in `context` rather than document.head.
  HelmetProvider.canUseDOM = false
  render(
    <HelmetProvider context={context}>
      <PageMeta title="Built-in Lead CRM — Vyostra AI" description="Every lead, organized." path="/features/crm" />
    </HelmetProvider>,
  )
  HelmetProvider.canUseDOM = true

  const helmet = context.helmet
  if (!helmet) throw new Error('Helmet produced no server state')
  return [helmet.title.toString(), helmet.meta.toString(), helmet.link.toString()].join('\n')
}

describe('PageMeta', () => {
  const head = renderHead()

  it('emits the title and description', () => {
    expect(head).toContain('Built-in Lead CRM — Vyostra AI')
    expect(head).toMatch(/name="description" content="Every lead, organized."/)
  })

  function attr(pattern: RegExp): string {
    const match = head.match(pattern)
    if (!match?.[1]) throw new Error(`no match for ${pattern}`)
    return match[1]
  }

  // The origin comes from whatever .env vitest loads, so assert the shape and
  // that the two URLs agree rather than a specific host.
  it('uses the same served URL for canonical and og:url', () => {
    const canonical = attr(/rel="canonical" href="([^"]+)"/)
    expect(canonical.endsWith('/features/crm')).toBe(true)
    expect(attr(/property="og:url" content="([^"]+)"/)).toBe(canonical)
  })

  it('always sets a share image, which no page had before', () => {
    expect(attr(/property="og:image" content="([^"]+)"/).endsWith('/og-image.png')).toBe(true)
    expect(attr(/name="twitter:image" content="([^"]+)"/).endsWith('/og-image.png')).toBe(true)
  })
})
