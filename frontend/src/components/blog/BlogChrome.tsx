import { type ReactNode } from 'react'
import { FileText, Download } from 'lucide-react'
import type { BlogAttachment, BlogPostMeta } from '../../types/blog'
import { JAKARTA_FONT } from './BlogPrimitives'

/**
 * Shared blog chrome: the dark surface wrapper, the dot-grid/aurora backdrop,
 * post meta formatting, and the attachment download card.
 */

/** Formats an ISO date as "1 August 2026" without pulling in a date library. */
export function formatPostDate(iso: string): string {
  const parsed = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return iso
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/**
 * The dark "futuristic" surface every blog view sits on. Reuses the landing
 * page's roadmap-dot-grid overlay and #0d0d18 base so the blog reads as part
 * of the same site rather than a separate property.
 */
export function BlogSurface({ children }: { children: ReactNode }) {
  return (
    <div className="relative overflow-hidden bg-[#0d0d18]">
      <div aria-hidden="true" className="roadmap-dot-grid pointer-events-none absolute inset-0" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-violet-600/20 blur-[120px]"
      />
      <div aria-hidden="true" className="pointer-events-none absolute right-0 top-[40%] h-[380px] w-[380px] rounded-full bg-cyan-500/10 blur-[120px]" />
      <div className="relative">{children}</div>
    </div>
  )
}

/** Category eyebrow + tag pills. */
export function PostTags({ tags }: { tags: string[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <li key={tag} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-white/50">
          {tag}
        </li>
      ))}
    </ul>
  )
}

/** Date · reading time line under a post title. */
export function PostMetaLine({ meta }: { meta: BlogPostMeta }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/40">
      <time dateTime={meta.publishedAt}>{formatPostDate(meta.publishedAt)}</time>
      <span aria-hidden="true">·</span>
      <span>{meta.readingMinutes} min read</span>
    </div>
  )
}

/**
 * Download card for the post's source asset. Rendered twice on a post (once
 * near the top, once at the end) since a reader who scrolls the whole article
 * shouldn't have to scroll back up to get the file.
 */
export function AttachmentCard({ attachment, variant = 'full' }: { attachment: BlogAttachment; variant?: 'full' | 'compact' }) {
  const meta = [attachment.pages ? `${attachment.pages} pages` : null, 'PDF', attachment.size].filter(Boolean).join(' · ')

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-violet-400/25 bg-gradient-to-br from-violet-500/[0.14] to-cyan-500/[0.05] ${
        variant === 'full' ? 'p-6 md:p-7' : 'p-5'
      }`}
    >
      <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-violet-500/20 blur-3xl" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="shrink-0 rounded-xl border border-violet-400/30 bg-violet-500/15 p-2.5 text-violet-200">
            <FileText className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            {variant === 'full' ? (
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-300">Source document</div>
            ) : null}
            <div className={`font-bold text-white ${variant === 'full' ? 'mt-1.5 text-base' : 'text-sm'}`} style={JAKARTA_FONT}>
              {attachment.label}
            </div>
            <div className="mt-1 text-xs text-white/45">{meta}</div>
          </div>
        </div>
        <a
          href={attachment.file}
          download
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-[#0d0d18] transition-transform hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Download PDF
        </a>
      </div>
    </div>
  )
}
