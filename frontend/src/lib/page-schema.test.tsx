// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { getAllPosts } from '../content/blog/registry'
import { renderPublicPage } from '../test-render'
import { FOUNDERS } from './people'
import { absoluteUrl } from './site'
import type { JsonLd, JsonValue } from './structured-data'

/**
 * What the structured data on a page says, checked on the page itself rather
 * than on the builders: a builder nobody calls passes every unit test and
 * leaves the page with no schema at all, which is how /about-us/ and /blog/
 * shipped.
 */

function asRecord(value: JsonValue | undefined): JsonLd {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('expected an object')
  return value
}

function asArray(value: JsonValue | undefined): JsonValue[] {
  if (!Array.isArray(value)) throw new Error('expected an array')
  return value
}

/** The nodes of every @graph the page emits. */
async function graphNodes(route: string): Promise<JsonLd[]> {
  const { jsonLd } = await renderPublicPage(route)
  return jsonLd.flatMap((block) => asArray(block['@graph']).map(asRecord))
}

function nodeOfType(nodes: readonly JsonLd[], type: string): JsonLd {
  const found = nodes.find((node) => node['@type'] === type)
  if (!found) throw new Error(`no ${type} node`)
  return found
}

describe('/about-us structured data', () => {
  it('is an AboutPage whose subject is the organization in the same graph', async () => {
    const nodes = await graphNodes('/about-us')
    const organization = nodeOfType(nodes, 'Organization')
    expect(nodeOfType(nodes, 'AboutPage').mainEntity).toEqual({ '@id': organization['@id'] })
    expect(nodeOfType(nodes, 'AboutPage').url).toBe(absoluteUrl('/about-us/'))
  })

  // Schema may only say what the page shows: every founder it names must be on the page.
  it('names only founders the page introduces', async () => {
    const { html } = await renderPublicPage('/about-us')
    const founders = asArray(nodeOfType(await graphNodes('/about-us'), 'Organization').founder).map((founder) => asRecord(founder).name)
    expect(founders).toEqual(FOUNDERS.map((founder) => founder.name))
    expect(founders.filter((name) => typeof name !== 'string' || !html.includes(name))).toEqual([])
  })

  it('trails Home > About', async () => {
    const crumbs = asArray(nodeOfType(await graphNodes('/about-us'), 'BreadcrumbList').itemListElement).map((item) => asRecord(item).item)
    expect(crumbs).toEqual([absoluteUrl('/'), absoluteUrl('/about-us/')])
  })
})

describe('/blog structured data', () => {
  it('lists every post, in the order the page shows them, at the URL each is served from', async () => {
    const list = asRecord(nodeOfType(await graphNodes('/blog'), 'Blog').mainEntity)
    const items = asArray(list.itemListElement).map(asRecord)
    expect(items.map((item) => item.url)).toEqual(getAllPosts().map(({ meta }) => absoluteUrl(`/blog/${meta.slug}/`)))
    expect(items.map((item) => item.position)).toEqual(items.map((_, index) => index + 1))
  })

  it('shows every post it lists', async () => {
    const { html } = await renderPublicPage('/blog')
    const decoded = html.replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"')
    expect(getAllPosts().filter(({ meta }) => !decoded.includes(meta.title)).map(({ meta }) => meta.slug)).toEqual([])
  })

  it('is published by the organization in the same graph', async () => {
    const nodes = await graphNodes('/blog')
    expect(nodeOfType(nodes, 'Blog').publisher).toEqual({ '@id': nodeOfType(nodes, 'Organization')['@id'] })
  })
})

// Contact, careers and the legal pages are about the company, not the product,
// and shipped with no schema at all.
describe.each([
  ['/contact', 'ContactPage', 'Contact'],
  ['/careers', 'WebPage', 'Careers'],
  ['/privacy-policy', 'WebPage', 'Privacy Policy'],
  ['/terms-of-service', 'WebPage', 'Terms of Service'],
] as const)('%s structured data', (route, type, name) => {
  it(`is a ${type} about the organization in the same graph, at the URL it is served on`, async () => {
    const nodes = await graphNodes(route)
    const page = nodeOfType(nodes, type)
    expect(page.about).toEqual({ '@id': nodeOfType(nodes, 'Organization')['@id'] })
    expect(page.url).toBe(absoluteUrl(`${route}/`))
  })

  it('trails Home > the page, under a name the page shows', async () => {
    const nodes = await graphNodes(route)
    const crumbs = asArray(nodeOfType(nodes, 'BreadcrumbList').itemListElement).map(asRecord)
    expect(crumbs.map((crumb) => crumb.item)).toEqual([absoluteUrl('/'), absoluteUrl(`${route}/`)])
    expect((await renderPublicPage(route)).html).toContain(name)
  })
})
