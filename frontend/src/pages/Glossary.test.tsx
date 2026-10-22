// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { getAllSlugs } from '../content/blog/registry'
import { GLOSSARY_TERMS } from '../content/glossary'
import { PRERENDERED_STATIC_ROUTES } from '../lib/crawl-files'
import { absoluteUrl } from '../lib/site'
import type { JsonLd, JsonValue } from '../lib/structured-data'
import { renderPublicPage } from '../test-render'

/**
 * The glossary's schema is a promise that each term is defined on the page,
 * at its own fragment. These checks hold that promise on the rendered page,
 * not on the builder.
 */

function asRecord(value: JsonValue | undefined): JsonLd {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('expected an object')
  return value
}

function asArray(value: JsonValue | undefined): JsonValue[] {
  if (!Array.isArray(value)) throw new Error('expected an array')
  return value
}

function unescapeHtml(html: string): string {
  return html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
}

async function definedTerms(): Promise<JsonLd[]> {
  const { jsonLd } = await renderPublicPage('/glossary')
  const nodes = jsonLd.flatMap((block) => asArray(block['@graph']).map(asRecord))
  const termSet = nodes.find((node) => node['@type'] === 'DefinedTermSet')
  if (!termSet) throw new Error('no DefinedTermSet node')
  return asArray(termSet.hasDefinedTerm).map(asRecord)
}

describe('/glossary', () => {
  it('publishes one DefinedTerm per term, in page order, each at its own fragment', async () => {
    const terms = await definedTerms()
    expect(terms.map((term) => term.name)).toEqual(GLOSSARY_TERMS.map((entry) => entry.term))
    expect(terms.map((term) => term.url)).toEqual(GLOSSARY_TERMS.map((entry) => absoluteUrl(`/glossary/#${entry.id}`)))
  })

  // Schema may only say what the page shows.
  it('shows every published definition, under an element carrying its fragment id', async () => {
    const html = unescapeHtml((await renderPublicPage('/glossary')).html)
    const missing = GLOSSARY_TERMS.filter((entry) => !html.includes(entry.definition) || !html.includes(`id="${entry.id}"`))
    expect(missing.map((entry) => entry.id)).toEqual([])
  })

  it('gives every term a unique id', () => {
    const ids = GLOSSARY_TERMS.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  // A "Read more" link to a page that does not exist is a dead end for a reader and a crawler alike.
  it('links only to pages the site serves', () => {
    const served = new Set([...PRERENDERED_STATIC_ROUTES, ...getAllSlugs().map((slug) => `/blog/${slug}`)])
    const dead = GLOSSARY_TERMS.flatMap((entry) => (entry.link && !served.has(entry.link.path) ? [entry.link.path] : []))
    expect(dead).toEqual([])
  })
})
