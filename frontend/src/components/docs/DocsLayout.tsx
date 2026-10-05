import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../landing/Navbar'
import Footer from '../landing/Footer'
import DemoModal from '../landing/modals/DemoModal'
import { docsBySection } from '../../content/docs/registry'

function navLinkClass(isCurrent: boolean): string {
  const state = isCurrent ? 'bg-primary/10 font-bold text-primary' : 'text-on-surface-variant hover:bg-on-surface/5 hover:text-on-surface'
  return `block rounded-lg px-3 py-1.5 text-sm transition-colors ${state}`
}

/**
 * Every docs page, grouped. Real links in the prerendered HTML, so a crawler
 * landing on any one page can reach all the others.
 */
function DocsNav({ currentSlug }: { currentSlug?: string }) {
  return (
    <nav aria-label="Documentation" className="lg:sticky lg:top-28">
      <Link to="/docs/" className={navLinkClass(currentSlug === undefined)} aria-current={currentSlug === undefined ? 'page' : undefined}>
        Overview
      </Link>
      {docsBySection().map((group) => (
        <div key={group.section} className="mt-6">
          <p className="px-3 text-xs font-bold uppercase tracking-widest text-on-surface/50">{group.section}</p>
          <ul className="mt-2 space-y-0.5">
            {group.pages.map((page) => (
              <li key={page.slug}>
                <Link
                  to={`/docs/${page.slug}/`}
                  className={navLinkClass(page.slug === currentSlug)}
                  aria-current={page.slug === currentSlug ? 'page' : undefined}
                >
                  {page.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

interface DocsLayoutProps {
  /** The page being shown; omitted on the docs index. */
  currentSlug?: string
  children: ReactNode
}

/**
 * Chrome for the developer docs: the site navbar, the docs sidebar, the page,
 * the footer. Plain markup with no motion wrapper, because these pages are
 * prerendered and an entrance animation would ship them at opacity 0.
 */
export default function DocsLayout({ currentSlug, children }: DocsLayoutProps) {
  const [isDemoOpen, setIsDemoOpen] = useState(false)

  return (
    <div className="landing-page bg-background">
      <Navbar onOpenDemo={() => setIsDemoOpen(true)} />

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 pb-24 pt-32 lg:grid-cols-[14rem_minmax(0,1fr)] lg:px-8">
        {/* The page comes first in the HTML and the sidebar is moved beside it
            on wide screens. On a phone, and for a crawler reading top to bottom,
            the answer is then the first thing on the page, not a list of links. */}
        <main className="min-w-0">{children}</main>
        <aside className="border-t border-outline-variant/30 pt-8 lg:order-first lg:border-t-0 lg:pt-0">
          <DocsNav currentSlug={currentSlug} />
        </aside>
      </div>

      <Footer />
      <DemoModal isOpen={isDemoOpen} onClose={() => setIsDemoOpen(false)} />
    </div>
  )
}
