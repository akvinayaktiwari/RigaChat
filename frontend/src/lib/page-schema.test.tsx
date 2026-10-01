// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { renderPublicPage } from '../test-render'
import { FOUNDERS } from './people'
import { absoluteUrl } from './site'
import type { JsonLd, JsonValue } from './structured-data'

/**
 * What the structured data on a page says, checked on the page itself rather
 * than on the builders: a builder nobody calls passes every unit test and
 * leaves the page with no schema at all, which is how /about-us/ shipped.
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
