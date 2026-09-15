import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import Navbar from '../components/landing/Navbar'
import Footer from '../components/landing/Footer'
import DemoModal from '../components/landing/modals/DemoModal'

const SUGGESTED_LINKS: { label: string; to: string }[] = [
  { label: 'Home', to: '/' },
  { label: 'Features', to: '/features' },
  { label: 'Help Center', to: '/help' },
  { label: 'Contact us', to: '/contact' },
]

/**
 * Rendered for any path no route matches.
 *
 * The HTTP status is still 200 -- CloudFront rewrites unknown paths to
 * index.html before S3 can say otherwise, and fixing that lives in the
 * CloudFront function, not here. What this page can do is stop the soft 404
 * being indexed: before it existed an unknown URL rendered a blank page with no
 * robots directive at all.
 */
export default function NotFound() {
  const [isDemoOpen, setIsDemoOpen] = useState(false)

  return (
    <div className="landing-page bg-background">
      <Helmet>
        <title>Page not found — Vyostra AI</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <Navbar onOpenDemo={() => setIsDemoOpen(true)} />

      <main className="mx-auto max-w-2xl px-6 pb-32 pt-40 text-center lg:px-8">
        <p className="text-sm font-semibold uppercase tracking-widest text-violet-600">404</p>
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-gray-900">We couldn&apos;t find that page</h1>
        <p className="mt-4 text-gray-500">The link may be broken, or the page may have moved.</p>
        <nav aria-label="Suggested pages" className="mt-10 flex flex-wrap justify-center gap-3">
          {SUGGESTED_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="rounded-full border border-black/10 px-5 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-violet-300 hover:text-violet-700"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </main>

      <Footer />
      <DemoModal isOpen={isDemoOpen} onClose={() => setIsDemoOpen(false)} />
    </div>
  )
}
