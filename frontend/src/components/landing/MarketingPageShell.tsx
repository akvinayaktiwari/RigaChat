import { useState, type ReactNode } from 'react'
import Navbar from './Navbar'
import Footer from './Footer'
import DemoModal from './modals/DemoModal'

interface MarketingPageShellProps {
  badge: string
  /** The page's H1. */
  headline: string
  /**
   * The direct answer the page opens with, 40-60 words. It is the passage an
   * answer engine lifts, so it has to stand alone and name Vyostra AI in full.
   */
  lead: string
  children: ReactNode
}

/**
 * Chrome for a text-led marketing page: navbar, a hero that leads with the
 * answer, the page's sections, footer.
 *
 * Plain markup with no motion wrapper: these pages are prerendered, and an
 * entrance animation would ship the answer at opacity 0 to crawlers that never
 * run JS.
 */
export default function MarketingPageShell({ badge, headline, lead, children }: MarketingPageShellProps) {
  const [isDemoOpen, setIsDemoOpen] = useState(false)

  return (
    <div className="landing-page bg-background">
      <Navbar onOpenDemo={() => setIsDemoOpen(true)} />

      <main className="pt-36 pb-24 px-6 lg:px-8">
        <section className="relative py-16 md:py-20 bg-gradient-to-br from-surface-container-high/60 via-surface to-background border-b border-outline-variant/30 rounded-3xl mb-16 overflow-hidden px-6 md:px-12 text-center">
          <div className="relative z-10 max-w-3xl mx-auto">
            <span className="inline-flex items-center bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-4">
              {badge}
            </span>
            <h1 className="text-4xl md:text-5xl font-extrabold text-on-surface tracking-tight leading-tight">{headline}</h1>
            <p className="mt-5 text-base md:text-lg text-on-surface-variant leading-relaxed">{lead}</p>
          </div>
        </section>
        {children}
      </main>

      <Footer />
      <DemoModal isOpen={isDemoOpen} onClose={() => setIsDemoOpen(false)} />
    </div>
  )
}
