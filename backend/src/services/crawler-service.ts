import * as cheerio from 'cheerio'
import fetch from 'node-fetch'

interface CrawlResult {
  url: string
  title: string
  content: string
  crawledAt: string
}

const FETCH_TIMEOUT_MS = 10_000
const MAX_PAGES = 10
const CRAWL_DELAY_MS = 500
const MIN_CHUNK_WORDS = 10
const NON_CONTENT_EXTENSIONS = [
  '.pdf',
  '.zip',
  '.rar',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.mp3',
  '.mp4',
]

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`Received status ${response.status}`)
    }
    return await response.text()
  } finally {
    clearTimeout(timeout)
  }
}

function cleanText(rawText: string): string {
  return rawText
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n')
}

export async function crawlPage(url: string): Promise<CrawlResult> {
  try {
    const html = await fetchHtml(url)
    const $ = cheerio.load(html)

    $('script, style, nav, footer, header').remove()

    const title = $('title').first().text().trim()
    const content = cleanText($('body').text())

    return {
      url,
      title,
      content,
      crawledAt: new Date().toISOString(),
    }
  } catch (error) {
    throw new Error(
      `Failed to crawl page ${url}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

function extractLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html)
  const baseUrlObj = new URL(baseUrl)
  const links = new Set<string>()

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return
    if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#')) return

    let resolved: URL
    try {
      resolved = new URL(href, baseUrl)
    } catch {
      return
    }

    if (resolved.hostname !== baseUrlObj.hostname) return
    if (NON_CONTENT_EXTENSIONS.some((ext) => resolved.pathname.toLowerCase().endsWith(ext))) return

    resolved.hash = ''
    links.add(resolved.toString())
  })

  return Array.from(links)
}

export async function crawlWebsite(baseUrl: string): Promise<CrawlResult[]> {
  const results: CrawlResult[] = []
  const visited = new Set<string>([baseUrl])

  let baseHtml: string
  try {
    baseHtml = await fetchHtml(baseUrl)
  } catch (error) {
    throw new Error(
      `Failed to crawl website ${baseUrl}: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  try {
    results.push(await crawlPage(baseUrl))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
  }

  const links = extractLinks(baseHtml, baseUrl).filter((link) => !visited.has(link))

  for (const link of links) {
    if (results.length >= MAX_PAGES) break
    if (visited.has(link)) continue
    visited.add(link)

    await new Promise((resolve) => setTimeout(resolve, CRAWL_DELAY_MS))

    try {
      results.push(await crawlPage(link))
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
    }
  }

  return results
}

export function chunkText(text: string, chunkSize: number = 400, overlap: number = 50): string[] {
  const words = text.split(/\s+/).filter((word) => word.length > 0)
  const chunks: string[] = []
  const step = chunkSize - overlap

  for (let i = 0; i < words.length; i += step) {
    const chunkWords = words.slice(i, i + chunkSize)
    if (chunkWords.length >= MIN_CHUNK_WORDS) {
      chunks.push(chunkWords.join(' '))
    }
  }

  return chunks
}
