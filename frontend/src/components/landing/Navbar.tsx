import { useState } from 'react'
import { Menu, X, ArrowRight } from 'lucide-react'
import VyostraLogo from '../VyostraLogo'

interface NavbarProps {
  onOpenDemo: () => void
}

const NAV_LINKS = [
  { label: 'Features', href: '/#features' },
  { label: 'Integrations', href: '/#integrations' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Pricing', href: '/#plans' },
]

export default function Navbar({ onOpenDemo }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex justify-center px-4 pt-4">
      <nav className="w-full max-w-6xl bg-white/80 backdrop-blur-xl border border-black/6 rounded-2xl shadow-lg shadow-black/4 px-5 py-3 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2.5">
          <VyostraLogo size={36} animate={true} />
          <span
            className="font-bold text-gray-900 text-lg tracking-tight"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            VyostraAI
          </span>
        </a>

        <div className="hidden md:flex items-center gap-7">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-sm text-gray-500 hover:text-gray-900 transition-colors font-medium"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <a href="/login" className="text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors">
            Sign in
          </a>
          <a
            href="/signup"
            className="text-sm font-semibold text-white bg-linear-to-r from-violet-600 to-purple-500 px-4 py-2 rounded-xl hover:opacity-90 transition-opacity shadow-md shadow-violet-200/60 flex items-center gap-1.5"
          >
            Get started free
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>

        <button
          className="md:hidden p-2 text-gray-600 hover:text-gray-900 transition-colors"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </nav>

      {mobileOpen && (
        <div className="absolute top-full mt-2 left-4 right-4 bg-white/95 backdrop-blur-xl border border-black/6 rounded-2xl shadow-xl p-4 flex flex-col gap-3">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-sm text-gray-700 font-medium py-2 border-b border-gray-50 last:border-0"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </a>
          ))}
          <button
            onClick={() => {
              setMobileOpen(false)
              onOpenDemo()
            }}
            className="text-sm text-gray-700 font-medium py-2 text-left"
          >
            Watch 2-min demo
          </button>
          <a
            href="/login"
            className="text-sm text-gray-700 font-medium py-2 border-t border-gray-50"
            onClick={() => setMobileOpen(false)}
          >
            Sign in
          </a>
          <a
            href="/signup"
            className="mt-1 text-sm font-semibold text-white bg-linear-to-r from-violet-600 to-purple-500 px-4 py-3 rounded-xl text-center"
            onClick={() => setMobileOpen(false)}
          >
            Get started free
          </a>
        </div>
      )}
    </header>
  )
}
