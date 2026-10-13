/**
 * llms-full.txt: the body text of every prerendered content page in one file.
 *
 * llms.txt is a map; this is the territory, for answer engines that would
 * rather fetch one file than forty. It is built from the HTML the prerender
 * already produced, so it can never say something the page does not.
 *
 * Not a Google lever (Google has said it does not use llms.txt), and not a
 * substitute for the pages themselves. It costs nothing to keep true.
 */

export interface RenderedPage {
  /** Absolute URL the page is served at. */
  url: string
  /** The prerendered page HTML, head included. */
  html: string
}

const ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&nbsp;': ' ',
  '&mdash;': '—',
  '&ndash;': '–',
  '&hellip;': '…',
  '&rsquo;': '’',
  '&lsquo;': '‘',
  '&rdquo;': '”',
  '&ldquo;': '“',
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&[a-z]+;|&#x?[0-9a-f]+;/gi, (entity) => ENTITIES[entity] ?? entity)
}

/** Elements that carry no readable body text, or repeat on every page. */
const NOISE = /<(script|style|svg|nav|footer|header|form|button|noscript|template|select|textarea)\b[\s\S]*?<\/\1>/gi

/** The page's own content: an <article> if there is one, else <main>, else nothing. */
export function extractContent(html: string): string | null {
  const article = html.match(/<article\b[\s\S]*?<\/article>/i)
  if (article) return article[0]
  const main = html.match(/<main\b[\s\S]*?<\/main>/i)
  return main ? main[0] : null
}

export function pageTitle(html: string): string {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ''
  return decodeEntities(title).replace(/\s+/g, ' ').trim()
}

/** Headings become markdown headings, list items bullets, everything else plain paragraphs. */
export function htmlToText(html: string): string {
  const text = html
    .replace(NOISE, ' ')
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level: string, inner: string) => {
      return `\n\n${'#'.repeat(Math.min(Number(level) + 1, 6))} ${inner.replace(/<[^>]+>/g, ' ')}\n\n`
    })
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(td|th)>/gi, ' | ')
    .replace(/<\/(p|div|section|tr|ul|ol|table|blockquote|figure|dl|dt|dd)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
  return decodeEntities(text)
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export interface LlmsFullInput {
  origin: string
  /** One-paragraph product definition, the same text llms.txt opens with. */
  definition: string
  pages: readonly RenderedPage[]
}

/**
 * Pages with no <article> or <main> are skipped rather than dumped whole: the
 * homepage and a few pages render without either, and their navigation and
 * footer would otherwise repeat in the file.
 */
export function buildLlmsFullTxt({ origin, definition, pages }: LlmsFullInput): string {
  const sections = pages.flatMap((page) => {
    const content = extractContent(page.html)
    if (content === null) return []
    const body = htmlToText(content)
    if (body === '') return []
    return [`## ${pageTitle(page.html)}\n\nSource: ${page.url}\n\n${body}`]
  })
  return `${['# Vyostra AI: full text', `> ${definition}`, `Site: ${origin}`, ...sections].join('\n\n')}\n`
}
