import { isValidElement, useState, type ComponentProps, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

/**
 * What a docs `content.mdx` body renders with.
 *
 * Everything here must render complete with no JavaScript: docs pages are
 * prerendered, and the crawlers and AI engines they are written for never run
 * any. Code is a real <pre><code> in the HTML; the copy button is the only
 * part that needs the script, and the page reads the same without it.
 */

function Heading2(props: ComponentProps<'h2'>) {
  return <h2 {...props} className="mt-14 scroll-mt-28 text-2xl font-extrabold tracking-tight text-on-surface first:mt-0 md:text-3xl" />
}

function Heading3(props: ComponentProps<'h3'>) {
  return <h3 {...props} className="mt-8 scroll-mt-28 text-lg font-bold text-on-surface md:text-xl" />
}

function Paragraph(props: ComponentProps<'p'>) {
  return <p {...props} className="mt-4 text-base leading-relaxed text-on-surface-variant" />
}

function Anchor({ href = '', children, ...props }: ComponentProps<'a'>) {
  const className = 'font-medium text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary'

  // Internal pages go through the router so they do not reload the bundle. A
  // path with a file extension (/llms.txt) is a real file, not a route.
  if (href.startsWith('/') && !/\.[a-z0-9]+$/i.test(href)) {
    return (
      <Link to={href} className={className}>
        {children}
      </Link>
    )
  }

  if (href.startsWith('/')) {
    return (
      <a {...props} href={href} className={className}>
        {children}
      </a>
    )
  }

  return (
    <a {...props} href={href} className={className} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  )
}

function UnorderedList(props: ComponentProps<'ul'>) {
  return <ul {...props} className="mt-4 list-disc space-y-2 pl-6 text-base leading-relaxed text-on-surface-variant marker:text-primary" />
}

function OrderedList(props: ComponentProps<'ol'>) {
  return <ol {...props} className="mt-4 list-decimal space-y-2 pl-6 text-base leading-relaxed text-on-surface-variant marker:font-bold marker:text-primary" />
}

function Strong(props: ComponentProps<'strong'>) {
  return <strong {...props} className="font-semibold text-on-surface" />
}

function InlineCode(props: ComponentProps<'code'>) {
  return <code {...props} className="rounded bg-on-surface/[0.06] px-1.5 py-0.5 font-mono text-[0.875em] text-on-surface" />
}

function Table({ children, ...props }: ComponentProps<'table'>) {
  return (
    <div className="mt-6 overflow-x-auto rounded-2xl border border-outline-variant/30 bg-white">
      <table {...props} className="w-full min-w-[560px] border-collapse text-left text-sm">
        {children}
      </table>
    </div>
  )
}

function TableHead(props: ComponentProps<'thead'>) {
  return <thead {...props} className="border-b border-outline-variant/30 bg-surface-container-high/40" />
}

function TableHeader(props: ComponentProps<'th'>) {
  return <th {...props} scope="col" className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-on-surface-variant" />
}

function TableRow(props: ComponentProps<'tr'>) {
  return <tr {...props} className="border-b border-outline-variant/20 last:border-b-0" />
}

function TableCell(props: ComponentProps<'td'>) {
  return <td {...props} className="px-4 py-3 align-top text-on-surface-variant" />
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      // Clipboard access can be refused; the code is selectable on the page.
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className="rounded-md px-2 py-1 text-xs font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

const LANGUAGE_LABELS: Record<string, string> = {
  bash: 'Shell',
  html: 'HTML',
  http: 'HTTP',
  js: 'JavaScript',
  json: 'JSON',
  python: 'Python',
  text: 'Text',
}

interface CodeBlockProps {
  code: string
  /** The fence's language, e.g. "bash". Only used for the label. */
  language?: string
}

/** A code sample. Plain text in the HTML, so it is quotable exactly as written. */
export function CodeBlock({ code, language = 'text' }: CodeBlockProps) {
  return (
    <div className="mt-5 overflow-hidden rounded-2xl bg-on-surface">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <span className="text-xs font-bold uppercase tracking-wider text-white/50">{LANGUAGE_LABELS[language] ?? language}</span>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed text-white/90">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  )
}

/**
 * A markdown code fence. MDX hands it over as <pre><code className="language-x">,
 * so the text and the language are read off the child rather than rendering it:
 * rendering the child would give a fenced block the inline-code styling.
 */
function Pre({ children }: { children?: ReactNode }) {
  if (!isValidElement<{ children?: ReactNode; className?: string }>(children)) return <pre>{children}</pre>

  const language = /language-(\w+)/.exec(children.props.className ?? '')?.[1]
  const code = String(children.props.children ?? '').replace(/\n$/, '')
  return <CodeBlock code={code} language={language} />
}

interface CalloutProps {
  title?: string
  tone?: 'note' | 'warning'
  children: ReactNode
}

function Callout({ title, tone = 'note', children }: CalloutProps) {
  const toneClass = tone === 'warning' ? 'border-amber-300 bg-amber-50' : 'border-primary/30 bg-primary/5'

  return (
    <aside className={`mt-6 rounded-2xl border p-5 ${toneClass}`}>
      {title ? <p className="font-bold text-on-surface">{title}</p> : null}
      <div className="text-on-surface-variant [&>p:first-child]:mt-1">{children}</div>
    </aside>
  )
}

const WIDGETS = {
  chat: { file: 'widget.js', attribute: 'data-bot-id', placeholder: 'YOUR_BOT_ID' },
  form: { file: 'form-widget.js', attribute: 'data-form-id', placeholder: 'YOUR_FORM_ID' },
  voice: { file: 'voice-widget.js', attribute: 'data-agent-id', placeholder: 'YOUR_AGENT_ID' },
} as const

/** Where the widget scripts are served from. Empty in unit tests, where no build variables are set. */
const WIDGET_HOST: string = import.meta.env.VITE_CDN_URL ?? ''

export function widgetSnippet(kind: keyof typeof WIDGETS, host: string = WIDGET_HOST): string {
  const widget = WIDGETS[kind]
  return `<script
  src="${host}/${widget.file}"
  ${widget.attribute}="${widget.placeholder}"
  async>
</script>`
}

/**
 * The embed tag for one widget, with the script host filled in at build time.
 * A component rather than a code fence because a fence cannot read the host,
 * and a host typed into a page by hand is one that goes stale.
 */
function WidgetSnippet({ kind }: { kind: keyof typeof WIDGETS }) {
  return <CodeBlock code={widgetSnippet(kind)} language="html" />
}

/** Passed to MDXProvider by the docs page. */
export const docsMdxComponents = {
  h2: Heading2,
  h3: Heading3,
  p: Paragraph,
  a: Anchor,
  ul: UnorderedList,
  ol: OrderedList,
  strong: Strong,
  code: InlineCode,
  pre: Pre,
  table: Table,
  thead: TableHead,
  th: TableHeader,
  tr: TableRow,
  td: TableCell,
  // In scope for every page without an import.
  Callout,
  WidgetSnippet,
}
