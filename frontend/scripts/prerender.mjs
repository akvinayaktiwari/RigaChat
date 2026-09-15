/**
 * Build-time prerender for blog and legal routes, plus robots.txt and sitemap.xml.
 *
 * Runs after `vite build`. Builds an SSR bundle of prerender-entry.tsx, renders
 * each blog route to HTML, and writes it into dist/ as a real static file so
 * crawlers and link-preview scrapers see article content instead of an empty
 * <div id="root">. The client bundle still boots normally on top of it.
 *
 * Emits:
 *   dist/blog/index.html
 *   dist/blog/<slug>/index.html
 *   dist/privacy-policy/index.html, dist/terms-of-service/index.html
 *   dist/robots.txt, dist/sitemap.xml
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'vite'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(root, 'dist')
const ssrOutDir = path.join(root, '.prerender-ssr')

/** Injects rendered markup and head tags into the built index.html shell. */
function composePage(template, { html, head }) {
  let page = template

  if (head) {
    // The shell ships a default <title>. Helmet's tags are appended after it,
    // and crawlers honour the FIRST <title> in the document — so without this
    // every post would present the generic site title. Drop the shell's title
    // whenever the route supplied its own.
    if (/<title[\s>]/i.test(head)) {
      page = page.replace(/[ \t]*<title>[\s\S]*?<\/title>\r?\n?/i, '')
    }

    page = page.replace('</head>', `  ${head}\n  </head>`)
  }

  const rootDiv = '<div id="root"></div>'
  if (!page.includes(rootDiv)) {
    throw new Error('Could not find <div id="root"></div> in dist/index.html — the prerender injection point changed.')
  }

  return page.replace(rootDiv, `<div id="root">${html}</div>`)
}

/**
 * Canonical URLs are absolute and built from VITE_COGNITO_REDIRECT_URI's origin
 * (src/lib/site.ts). A production build with that variable missing would ship
 * relative or localhost canonicals, which is worse than none -- so CI refuses.
 * Local builds only warn: their redirect URI is legitimately localhost.
 */
function assertPublicOrigin(siteUrl) {
  if (siteUrl.startsWith('https://')) return

  const message = `[prerender] site origin is "${siteUrl}" (from VITE_COGNITO_REDIRECT_URI); canonical URLs will not be public.`
  if (process.env.CI === 'true') {
    throw new Error(`${message} Set the variable to the live https URL.`)
  }
  console.warn(message)
}

async function main() {
  const template = await readFile(path.join(distDir, 'index.html'), 'utf-8').catch(() => {
    throw new Error('dist/index.html not found. Run `vite build` before prerendering.')
  })

  // Build the SSR bundle. `ssr: true` keeps React external and targets Node.
  await build({
    root,
    logLevel: 'warn',
    build: {
      ssr: path.join(root, 'prerender-entry.tsx'),
      outDir: ssrOutDir,
      emptyOutDir: true,
      rollupOptions: { output: { entryFileNames: 'prerender-entry.mjs' } },
    },
  })

  const entryPath = path.join(ssrOutDir, 'prerender-entry.mjs')
  const { renderRoute, getRoutes, getCrawlFiles, SITE_URL } = await import(pathToFileURL(entryPath).href)
  assertPublicOrigin(SITE_URL)

  for (const [fileName, contents] of Object.entries(getCrawlFiles())) {
    await writeFile(path.join(distDir, fileName), contents, 'utf-8')
    console.log(`[prerender] ${fileName} -> dist/${fileName}`)
  }

  const routes = getRoutes()
  if (routes.length === 0) {
    console.log('[prerender] no blog routes to render')
    return
  }

  for (const route of routes) {
    const rendered = await renderRoute(route)
    const page = composePage(template, rendered)

    // "/blog" -> dist/blog/index.html, "/blog/x" -> dist/blog/x/index.html
    const outDir = path.join(distDir, route)
    await mkdir(outDir, { recursive: true })
    await writeFile(path.join(outDir, 'index.html'), page, 'utf-8')

    const kb = (Buffer.byteLength(page, 'utf8') / 1024).toFixed(1)
    console.log(`[prerender] ${route} -> ${path.relative(root, path.join(outDir, 'index.html'))} (${kb} kB)`)
  }

  await rm(ssrOutDir, { recursive: true, force: true })
  console.log(`[prerender] done — ${routes.length} route(s)`)
}

main().catch((error) => {
  console.error('[prerender] failed:', error)
  process.exit(1)
})
