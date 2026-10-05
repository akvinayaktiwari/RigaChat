// @vitest-environment jsdom
import { MDXProvider } from '@mdx-js/react'
import { act, type ComponentType } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { docsMdxComponents, widgetSnippet } from '../../components/docs/DocsMdxComponents'
import { DOC_SECTIONS } from '../../types/docs'
import { adjacentDocs, docsBySection, getAllDocMetas, getAllDocs } from './registry'

function wordCount(text: string): number {
  return text.trim().split(/\s+/).length
}

const metas = getAllDocMetas()

describe('docs metadata', () => {
  it('has pages, each in a known section', () => {
    expect(metas.length).toBeGreaterThan(0)
    expect(metas.filter((meta) => !DOC_SECTIONS.includes(meta.section))).toEqual([])
  })

  // The lead is the passage an answer engine lifts. Too short and it does not
  // answer; too long and it is not quoted whole; without the product's name it
  // cannot stand alone once it has been lifted out of the page.
  it.each(metas.map((meta) => [meta.slug, meta] as const))('%s opens with a self-contained answer', (_slug, meta) => {
    expect(wordCount(meta.lead)).toBeGreaterThanOrEqual(40)
    expect(wordCount(meta.lead)).toBeLessThanOrEqual(70)
    expect(meta.lead).toContain('Vyostra AI')
  })

  it.each(metas.map((meta) => [meta.slug, meta] as const))('%s has a title and description that fit a search result', (_slug, meta) => {
    expect((meta.metaTitle ?? meta.title).length).toBeLessThanOrEqual(60)
    expect(meta.description.length).toBeGreaterThanOrEqual(110)
    expect(meta.description.length).toBeLessThanOrEqual(160)
  })

  // An answer engine may quote one answer without the question above it.
  it.each(metas.flatMap((meta) => (meta.faq ?? []).map((item) => [meta.slug, item.question, item.answer] as const)))(
    '%s: "%s" is answered in a way that stands alone',
    (_slug, _question, answer) => {
      expect(answer).toContain('Vyostra AI')
      expect(wordCount(answer)).toBeGreaterThanOrEqual(25)
    },
  )

  it('has real dates that are not in the future', () => {
    const latestAllowed = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    for (const meta of metas) {
      for (const date of [meta.publishedAt, meta.updatedAt].filter((value): value is string => Boolean(value))) {
        expect(new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10)).toBe(date)
        expect(date <= latestAllowed).toBe(true)
      }
    }
  })
})

describe('docs navigation', () => {
  it('groups every page exactly once, in section order', () => {
    const grouped = docsBySection().flatMap((group) => group.pages.map((page) => page.slug))
    expect(grouped).toEqual(metas.map((meta) => meta.slug))
  })

  it('links each page to its neighbours and stops at the ends', () => {
    const [first, second] = metas
    expect(adjacentDocs(first?.slug ?? '')).toEqual({ previous: undefined, next: second })
    expect(adjacentDocs(metas.at(-1)?.slug ?? '').next).toBeUndefined()
    expect(adjacentDocs('no-such-page')).toEqual({})
  })
})

describe('widgetSnippet', () => {
  it('builds each tag from the script host, file and id attribute', () => {
    expect(widgetSnippet('chat', 'https://cdn.example.com')).toContain('src="https://cdn.example.com/widget.js"\n  data-bot-id="YOUR_BOT_ID"')
    expect(widgetSnippet('form', 'https://cdn.example.com')).toContain('form-widget.js"\n  data-form-id="YOUR_FORM_ID"')
    expect(widgetSnippet('voice', 'https://cdn.example.com')).toContain('voice-widget.js"\n  data-agent-id="YOUR_AGENT_ID"')
  })
})

/**
 * Every body must survive a round trip through real HTML, for the reason
 * post-hydration.test.tsx gives: markup the parser has to repair hydrates as a
 * mismatch, and React answers one by discarding the prerendered page.
 */
async function hydrationErrors(Body: ComponentType): Promise<string[]> {
  const tree = (
    <MemoryRouter>
      <MDXProvider components={docsMdxComponents}>
        <Body />
      </MDXProvider>
    </MemoryRouter>
  )
  const container = document.createElement('div')
  container.innerHTML = renderToString(tree)

  const errors: string[] = []
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  await act(async () => {
    hydrateRoot(container, tree, { onRecoverableError: (error) => errors.push(String(error)) })
  })
  consoleError.mockRestore()
  return errors
}

describe('docs bodies hydrate from their own HTML', () => {
  it.each(getAllDocs().map((doc) => [doc.meta.slug, doc] as const))('%s', async (_slug, doc) => {
    const { default: Body } = await doc.loadContent()
    expect(await hydrationErrors(Body)).toEqual([])
  })
})
