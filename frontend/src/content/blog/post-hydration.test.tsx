// @vitest-environment jsdom
import { MDXProvider } from '@mdx-js/react'
import { act, type ComponentType } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { mdxComponents } from '../../components/blog/MdxComponents'
import { getAllPosts } from './registry'

/**
 * Every post body must survive a round trip through real HTML.
 *
 * Posts are prerendered and then hydrated. Markup the HTML parser has to repair
 * -- a <p> inside a <p>, a <div> inside a <p> -- comes back from the parser as
 * a different tree than React rendered, and React answers a mismatch by
 * discarding the prerendered article and rendering it again. Nothing looks
 * wrong afterwards, so the only place this is visible is here.
 */
async function hydrationErrors(Body: ComponentType): Promise<string[]> {
  const tree = (
    <MemoryRouter>
      <MDXProvider components={mdxComponents}>
        <Body />
      </MDXProvider>
    </MemoryRouter>
  )
  const container = document.createElement('div')
  container.innerHTML = renderToString(tree)

  const errors: string[] = []
  // Development React also logs each mismatch; the recoverable error is the signal.
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  await act(async () => {
    hydrateRoot(container, tree, { onRecoverableError: (error) => errors.push(String(error)) })
  })
  consoleError.mockRestore()
  return errors
}

describe('post bodies hydrate from their own HTML', () => {
  it.each(getAllPosts().map((post) => [post.meta.slug, post] as const))('%s', async (_slug, post) => {
    const { default: Body } = await post.loadContent()
    expect(await hydrationErrors(Body)).toEqual([])
  })
})
