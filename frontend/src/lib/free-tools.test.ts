import { describe, expect, it } from 'vitest'
import { PRERENDERED_STATIC_ROUTES } from './crawl-files'
import { FREE_TOOLS, TOOLS_HUB, servedPath } from './free-tools'
import { absoluteUrl } from './site'
import { toolPageNodes, toolsIndexNodes, type JsonValue } from './structured-data'

function record(value: JsonValue | undefined): Record<string, JsonValue> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('expected an object')
  return value
}

function list(value: JsonValue | undefined): JsonValue[] {
  if (!Array.isArray(value)) throw new Error('expected an array')
  return value
}

describe('FREE_TOOLS', () => {
  it('lists each tool once, under a route with no trailing slash', () => {
    const routes = FREE_TOOLS.map((tool) => tool.route)
    expect(new Set(routes).size).toBe(routes.length)
    expect(routes.filter((route) => !route.startsWith('/') || route.endsWith('/'))).toEqual([])
  })

  // A tool that is not prerendered is served as an empty shell, and one missing
  // from this list is missing from the sitemap and llms.txt too.
  it('prerenders the hub and every tool, and puts them in the sitemap', () => {
    expect(PRERENDERED_STATIC_ROUTES).toEqual(expect.arrayContaining([TOOLS_HUB.route, ...FREE_TOOLS.map((tool) => tool.route)]))
  })
})

describe('toolPageNodes', () => {
  const [tool, page, crumbs] = toolPageNodes({ name: 'WhatsApp QR Code Generator', path: '/tools/whatsapp-qr-code-generator/', description: 'Makes a code.' })

  it('describes a free web application', () => {
    expect(tool?.['@type']).toBe('WebApplication')
    expect(tool?.applicationCategory).toBe('BusinessApplication')
    expect(tool?.isAccessibleForFree).toBe(true)
    expect(record(tool?.offers).price).toBe('0')
  })

  it('makes the tool the main thing on its page', () => {
    expect(page?.mainEntity).toEqual({ '@id': tool?.['@id'] })
  })

  it('trails Home, the tools hub, then the page', () => {
    expect(list(crumbs?.itemListElement).map((item) => record(item).item)).toEqual([
      absoluteUrl('/'),
      absoluteUrl('/tools/'),
      absoluteUrl('/tools/whatsapp-qr-code-generator/'),
    ])
  })
})

describe('toolsIndexNodes', () => {
  it('lists the tools in the order given, at the paths they are served from', () => {
    const [hub] = toolsIndexNodes(FREE_TOOLS.map((tool) => ({ name: tool.name, path: servedPath(tool.route) })))
    expect(hub?.['@type']).toBe('CollectionPage')
    const items = list(record(hub?.mainEntity).itemListElement).map((item) => record(item).url)
    expect(items).toEqual(FREE_TOOLS.map((tool) => absoluteUrl(`${tool.route}/`)))
  })
})
