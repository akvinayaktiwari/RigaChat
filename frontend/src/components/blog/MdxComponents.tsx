import type { ComponentProps, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Callout,
  CheckList,
  Cite,
  DataTable,
  Emphasis,
  FactCard,
  JAKARTA_FONT,
  NumberedCard,
  PhaseTimeline,
  PullQuote,
  ScrollReveal,
  StatRow,
  StatTile,
} from './BlogPrimitives'

/**
 * What a `content.mdx` post body renders with.
 *
 * Two jobs. The element map gives plain markdown (headings, paragraphs, lists,
 * tables) the same look the hand-built TSX posts have, so a post written in
 * markdown is not visibly a lesser citizen. The component map puts every blog
 * primitive in scope, so a post can drop in a <Callout> or <DataTable> without
 * an import line at the top of the file.
 *
 * Prose must render VISIBLE with no JavaScript: these posts are prerendered and
 * read by crawlers that never run any. Nothing here may start at opacity 0 --
 * see useStaticMotion() in ../landing/motion-primitives.
 */

function Heading2({ children, ...props }: ComponentProps<'h2'>) {
  return (
    <ScrollReveal className="mt-16 first:mt-0">
      <div className="flex items-center gap-3">
        <span className="h-px w-8 bg-gradient-to-r from-violet-400 to-transparent" />
      </div>
      <h2 {...props} className="mt-4 scroll-mt-28 text-2xl font-bold text-white md:text-3xl" style={JAKARTA_FONT}>
        {children}
      </h2>
    </ScrollReveal>
  )
}

function Heading3({ children, ...props }: ComponentProps<'h3'>) {
  return (
    <h3 {...props} className="mt-10 scroll-mt-28 text-lg font-bold text-white md:text-xl" style={JAKARTA_FONT}>
      {children}
    </h3>
  )
}

function Paragraph(props: ComponentProps<'p'>) {
  return <p {...props} className="mt-4 text-[15px] leading-relaxed text-white/65" />
}

function Anchor({ href = '', children, ...props }: ComponentProps<'a'>) {
  const className = 'text-violet-300 underline decoration-violet-300/40 underline-offset-4 transition-colors hover:text-violet-200'

  // Internal links go through the router so they do not reload the bundle.
  if (href.startsWith('/')) {
    return (
      <Link to={href} className={className}>
        {children}
      </Link>
    )
  }

  return (
    <a {...props} href={href} className={className} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  )
}

function UnorderedList(props: ComponentProps<'ul'>) {
  return <ul {...props} className="mt-4 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-white/65 marker:text-violet-300/70" />
}

function OrderedList(props: ComponentProps<'ol'>) {
  return <ol {...props} className="mt-4 list-decimal space-y-2 pl-5 text-[15px] leading-relaxed text-white/65 marker:text-violet-300/70" />
}

function Strong(props: ComponentProps<'strong'>) {
  return <strong {...props} className="font-semibold text-white/90" />
}

function InlineCode(props: ComponentProps<'code'>) {
  return <code {...props} className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[13px] text-cyan-200" />
}

function Blockquote({ children }: { children?: ReactNode }) {
  return <PullQuote>{children}</PullQuote>
}

function HorizontalRule() {
  return <hr className="my-12 border-white/10" />
}

/** Markdown tables get the same shell as <DataTable>, including horizontal scroll. */
function Table({ children, ...props }: ComponentProps<'table'>) {
  return (
    <div className="my-6 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02]">
      <table {...props} className="w-full min-w-[640px] border-collapse text-left text-sm">
        {children}
      </table>
    </div>
  )
}

function TableHead(props: ComponentProps<'thead'>) {
  return <thead {...props} className="border-b border-white/10 bg-white/[0.03]" />
}

function TableHeader(props: ComponentProps<'th'>) {
  return <th {...props} scope="col" className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-white/50" />
}

function TableRow(props: ComponentProps<'tr'>) {
  return <tr {...props} className="border-b border-white/5 transition-colors last:border-b-0 hover:bg-white/[0.03]" />
}

function TableCell(props: ComponentProps<'td'>) {
  return <td {...props} className="px-4 py-3 align-top text-white/70" />
}

/** Passed to MDXProvider; also usable directly as `<Content components={mdxComponents} />`. */
export const mdxComponents = {
  h2: Heading2,
  h3: Heading3,
  p: Paragraph,
  a: Anchor,
  ul: UnorderedList,
  ol: OrderedList,
  strong: Strong,
  code: InlineCode,
  blockquote: Blockquote,
  hr: HorizontalRule,
  table: Table,
  thead: TableHead,
  th: TableHeader,
  tr: TableRow,
  td: TableCell,
  // Primitives, in scope for every post without an import.
  Callout,
  CheckList,
  Cite,
  DataTable,
  Emphasis,
  FactCard,
  NumberedCard,
  PhaseTimeline,
  PullQuote,
  ScrollReveal,
  StatRow,
  StatTile,
}
