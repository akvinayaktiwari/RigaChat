import type { ComponentType } from 'react'
import { DOC_SECTIONS, type DocMeta, type DocPage, type DocSection } from '../../types/docs'

/**
 * Docs page discovery. Same shape as the blog registry, for the same reasons:
 * each page is a directory under ./pages/<slug>/ holding
 *
 *   meta.ts     -- default-exports DocMeta (eagerly bundled, tiny)
 *   content.mdx -- the page body
 *
 * so the docs index and the sidebar render from metadata alone and a body is
 * fetched only when its own route is visited. Adding a page is adding a
 * directory: the route, sitemap entry, llms.txt link and prerendered HTML all
 * follow from it.
 */
const metaModules = import.meta.glob<{ default: DocMeta }>('./pages/*/meta.ts', { eager: true })

const contentModules = import.meta.glob<{ default: ComponentType }>('./pages/*/content.mdx')

/** Pulls "quickstart" out of "./pages/quickstart/meta.ts". */
function slugFromPath(path: string): string {
  const segments = path.split('/')
  return segments[segments.length - 2] ?? ''
}

function buildDocs(): DocPage[] {
  const docs: DocPage[] = []

  for (const [path, module] of Object.entries(metaModules)) {
    const slug = slugFromPath(path)
    const meta = module.default

    if (meta.slug !== slug) {
      throw new Error(`Docs page slug mismatch: ${path} declares slug "${meta.slug}" but lives in directory "${slug}". They must match or the page URL will 404.`)
    }

    const loadContent = contentModules[`./pages/${slug}/content.mdx`]
    if (!loadContent) {
      throw new Error(`Docs page "${slug}" has a meta.ts but no content.mdx beside it.`)
    }

    docs.push({ meta, loadContent })
  }

  // Sidebar order: by section, then by `order`. Slug breaks ties so the order is stable across builds.
  return docs.sort((a, b) => {
    const bySection = DOC_SECTIONS.indexOf(a.meta.section) - DOC_SECTIONS.indexOf(b.meta.section)
    if (bySection !== 0) return bySection
    return a.meta.order - b.meta.order || a.meta.slug.localeCompare(b.meta.slug)
  })
}

const docs = buildDocs()

/** Page bodies already fetched, by slug. See preloadDocContent(). */
const loadedContent = new Map<string, ComponentType>()

/**
 * Fetches a page body ahead of its first render. main.tsx awaits this before
 * hydrating a prerendered docs page; see preloadPostContent() in the blog
 * registry for why a boundary still waiting on its chunk must not be hydrated.
 */
export async function preloadDocContent(slug: string): Promise<void> {
  const doc = getDocBySlug(slug)
  if (!doc || loadedContent.has(slug)) return
  const module = await doc.loadContent()
  loadedContent.set(slug, module.default)
}

/** The page body if it has been preloaded, else undefined. */
export function loadedDocContent(slug: string): ComponentType | undefined {
  return loadedContent.get(slug)
}

export function getAllDocs(): DocPage[] {
  return docs
}

export function getAllDocMetas(): DocMeta[] {
  return docs.map((doc) => doc.meta)
}

export function getDocBySlug(slug: string): DocPage | undefined {
  return docs.find((doc) => doc.meta.slug === slug)
}

/** Every page slug, used by the prerender to enumerate docs routes. */
export function getAllDocSlugs(): string[] {
  return docs.map((doc) => doc.meta.slug)
}

/** The route a docs page is mounted at, without the trailing slash. */
export function docRoute(slug: string): string {
  return `/docs/${slug}`
}

export interface DocGroup {
  section: DocSection
  pages: DocMeta[]
}

/** Pages grouped by section in sidebar order; empty sections are left out. */
export function docsBySection(metas: readonly DocMeta[] = getAllDocMetas()): DocGroup[] {
  return DOC_SECTIONS.map((section) => ({ section, pages: metas.filter((meta) => meta.section === section) })).filter(
    (group) => group.pages.length > 0,
  )
}

/** The pages before and after `slug` in sidebar order, for the footer links. */
export function adjacentDocs(slug: string, metas: readonly DocMeta[] = getAllDocMetas()): { previous?: DocMeta; next?: DocMeta } {
  const index = metas.findIndex((meta) => meta.slug === slug)
  if (index === -1) return {}
  return { previous: metas[index - 1], next: metas[index + 1] }
}
