/**
 * Every prerendered page is served at its trailing-slash URL; the bare form
 * 301s there (deploy/cloudfront/viewer-request.js). A link to the bare form
 * costs every crawler a redirect hop, and Search Console then reports the
 * bare and slashed URLs as two pages, splitting one page's signals.
 *
 * Run by scripts/prerender.mjs over every rendered page, so a slashless link
 * fails the build instead of shipping.
 */

export interface SlashlessLink {
  /** The prerendered route whose HTML contains the link. */
  page: string
  /** The href as written, e.g. "/blog" or "/glossary#crm". */
  href: string
}

const HREF_PATTERN = /href="(\/[^"]*)"/g

/** The path part of an href: no query string, no fragment. */
function hrefPath(href: string): string {
  return href.split(/[?#]/, 1)[0]
}

/** Hrefs in `html` that point at a prerendered route without its trailing slash. */
export function findSlashlessLinks(html: string, prerenderedRoutes: ReadonlySet<string>): string[] {
  const found: string[] = []
  for (const match of html.matchAll(HREF_PATTERN)) {
    const href = match[1]
    const linkPath = hrefPath(href)
    if (linkPath !== '/' && !linkPath.endsWith('/') && prerenderedRoutes.has(linkPath)) {
      found.push(href)
    }
  }
  return found
}

/** Every slashless internal link across the rendered pages, one entry per distinct href per page. */
export function auditInternalLinks(pages: readonly { route: string; html: string }[]): SlashlessLink[] {
  const routes = new Set(pages.map((page) => page.route))
  return pages.flatMap((page) =>
    [...new Set(findSlashlessLinks(page.html, routes))].map((href) => ({ page: page.route, href })),
  )
}
