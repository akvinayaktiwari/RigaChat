import { useState, useEffect } from 'react'
import { Calendar, Download, Mail, MapPin, FileCheck, Settings2, ShieldCheck, CreditCard, AlertTriangle, RefreshCw, ChevronDown } from 'lucide-react'
import Navbar from '../components/landing/Navbar'
import Footer from '../components/landing/Footer'
import DemoModal from '../components/landing/modals/DemoModal'

interface TOCItem {
  id: string
  label: string
  order: string
}

interface TermsSection {
  id: string
  order: string
  title: string
  icon: 'FileCheck' | 'Settings2' | 'ShieldCheck' | 'CreditCard' | 'AlertTriangle' | 'RefreshCw'
  body: string
}

const TOC_ITEMS: TOCItem[] = [
  { id: 'section-1', label: 'Acceptance of Terms', order: '01' },
  { id: 'section-2', label: 'Use of Service', order: '02' },
  { id: 'section-3', label: 'Data and Privacy', order: '03' },
  { id: 'section-4', label: 'Payments and Billing', order: '04' },
  { id: 'section-5', label: 'Limitation of Liability', order: '05' },
  { id: 'section-6', label: 'Changes to Terms', order: '06' },
  { id: 'section-7', label: 'Contact', order: '07' },
]

const TERMS_SECTIONS: TermsSection[] = [
  {
    id: 'section-1',
    order: '1',
    title: 'Acceptance of Terms',
    icon: 'FileCheck',
    body: 'By using VyostraAI you agree to these terms.',
  },
  {
    id: 'section-2',
    order: '2',
    title: 'Use of Service',
    icon: 'Settings2',
    body: 'You must provide accurate information. You are responsible for your chatbot content. Do not use VyostraAI for spam or illegal activity.',
  },
  {
    id: 'section-3',
    order: '3',
    title: 'Data and Privacy',
    icon: 'ShieldCheck',
    body: 'Your data is governed by our Privacy Policy.',
  },
  {
    id: 'section-4',
    order: '4',
    title: 'Payments and Billing',
    icon: 'CreditCard',
    body: 'Subscriptions billed monthly. Cancel anytime, no refunds for partial months. Prices in INR, inclusive of applicable taxes.',
  },
  {
    id: 'section-5',
    order: '5',
    title: 'Limitation of Liability',
    icon: 'AlertTriangle',
    body: 'VyostraAI is provided as-is. We are not liable for lead loss, missed notifications, or third-party service outages.',
  },
  {
    id: 'section-6',
    order: '6',
    title: 'Changes to Terms',
    icon: 'RefreshCw',
    body: 'We may update these terms. Continued use means acceptance.',
  },
]

function renderSectionIcon(icon: TermsSection['icon']) {
  switch (icon) {
    case 'Settings2':
      return <Settings2 className="w-6 h-6 text-primary" />
    case 'ShieldCheck':
      return <ShieldCheck className="w-6 h-6 text-primary" />
    case 'CreditCard':
      return <CreditCard className="w-6 h-6 text-primary" />
    case 'AlertTriangle':
      return <AlertTriangle className="w-6 h-6 text-primary" />
    case 'RefreshCw':
      return <RefreshCw className="w-6 h-6 text-primary" />
    default:
      return <FileCheck className="w-6 h-6 text-primary" />
  }
}

function TermsHeader({ onDownload }: { onDownload: () => void }) {
  return (
    <div className="relative mb-12 py-10 bg-gradient-to-br from-surface-container-high/60 via-surface to-background border-b border-outline-variant/30 rounded-3xl overflow-hidden px-6 md:px-12">
      <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6 max-w-7xl mx-auto">
        <div>
          <div className="flex items-center gap-2.5 px-3 py-1 bg-primary/10 text-primary text-xs font-bold rounded-full w-fit mb-4">
            <Calendar className="w-3.5 h-3.5" />
            <span>Last Updated: July 2026</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-on-surface tracking-tight">Terms of Service</h1>
          <p className="mt-3 text-base text-on-surface-variant max-w-xl leading-relaxed">
            These terms govern your use of VyostraAI. By creating an account or using our chatbot, you agree to the
            terms outlined below.
          </p>
        </div>
        <button
          onClick={onDownload}
          className="print:hidden flex items-center justify-center gap-2 px-6 py-3.5 bg-white hover:bg-surface-container-low text-primary font-semibold border border-outline-variant/50 hover:border-primary/30 rounded-xl hover:shadow-xs transition-all cursor-pointer shadow-xs self-start md:self-center"
          id="download-terms-btn"
        >
          <Download className="w-4 h-4" />
          <span>Download PDF version</span>
        </button>
      </div>
    </div>
  )
}

function TocSidebar({ activeSection, onNavigate }: { activeSection: string; onNavigate: (id: string) => void }) {
  return (
    <aside className="print:hidden lg:col-span-3 lg:sticky lg:top-28">
      <div className="lg:hidden relative w-full mb-6">
        <select
          value={activeSection}
          onChange={(e) => onNavigate(e.target.value)}
          className="w-full p-4 bg-white border border-outline-variant rounded-xl text-sm font-semibold text-on-surface shadow-xs cursor-pointer"
        >
          {TOC_ITEMS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.order} {item.label}
            </option>
          ))}
        </select>
      </div>

      <div className="hidden lg:block glass-card p-6 rounded-2xl shadow-xs border border-outline-variant/30 bg-white/70">
        <h3 className="text-lg font-extrabold text-on-surface mb-6 border-b border-outline-variant/20 pb-3">Table of Contents</h3>
        <ul className="space-y-3.5">
          {TOC_ITEMS.map((item) => {
            const isActive = activeSection === item.id
            return (
              <li key={item.id}>
                <button
                  onClick={() => onNavigate(item.id)}
                  className={`group w-full flex items-center gap-3.5 text-left py-2.5 px-3 rounded-xl transition-all duration-300 cursor-pointer ${
                    isActive ? 'bg-primary text-white shadow-xs font-semibold' : 'text-on-surface-variant hover:text-primary hover:bg-primary/5'
                  }`}
                >
                  <span className={`text-xs font-bold ${isActive ? 'text-white/80' : 'text-outline group-hover:text-primary'}`}>{item.order}</span>
                  <span className="text-sm font-medium leading-tight">{item.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="hidden lg:block mt-6 p-6 bg-gradient-to-br from-primary to-primary-container text-white rounded-2xl shadow-xs">
        <p className="text-sm font-semibold opacity-90 mb-4 leading-relaxed">Have questions about these terms?</p>
        <a
          href="mailto:admin@drsyeta.in"
          className="inline-flex items-center gap-2 text-sm font-bold bg-white text-primary px-4 py-2.5 rounded-xl hover:shadow-xs hover:opacity-95 transition-all"
        >
          <Mail className="w-4 h-4" />
          <span>Contact Support</span>
        </a>
      </div>
    </aside>
  )
}

function TermsSectionBlock({ section }: { section: TermsSection }) {
  return (
    <section id={section.id} className="scroll-mt-28 border-b border-outline-variant/20 pb-12 last:border-0 last:pb-0">
      <div className="flex items-center gap-4 mb-6">
        <span className="flex w-10 h-10 rounded-xl bg-primary/10 text-primary items-center justify-center text-lg font-bold shrink-0">
          {section.order}
        </span>
        <h2 className="text-2xl md:text-3xl font-extrabold text-on-surface">{section.title}</h2>
      </div>
      <div className="p-6 md:p-8 bg-white border border-outline-variant/30 rounded-2xl shadow-xs flex gap-4 items-start">
        <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">{renderSectionIcon(section.icon)}</div>
        <p className="text-sm md:text-base text-on-surface-variant leading-relaxed">{section.body}</p>
      </div>
    </section>
  )
}

function ContactSection() {
  return (
    <section id="section-7" className="scroll-mt-28">
      <div className="flex items-center gap-4 mb-6">
        <span className="flex w-10 h-10 rounded-xl bg-primary/10 text-primary items-center justify-center text-lg font-bold shrink-0">7</span>
        <h2 className="text-2xl md:text-3xl font-extrabold text-on-surface">Contact</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="p-6 bg-white border border-outline-variant/30 rounded-2xl flex items-center gap-5 shadow-xs">
          <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center shrink-0">
            <Mail className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-xs text-outline uppercase tracking-wider">Email Inquiries</h4>
            <a href="mailto:admin@drsyeta.in" className="text-base font-bold text-on-surface hover:text-primary transition-colors">
              admin@drsyeta.in
            </a>
          </div>
        </div>
        <div className="p-6 bg-white border border-outline-variant/30 rounded-2xl flex items-center gap-5 shadow-xs">
          <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center shrink-0">
            <MapPin className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-xs text-outline uppercase tracking-wider">Company Headquarters</h4>
            <p className="text-base font-bold text-on-surface">Bangalore, Karnataka, India</p>
          </div>
        </div>
      </div>
    </section>
  )
}

function useScrollSpy() {
  const [activeSection, setActiveSection] = useState('section-1')

  useEffect(() => {
    function handleScroll() {
      const scrollPosition = window.scrollY + 200
      for (let i = TOC_ITEMS.length - 1; i >= 0; i--) {
        const el = document.getElementById(TOC_ITEMS[i].id)
        if (el && el.offsetTop <= scrollPosition) {
          setActiveSection(el.id)
          break
        }
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return { activeSection, setActiveSection }
}

export default function Terms() {
  const [isDemoOpen, setIsDemoOpen] = useState(false)
  const { activeSection, setActiveSection } = useScrollSpy()

  function handleNavigate(id: string) {
    const element = document.getElementById(id)
    if (!element) return
    const offset = 100
    const elementPosition = element.getBoundingClientRect().top + window.scrollY
    window.scrollTo({ top: elementPosition - offset, behavior: 'smooth' })
    setActiveSection(id)
  }

  function handleDownload() {
    const previousTitle = document.title
    document.title = 'VyostraAI - Terms of Service'
    window.print()
    document.title = previousTitle
  }

  return (
    <div className="landing-page bg-background">
      <Navbar onOpenDemo={() => setIsDemoOpen(true)} />

      <main className="pt-36 pb-24 px-6 lg:px-8">
        <TermsHeader onDownload={handleDownload} />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 max-w-7xl mx-auto items-start">
          <TocSidebar activeSection={activeSection} onNavigate={handleNavigate} />

          <article className="lg:col-span-9 print:col-span-12 space-y-16 max-w-3xl print:max-w-none">
            {TERMS_SECTIONS.map((section) => (
              <TermsSectionBlock key={section.id} section={section} />
            ))}
            <ContactSection />
          </article>
        </div>
      </main>

      <Footer />
      <DemoModal isOpen={isDemoOpen} onClose={() => setIsDemoOpen(false)} />
    </div>
  )
}
