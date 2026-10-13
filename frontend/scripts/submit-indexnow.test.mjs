import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildPayload, findKey, parseArgs, parseSitemap, selectUrls } from './submit-indexnow.mjs'

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://vyostra.com/</loc>
    <lastmod>2026-10-12</lastmod>
  </url>
  <url>
    <loc>https://vyostra.com/blog/old-post/</loc>
    <lastmod>2026-08-01</lastmod>
  </url>
  <url>
    <loc>https://vyostra.com/blog/undated/</loc>
  </url>
</urlset>
`
const NOW = new Date('2026-10-13T00:00:00Z')

describe('parseSitemap', () => {
  it('reads every loc with its lastmod, or null when it has none', () => {
    expect(parseSitemap(SITEMAP)).toEqual([
      { loc: 'https://vyostra.com/', lastmod: '2026-10-12' },
      { loc: 'https://vyostra.com/blog/old-post/', lastmod: '2026-08-01' },
      { loc: 'https://vyostra.com/blog/undated/', lastmod: null },
    ])
  })
})

describe('selectUrls', () => {
  const urls = parseSitemap(SITEMAP)

  it('keeps recent and undated entries and drops stale ones', () => {
    expect(selectUrls(urls, { now: NOW, sinceDays: 7, all: false })).toEqual([
      'https://vyostra.com/',
      'https://vyostra.com/blog/undated/',
    ])
  })

  it('returns everything with --all', () => {
    expect(selectUrls(urls, { now: NOW, sinceDays: 7, all: true })).toHaveLength(3)
  })
})

describe('buildPayload', () => {
  const key = 'a'.repeat(32)

  it('names the host and the key file the engines will fetch', () => {
    expect(buildPayload(['https://vyostra.com/'], key)).toEqual({
      host: 'vyostra.com',
      key,
      keyLocation: `https://vyostra.com/${key}.txt`,
      urlList: ['https://vyostra.com/'],
    })
  })

  it('refuses an empty list and a mixed-origin list', () => {
    expect(() => buildPayload([], key)).toThrow(/no URLs/)
    expect(() => buildPayload(['https://vyostra.com/', 'https://example.com/'], key)).toThrow(/several origins/)
  })

  it('refuses a localhost origin, which is what a build without VITE_COGNITO_REDIRECT_URI produces', () => {
    expect(() => buildPayload(['http://localhost:5173/'], key)).toThrow(/no public site origin/)
  })
})

describe('findKey', () => {
  it('returns the 32-hex file whose body equals its name, and ignores look-alikes', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'indexnow-'))
    try {
      const key = 'b'.repeat(32)
      await writeFile(path.join(dir, `${key}.txt`), key)
      await writeFile(path.join(dir, `${'c'.repeat(32)}.txt`), 'something else')
      await writeFile(path.join(dir, 'robots.txt'), 'User-agent: *')
      expect(await findKey(dir)).toBe(key)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('throws when there is no key file', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'indexnow-'))
    try {
      await expect(findKey(dir)).rejects.toThrow(/exactly one/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('the committed key file', () => {
  it('exists in public/ and its body equals its own name, or IndexNow rejects every push', async () => {
    const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')
    const files = (await readdir(publicDir)).filter((name) => /^[0-9a-f]{32}\.txt$/.test(name))
    expect(files).toHaveLength(1)
    expect((await readFile(path.join(publicDir, files[0]), 'utf-8')).trim()).toBe(files[0].replace('.txt', ''))
  })
})

describe('parseArgs', () => {
  it('defaults to a 7-day window and reads the flags', () => {
    expect(parseArgs([])).toEqual({ all: false, dryRun: false, sinceDays: 7 })
    expect(parseArgs(['--all', '--dry-run', '--since-days', '30'])).toEqual({ all: true, dryRun: true, sinceDays: 30 })
  })
})
