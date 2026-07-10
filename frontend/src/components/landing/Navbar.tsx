import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Menu, X, ArrowRight, MessageSquare } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'

interface NavbarProps {
  onOpenDemo: () => void
}

const NAV_ACTIVE_CLASS = 'text-sm font-semibold text-primary border-b-2 border-primary py-1.5 px-0.5'
const NAV_INACTIVE_CLASS = 'text-sm font-semibold text-on-surface-variant hover:text-primary transition-colors py-1.5'

export default function Navbar({ onOpenDemo }: NavbarProps) {
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('')

  useEffect(() => {
    const sections = ['features', 'whatsapp', 'knowledge', 'pricing']

    function handleScroll() {
      const scrollPosition = window.scrollY + 100

      for (const section of sections) {
        const element = document.getElementById(section)
        if (!element) continue

        const { offsetTop, offsetHeight } = element
        if (scrollPosition >= offsetTop && scrollPosition < offsetTop + offsetHeight) {
          setActiveSection(section)
          return
        }
      }

      if (window.scrollY < 100) {
        setActiveSection('')
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <>
      <nav className="fixed top-0 w-full z-40 bg-background/80 backdrop-blur-xl border-b border-outline-variant/30 h-20">
        <div className="flex items-center justify-between px-6 lg:px-8 max-w-7xl mx-auto h-full">
          {/* Logo */}
          <div className="flex items-center gap-10">
            <a href="/" className="flex items-center gap-2 group" id="navbar-brand-logo">
              <div className="w-9 h-9 rounded-xl cta-accent flex items-center justify-center text-white font-black text-lg shadow-sm group-hover:scale-105 transition-transform">
                B
              </div>
              <span className="font-extrabold text-2xl tracking-tight text-on-surface">BeepBoop</span>
            </a>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-8">
              <a
                href="#features"
                className={activeSection === 'features' ? NAV_ACTIVE_CLASS : NAV_INACTIVE_CLASS}
                id="nav-link-product"
              >
                Features
              </a>
              <a
                href="#whatsapp"
                className={activeSection === 'whatsapp' ? NAV_ACTIVE_CLASS : NAV_INACTIVE_CLASS}
                id="nav-link-whatsapp"
              >
                WhatsApp
              </a>
              <a
                href="#knowledge"
                className={activeSection === 'knowledge' ? NAV_ACTIVE_CLASS : NAV_INACTIVE_CLASS}
                id="nav-link-knowledge"
              >
                Knowledge Base
              </a>
              <a
                href="#pricing"
                className={activeSection === 'pricing' ? NAV_ACTIVE_CLASS : NAV_INACTIVE_CLASS}
                id="nav-link-pricing-section"
              >
                Pricing
              </a>
            </div>
          </div>

          {/* Desktop Right Buttons */}
          <div className="hidden md:flex items-center gap-4">
            <button
              onClick={onOpenDemo}
              className="text-sm font-semibold text-on-surface-variant hover:text-primary py-2 px-4 transition-colors"
              id="desktop-demo-btn"
            >
              Watch Demo
            </button>
            <button
              onClick={() => navigate('/login')}
              className="text-sm font-semibold text-on-surface-variant hover:text-primary py-2 px-4 transition-colors"
              id="desktop-login-btn"
            >
              Sign in
            </button>
            <button
              onClick={() => navigate('/signup')}
              className="cta-accent text-white text-sm font-semibold px-5 py-3 rounded-xl transition-all hover:shadow-[0_4px_20px_rgba(99,102,241,0.25)] hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              id="desktop-signup-btn"
            >
              Start Free
            </button>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-on-surface p-2 rounded-xl hover:bg-surface-container transition-colors"
            aria-label="Toggle mobile menu"
            id="mobile-menu-toggle"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </nav>

      {/* Mobile Drawer Navigation */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 z-30 bg-on-background/20 backdrop-blur-sm md:hidden"
              id="mobile-menu-backdrop"
            />

            {/* Menu List */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', bounce: 0.1, duration: 0.4 }}
              className="fixed right-0 top-20 bottom-0 w-4/5 max-w-sm bg-surface-container-lowest border-l border-outline-variant/30 p-6 z-30 shadow-2xl flex flex-col justify-between md:hidden"
              id="mobile-menu-drawer"
            >
              <div className="space-y-6">
                <p className="text-xs font-bold text-outline uppercase tracking-wider">Navigation</p>
                <div className="flex flex-col gap-4">
                  <a
                    href="#features"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 text-lg font-bold text-primary py-2 border-b border-outline-variant/10"
                    id="mobile-nav-product"
                  >
                    <MessageSquare className="w-5 h-5" /> Features
                  </a>
                </div>
              </div>

              <div className="space-y-4">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false)
                    onOpenDemo()
                  }}
                  className="w-full py-3.5 border border-outline text-on-surface text-center font-bold rounded-xl hover:bg-surface-container transition-colors"
                  id="mobile-demo-btn"
                >
                  Watch Demo
                </button>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false)
                    navigate('/signup')
                  }}
                  className="w-full py-4 cta-accent text-white text-center font-bold rounded-xl flex items-center justify-center gap-2 hover:opacity-95 transition-opacity"
                  id="mobile-signup-btn"
                >
                  Start Free <ArrowRight className="w-4.5 h-4.5" />
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
