import * as cheerio from 'cheerio'
import fetch from 'node-fetch'
import { XMLParser } from 'fast-xml-parser'
import { generateChatCompletion } from './openai-service.js'

interface CrawlResult {
  url: string
  title: string
  content: string
  crawledAt: string
}

interface ScanResult {
  totalPages: number
  selectedPages: string[]
  requiresConfirmation: boolean
}

const FETCH_TIMEOUT_MS = 10_000
const MAX_PAGES = 50
const PARALLEL_BATCH_SIZE = 10
const MIN_CHUNK_WORDS = 10
const MIN_CONTENT_LENGTH = 100
const AI_CLEAN_MIN_LENGTH = 500
const AI_CLEAN_INPUT_CHARS = 3000

const NON_CONTENT_EXTENSIONS = [
  '.pdf', '.zip', '.rar', '.doc', '.docx',
  '.xls', '.xlsx', '.ppt', '.pptx',
  '.png', '.jpg', '.jpeg', '.gif', '.svg',
  '.mp3', '.mp4',
]

const SKIP_URL_PATTERNS = [
  '/blog/', '/news/', '/press/', '/tag/',
  '/category/', '/author/', '/page/',
  '/wp-content/', '/wp-admin/',
  '/cdn-cgi/', '/assets/', '/static/',
]

const PRIORITY_URL_KEYWORDS = [
  'about', 'product', 'service', 'pricing',
  'price', 'feature', 'contact', 'faq',
  'docs', 'documentation', 'team', 'careers',
  'how', 'why', 'what',
]

const BOILERPLATE_PATTERNS = [
  /cookie/i, /privacy policy/i, /terms of service/i,
  /all rights reserved/i, /subscribe to our newsletter/i,
  /follow us on/i, /share this/i, /©\s*\d{4}/i,
  /breadcrumb/i, /skip to content/i,
  /loading\.\.\./i, /please wait/i,
]

const REMOVE_SELECTORS = [
  'script', 'style', 'nav', 'footer', 'header',
  '[class*="cookie"]', '[class*="banner"]',
  '[class*="popup"]', '[class*="modal"]',
  '[class*="newsletter"]', '[class*="subscribe"]',
  '[class*="social"]', '[class*="share"]',
  '[id*="cookie"]', '[id*="banner"]',
  '[id*="popup"]', '[id*="newsletter"]',
  'noscript', 'iframe', 'form',
].join(', ')

const MAIN_CONTENT_SELECTORS = [
  'main', 'article', '[role="main"]',
  '.content', '#content', '.main-content',
  '#main-content', '.page-content',
]

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'BeepBoop-Crawler/1.0 (AI chatbot indexer)',
      },
    })
    if (!response.ok) throw new Error(`Status ${response.status}`)
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
    .filter((line) => !BOILERPLATE_PATTERNS.some((p) => p.test(line)))
    .filter((line) => line.split(' ').length >= MIN_CHUNK_WORDS)
    .join('\n')
}

function prioritizeUrls(urls: string[]): string[] {
  const filtered = urls.filter((url) => {
    const path = new URL(url).pathname.toLowerCase()
    return !SKIP_URL_PATTERNS.some((pattern) => path.includes(pattern))
  })

  const scored = filtered.map((url) => {
    const path = new URL(url).pathname.toLowerCase()
    const depth = path.split('/').filter(Boolean).length
    const hasPriorityKeyword = PRIORITY_URL_KEYWORDS.some((k) => path.includes(k))
    const score = (hasPriorityKeyword ? 10 : 0) - depth
    return { url, score }
  })

  return scored.sort((a, b) => b.score - a.score).map((item) => item.url)
}

export async function cleanContentWithAI(content: string, url: string): Promise<string> {
  if (content.length < MIN_CONTENT_LENGTH) return content
  if (content.length < AI_CLEAN_MIN_LENGTH) return content

  try {
    const cleaned = await generateChatCompletion({
      systemPrompt:
        'You are a content extractor. Extract only factual business information a customer would ask about. Remove all navigation, footers, cookie notices, legal disclaimers, social media buttons, newsletter signups, and filler text. Return only clean paragraphs of meaningful content. If no meaningful content exists, return empty string.',
      userPrompt: `URL: ${url}\n\nContent:\n${content.slice(0, AI_CLEAN_INPUT_CHARS)}`,
      maxTokens: 800,
      temperature: 0,
    })
    return cleaned.trim() || content
  } catch (error) {
    console.error(`AI content cleaning failed for ${url}:`, error)
    return content
  }
}

function extractMainContent($: cheerio.CheerioAPI): string {
  for (const selector of MAIN_CONTENT_SELECTORS) {
    if ($(selector).length > 0) {
      return cleanText($(selector).text())
    }
  }
  return cleanText($('body').text())
}

export async function crawlPage(
  url: string,
  useAICleaning: boolean = false
): Promise<CrawlResult | null> {
  const html = await fetchHtml(url)
  const $ = cheerio.load(html)
  $(REMOVE_SELECTORS).remove()

  const title = $('title').first().text().trim()
  let content = extractMainContent($)

  if (useAICleaning && content.length > AI_CLEAN_MIN_LENGTH) {
    content = await cleanContentWithAI(content, url)
  }

  if (content.length < MIN_CONTENT_LENGTH) return null

  return { url, title, content, crawledAt: new Date().toISOString() }
}

export function extractLinks(html: string, baseUrl: string): string[] {
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

interface SitemapUrlEntry {
  loc?: string
}

interface ParsedSitemap {
  urlset?: { url?: SitemapUrlEntry | SitemapUrlEntry[] }
  sitemapindex?: { sitemap?: SitemapUrlEntry | SitemapUrlEntry[] }
}

const SITEMAP_FETCH_TIMEOUT_MS = 5_000
const MAX_SITEMAP_URLS = 200
const SITEMAP_PATHS = ['/sitemap.xml', '/sitemap_index.xml', '/sitemap.txt']

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Awaited<ReturnType<typeof fetch>>> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

function extractSitemapXmlUrls(xmlText: string): string[] {
  const parsed = new XMLParser().parse(xmlText) as ParsedSitemap
  const raw = parsed.urlset?.url ?? parsed.sitemapindex?.sitemap ?? []
  const entries = Array.isArray(raw) ? raw : [raw]
  return entries.map((entry) => entry?.loc).filter((loc): loc is string => typeof loc === 'string')
}

function filterSitemapUrls(urls: string[], baseUrl: string): string[] {
  const baseHostname = new URL(baseUrl).hostname
  const filtered = urls.filter((url) => {
    try {
      const parsed = new URL(url)
      if (parsed.hostname !== baseHostname) return false
      if (NON_CONTENT_EXTENSIONS.some((ext) => parsed.pathname.toLowerCase().endsWith(ext))) return false
      if (SKIP_URL_PATTERNS.some((pattern) => parsed.pathname.toLowerCase().includes(pattern))) return false
      return true
    } catch {
      return false
    }
  })
  return filtered.slice(0, MAX_SITEMAP_URLS)
}

async function fetchSitemap(baseUrl: string): Promise<string[]> {
  const root = baseUrl.replace(/\/$/, '')

  for (const path of SITEMAP_PATHS) {
    try {
      const response = await fetchWithTimeout(`${root}${path}`, SITEMAP_FETCH_TIMEOUT_MS)
      if (!response.ok) continue

      const text = await response.text()
      const urls = path.endsWith('.txt')
        ? text.split('\n').map((line) => line.trim()).filter(Boolean)
        : extractSitemapXmlUrls(text)

      if (urls.length > 0) return filterSitemapUrls(urls, baseUrl)
    } catch (error) {
      console.error(`Sitemap fetch failed for ${root}${path}:`, error)
    }
  }

  return []
}

export async function scanWebsite(baseUrl: string): Promise<ScanResult> {
  const sitemapUrls = await fetchSitemap(baseUrl)

  const html = await fetchHtml(baseUrl)
  const htmlUrls = extractLinks(html, baseUrl)

  const allUrls = [...new Set([...sitemapUrls, ...htmlUrls])].filter((url) => url !== baseUrl)
  const prioritized = prioritizeUrls(allUrls)

  const total = prioritized.length + 1
  const selectedPages = [baseUrl, ...prioritized.slice(0, MAX_PAGES - 1)]

  console.log(
    `URL discovery: ${sitemapUrls.length} from sitemap, ${htmlUrls.length} from HTML, ${prioritized.length} unique after dedup, ${selectedPages.length} selected`
  )

  return {
    totalPages: total,
    selectedPages,
    requiresConfirmation: total > MAX_PAGES,
  }
}

export async function crawlPagesParallel(
  urls: string[],
  useAICleaning: boolean = false,
  onProgress?: (crawled: number, total: number) => void
): Promise<CrawlResult[]> {
  const results: CrawlResult[] = []

  for (let i = 0; i < urls.length; i += PARALLEL_BATCH_SIZE) {
    const batch = urls.slice(i, i + PARALLEL_BATCH_SIZE)
    const batchResults = await Promise.allSettled(
      batch.map((url) => crawlPage(url, useAICleaning))
    )
    for (const result of batchResults) {
      if (result.status === 'fulfilled' && result.value) {
        results.push(result.value)
      } else if (result.status === 'rejected') {
        console.error('Failed to crawl page:', result.reason)
      }
    }
    onProgress?.(results.length, urls.length)
  }

  return results
}

export async function crawlWebsite(baseUrl: string): Promise<CrawlResult[]> {
  const scan = await scanWebsite(baseUrl)
  const urls = scan.selectedPages.slice(0, MAX_PAGES)
  return crawlPagesParallel(urls, false)
}

export function chunkTextSemantic(
  text: string,
  sentencesPerChunk: number = 4,
  overlapSentences: number = 1
): string[] {
  const sentences = text
    .replace(/([.!?])\s+/g, '$1\n')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 20)
    .filter((s) => s.split(' ').length >= 4)

  const chunks: string[] = []
  const step = sentencesPerChunk - overlapSentences

  for (let i = 0; i < sentences.length; i += step) {
    const group = sentences.slice(i, i + sentencesPerChunk)
    const chunk = group.join(' ')
    if (chunk.split(' ').length >= MIN_CHUNK_WORDS) {
      chunks.push(chunk)
    }
  }

  return chunks
}

export function chunkText(text: string, _chunkSize: number = 400, _overlap: number = 50): string[] {
  return chunkTextSemantic(text)
}

const CONTEXT_PREFIX_MAX_LENGTH = 80
const CONTEXT_PREFIX_FIELD_MAX_LENGTH = CONTEXT_PREFIX_MAX_LENGTH / 2
const OPTIMAL_CHUNK_WORDS = 150
const CHUNK_OVERLAP_SENTENCES = 1
const MIN_FACT_CHUNK_WORDS = 3
const FACTS_PER_CHUNK = 5

function buildContextPrefix(botName: string, pageTitle: string): string {
  const clean = (value: string) =>
    value
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .trim()
      .slice(0, CONTEXT_PREFIX_FIELD_MAX_LENGTH)

  return `[${clean(botName)}] [${clean(pageTitle)}]: `
}

export function chunkWithContext(
  text: string,
  botName: string,
  pageTitle: string,
  wordsPerChunk: number = OPTIMAL_CHUNK_WORDS
): string[] {
  if (text.length === 0) return []

  const prefix = buildContextPrefix(botName, pageTitle)

  const sentences = text
    .replace(/([.!?])\s+/g, '$1|||')
    .split('|||')
    .map((s) => s.trim())
    .filter((s) => s.length > 20)
    .filter((s) => s.split(' ').length >= 3)

  if (sentences.length === 0) return []

  const chunks: string[] = []
  let currentSentences: string[] = []
  let currentWordCount = 0

  for (const sentence of sentences) {
    const wordCount = sentence.split(' ').length

    if (currentWordCount + wordCount > wordsPerChunk && currentSentences.length > 0) {
      chunks.push(prefix + currentSentences.join(' '))
      currentSentences = currentSentences.slice(-CHUNK_OVERLAP_SENTENCES)
      currentWordCount = currentSentences.join(' ').split(' ').length
    }

    currentSentences.push(sentence)
    currentWordCount += wordCount
  }

  if (currentSentences.length > 0) {
    chunks.push(prefix + currentSentences.join(' '))
  }

  return chunks.filter((c) => c.split(' ').length >= MIN_CHUNK_WORDS)
}

const SUPPORT_EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const SUPPORT_EMAIL_PREFIX_BLOCKLIST = ['noreply@', 'no-reply@', 'example@', 'test@']
const SUPPORT_EMAIL_DOMAIN_BLOCKLIST = ['example.com', 'test.com', 'domain.com']
const SUPPORT_EMAIL_PRIORITY_PREFIXES = ['support@', 'contact@', 'info@', 'hello@', 'help@']

export function extractSupportEmail(pages: string[]): string | null {
  const matches = pages.join('\n').match(SUPPORT_EMAIL_REGEX) ?? []
  const uniqueEmails = Array.from(new Set(matches.map((email) => email.toLowerCase())))

  const validEmails = uniqueEmails.filter((email) => {
    if (SUPPORT_EMAIL_PREFIX_BLOCKLIST.some((prefix) => email.startsWith(prefix))) return false
    const domain = email.split('@')[1] ?? ''
    return !SUPPORT_EMAIL_DOMAIN_BLOCKLIST.includes(domain)
  })

  for (const prefix of SUPPORT_EMAIL_PRIORITY_PREFIXES) {
    const match = validEmails.find((email) => email.startsWith(prefix))
    if (match) return match
  }

  return validEmails[0] ?? null
}

export function chunkFacts(facts: string, botName: string, pageTitle: string): string[] {
  if (facts.length === 0) return []

  const prefix = buildContextPrefix(botName, pageTitle)

  const lines = facts
    .split(/\n|•|-/)
    .map((l) => l.trim())
    .filter((l) => l.length > 20)
    .filter((l) => l.split(' ').length >= MIN_FACT_CHUNK_WORDS)

  const chunks: string[] = []
  for (let i = 0; i < lines.length; i += FACTS_PER_CHUNK) {
    const group = lines.slice(i, i + FACTS_PER_CHUNK)
    chunks.push(prefix + group.join('. '))
  }

  return chunks
}
