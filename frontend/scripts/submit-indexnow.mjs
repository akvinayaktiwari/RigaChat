/**
 * Pushes recently changed sitemap URLs to IndexNow (Bing, Yandex, Naver, Seznam).
 *
 * Why: ChatGPT Search and Copilot lean on Bing's index, and a young domain can
 * wait weeks to be crawled. IndexNow is a push, so a new post is known to Bing
 * the minute it deploys. Google does NOT take part in IndexNow; Google discovery
 * is Search Console plus the sitemap.
 *
 *   node scripts/submit-indexnow.mjs               # URLs with lastmod in the last 7 days
 *   node scripts/submit-indexnow.mjs --all         # every sitemap URL
 *   node scripts/submit-indexnow.mjs --since-days 30
 *   node scripts/submit-indexnow.mjs --dry-run     # print the payload, send nothing
 *
 * It reads dist/sitemap.xml, the file that was just built and uploaded, so what
 * it submits is what the site serves. The key is not a constant: it is the one
 * dist/<32 hex>.txt file whose body equals its own name. IndexNow verifies
 * ownership by fetching https://<host>/<key>.txt, so the key file must be live
 * before this runs; CI runs it after the S3 upload.
 *
 * A failed push never fails a deploy. IndexNow is an accelerator, not a gate.
 */
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ENDPOINT = 'https://api.indexnow.org/IndexNow'
/** IndexNow accepts up to 10,000 URLs per request. */
export const MAX_URLS_PER_REQUEST = 10000
const DEFAULT_SINCE_DAYS = 7
const MS_PER_DAY = 24 * 60 * 60 * 1000
const KEY_FILE = /^([0-9a-f]{32})\.txt$/

/**
 * @typedef {{ loc: string, lastmod: string | null }} SitemapUrl
 */

/**
 * @param {string} xml
 * @returns {SitemapUrl[]}
 */
export function parseSitemap(xml) {
  const urls = []
  for (const block of xml.match(/<url>[\s\S]*?<\/url>/g) ?? []) {
    const loc = block.match(/<loc>\s*([^<\s]+)\s*<\/loc>/)?.[1]
    if (!loc) continue
    const lastmod = block.match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/)?.[1] ?? null
    urls.push({ loc: loc.replace(/&amp;/g, '&'), lastmod })
  }
  return urls
}

/**
 * Entries changed within `sinceDays` of `now`. An entry with no lastmod is kept:
 * the sitemap cannot say it is unchanged, and a spare submission costs nothing.
 *
 * @param {SitemapUrl[]} urls
 * @param {{ now: Date, sinceDays: number, all: boolean }} options
 * @returns {string[]}
 */
export function selectUrls(urls, { now, sinceDays, all }) {
  if (all) return urls.map((entry) => entry.loc)
  const cutoff = now.getTime() - sinceDays * MS_PER_DAY
  return urls
    .filter((entry) => {
      if (!entry.lastmod) return true
      const changedAt = Date.parse(entry.lastmod)
      return Number.isNaN(changedAt) || changedAt >= cutoff
    })
    .map((entry) => entry.loc)
}

/**
 * IndexNow requires every URL in one request to share the payload's host.
 *
 * @param {string[]} urls
 * @param {string} key
 * @returns {{ host: string, key: string, keyLocation: string, urlList: string[] }}
 */
export function buildPayload(urls, key) {
  if (urls.length === 0) throw new Error('no URLs to submit')
  if (urls.length > MAX_URLS_PER_REQUEST) {
    throw new Error(`${urls.length} URLs exceeds the IndexNow limit of ${MAX_URLS_PER_REQUEST}`)
  }
  const origins = new Set(urls.map((url) => new URL(url).origin))
  if (origins.size !== 1) {
    throw new Error(`sitemap spans several origins: ${[...origins].join(', ')}`)
  }
  const origin = [...origins][0]
  const { hostname } = new URL(origin)
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    throw new Error(`refusing to submit ${origin}: the build had no public site origin`)
  }
  return { host: new URL(origin).host, key, keyLocation: `${origin}/${key}.txt`, urlList: urls }
}

/**
 * The key is the 32-hex file in `distDir` whose body equals its own name.
 *
 * @param {string} distDir
 * @returns {Promise<string>}
 */
export async function findKey(distDir) {
  const found = []
  for (const name of await readdir(distDir)) {
    const match = KEY_FILE.exec(name)
    if (!match) continue
    const body = (await readFile(path.join(distDir, name), 'utf-8')).trim()
    if (body === match[1]) found.push(match[1])
  }
  if (found.length !== 1) {
    throw new Error(`expected exactly one IndexNow key file in ${distDir}, found ${found.length}`)
  }
  return found[0]
}

/**
 * @param {string[]} argv
 * @returns {{ all: boolean, dryRun: boolean, sinceDays: number }}
 */
export function parseArgs(argv) {
  const sinceIndex = argv.indexOf('--since-days')
  const sinceDays = sinceIndex === -1 ? DEFAULT_SINCE_DAYS : Number(argv[sinceIndex + 1])
  if (!Number.isFinite(sinceDays) || sinceDays < 0) throw new Error('--since-days needs a number')
  return { all: argv.includes('--all'), dryRun: argv.includes('--dry-run'), sinceDays }
}

async function main() {
  const { all, dryRun, sinceDays } = parseArgs(process.argv.slice(2))
  const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')

  const xml = await readFile(path.join(distDir, 'sitemap.xml'), 'utf-8')
  const urls = selectUrls(parseSitemap(xml), { now: new Date(), sinceDays, all })
  if (urls.length === 0) {
    console.log(`[indexnow] no URLs changed in the last ${sinceDays} days; nothing to submit`)
    return
  }

  const payload = buildPayload(urls, await findKey(distDir))
  console.log(`[indexnow] ${payload.urlList.length} URL(s) for ${payload.host}`)
  if (dryRun) {
    console.log(JSON.stringify(payload, null, 2))
    return
  }

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  })
  // 200 = accepted. 202 = accepted, key validation pending (normal on the first
  // run). 403/422 mean the key file is not live yet or a URL is off-host.
  if (response.status !== 200 && response.status !== 202) {
    throw new Error(`IndexNow answered ${response.status}: ${(await response.text()).slice(0, 200)}`)
  }
  console.log(`[indexnow] accepted (${response.status})`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`[indexnow] ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  })
}
