import { type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

/**
 * Shared building blocks for blog post bodies.
 *
 * Visual language matches the landing page's RoadmapSection (the site's
 * existing "futuristic" surface): #0d0d18 base, dot-grid overlay, violet
 * primary with cyan as the secondary accent, Plus Jakarta Sans headings
 * over Inter body. Nothing here introduces a new font or color token.
 */

export const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

/**
 * Fades content up as it scrolls into view. Falls back to a plain div when
 * the user has prefers-reduced-motion set, matching index.css's existing
 * treatment of the roadmap animations.
 */
export function ScrollReveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}

/** Numbered section heading with a violet rule above it. */
export function Section({ index, title, intro, children }: { index: string; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-20 first:mt-0 scroll-mt-28" id={`section-${index}`}>
      <ScrollReveal>
        <div className="flex items-center gap-3">
          <span className="h-px w-8 bg-gradient-to-r from-violet-400 to-transparent" />
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-300">Section {index}</span>
        </div>
        <h2 className="mt-4 text-2xl font-bold text-white md:text-3xl" style={JAKARTA_FONT}>
          {title}
        </h2>
        {intro ? <div className="mt-4 max-w-3xl text-[15px] leading-relaxed text-white/60">{intro}</div> : null}
      </ScrollReveal>
      <div className="mt-8">{children}</div>
    </section>
  )
}

/** Body copy. Keeps long-form paragraphs at a readable measure. */
export function Prose({ children }: { children: ReactNode }) {
  return <div className="max-w-3xl space-y-4 text-[15px] leading-relaxed text-white/70">{children}</div>
}

/** A big number with a label under it. Used in hero rows and inside sections. */
export function StatTile({ value, label, accent = 'violet' }: { value: string; label: string; accent?: 'violet' | 'cyan' }) {
  const valueColor = accent === 'cyan' ? 'text-cyan-300' : 'text-violet-300'

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-white/20">
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full blur-2xl transition-opacity group-hover:opacity-100 ${
          accent === 'cyan' ? 'bg-cyan-500/20' : 'bg-violet-500/20'
        } opacity-60`}
      />
      <div className={`relative text-2xl font-extrabold md:text-3xl ${valueColor}`} style={JAKARTA_FONT}>
        {value}
      </div>
      <div className="relative mt-2 text-[11px] font-semibold uppercase leading-snug tracking-[0.14em] text-white/45">{label}</div>
    </div>
  )
}

export function StatRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{children}</div>
}

/**
 * Data table on a dark surface. Wrapped in its own horizontal scroll
 * container so wide financial tables never force the page body to scroll
 * sideways on mobile.
 */
export function DataTable({ headers, rows, caption, columnClasses = [] }: { headers: ReactNode[]; rows: ReactNode[][]; caption?: ReactNode; columnClasses?: string[] }) {
  return (
    <figure className="my-2">
      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02]">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.03]">
              {headers.map((header, i) => (
                <th
                  key={i}
                  scope="col"
                  className={`px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-white/50 ${columnClasses[i] ?? ''}`}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-white/5 transition-colors last:border-b-0 hover:bg-white/[0.03]">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className={`px-4 py-3 align-top text-white/70 ${columnClasses[cellIndex] ?? ''}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {caption ? <figcaption className="mt-3 text-xs leading-relaxed text-white/40">{caption}</figcaption> : null}
    </figure>
  )
}

/** Emphasised row value, for totals and EBITDA lines inside DataTable. */
export function Emphasis({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-white">{children}</span>
}

/** Bordered aside for methodology notes, caveats and callouts. */
export function Callout({ title, tone = 'neutral', children }: { title?: string; tone?: 'neutral' | 'warning'; children: ReactNode }) {
  const toneClasses = tone === 'warning' ? 'border-amber-400/25 bg-amber-500/[0.06]' : 'border-violet-400/25 bg-violet-500/[0.06]'
  const titleColor = tone === 'warning' ? 'text-amber-200' : 'text-violet-200'

  return (
    <aside className={`my-6 rounded-2xl border px-5 py-4 ${toneClasses}`}>
      {title ? (
        <div className={`text-[11px] font-bold uppercase tracking-[0.16em] ${titleColor}`} style={JAKARTA_FONT}>
          {title}
        </div>
      ) : null}
      <div className={`text-sm leading-relaxed text-white/65 ${title ? 'mt-2' : ''}`}>{children}</div>
    </aside>
  )
}

/** Pull quote — the thesis-statement treatment. */
export function PullQuote({ children }: { children: ReactNode }) {
  return (
    <blockquote className="relative my-8 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-violet-500/[0.12] to-cyan-500/[0.06] px-6 py-6 md:px-8 md:py-7">
      <div aria-hidden="true" className="pointer-events-none absolute -left-8 -top-10 h-32 w-32 rounded-full bg-violet-500/20 blur-3xl" />
      <p className="relative text-lg font-medium leading-relaxed text-white/90 md:text-xl" style={JAKARTA_FONT}>
        {children}
      </p>
    </blockquote>
  )
}

/** Numbered risk / consideration card. */
export function NumberedCard({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return (
    <ScrollReveal className="relative rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-violet-400/30 md:p-6">
      <div className="flex items-start gap-4">
        <span
          className="shrink-0 rounded-lg border border-violet-400/30 bg-violet-500/15 px-2.5 py-1 text-sm font-bold text-violet-300"
          style={JAKARTA_FONT}
          aria-hidden="true"
        >
          {number}
        </span>
        <div>
          <h3 className="text-base font-bold text-white md:text-lg" style={JAKARTA_FONT}>
            {title}
          </h3>
          <div className="mt-2 text-sm leading-relaxed text-white/60">{children}</div>
        </div>
      </div>
    </ScrollReveal>
  )
}

export interface PhaseItem {
  phase: string
  timeline: string
  action: ReactNode
}

/** Vertical phased timeline with a connecting rail. */
export function PhaseTimeline({ phases }: { phases: PhaseItem[] }) {
  return (
    <ol className="relative space-y-4 border-l border-white/10 pl-6">
      {phases.map((item) => (
        <li key={item.phase} className="relative">
          <span
            aria-hidden="true"
            className="absolute -left-[31px] top-1.5 h-2.5 w-2.5 rounded-full border border-violet-300/50 bg-violet-400 shadow-[0_0_12px_rgba(167,139,250,0.7)]"
          />
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-300" style={JAKARTA_FONT}>
                Phase {item.phase}
              </span>
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/40">{item.timeline}</span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-white/65">{item.action}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

/** Ordered list styled for the closing checklist. */
export function CheckList({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-3">
      {items.map((item, index) => (
        <li key={index} className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <span className="shrink-0 text-sm font-bold text-cyan-300" style={JAKARTA_FONT}>
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className="text-sm leading-relaxed text-white/65">{item}</span>
        </li>
      ))}
    </ol>
  )
}

/** Small labelled fact, used for the worked example's site/capex/ADR row. */
export function FactCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300">{label}</div>
      <p className="mt-2 text-sm leading-relaxed text-white/70">{children}</p>
    </div>
  )
}

/** Superscript source marker used throughout the screening table. */
export function Cite({ n }: { n: string }) {
  return <sup className="ml-0.5 text-[10px] font-semibold text-violet-300/80">{n}</sup>
}
