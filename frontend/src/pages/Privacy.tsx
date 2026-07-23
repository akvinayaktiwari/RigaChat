import { useState, useEffect } from 'react'
import {
  Calendar,
  Download,
  CheckCircle2,
  Lock,
  Key,
  Database,
  Mail,
  MapPin,
  Cloud,
  Send,
  Layers,
  Sparkles,
  Activity,
  Bell,
  RefreshCw,
  Shield,
  ChevronDown,
} from 'lucide-react'
import Navbar from '../components/landing/Navbar'
import Footer from '../components/landing/Footer'
import DemoModal from '../components/landing/modals/DemoModal'

interface TOCItem {
  id: string
  label: string
  order: string
}

interface InfoBullet {
  label?: string
  text: string
}

interface UseBlock {
  icon: 'Activity' | 'Bell' | 'RefreshCw' | 'ShieldCheck'
  label: string
  text: string
  isSpecial?: boolean
}

interface Partner {
  name: string
  role: string
  icon: 'Cloud' | 'Send' | 'Layers' | 'Sparkles'
}

const TOC_ITEMS: TOCItem[] = [
  { id: 'section-1', label: 'Information We Collect', order: '01' },
  { id: 'section-2', label: 'How We Use Information', order: '02' },
  { id: 'section-3', label: 'Data Storage', order: '03' },
  { id: 'section-4', label: 'Third Party Services', order: '04' },
  { id: 'section-5', label: 'Your Rights', order: '05' },
  { id: 'section-6', label: 'Contact', order: '06' },
]

const COLLECT_BULLETS: InfoBullet[] = [
  { label: 'Account Data', text: 'Name, email, and phone on signup.' },
  { label: 'Lead Data', text: 'Info captured through chatbots and forms during visitor interactions.' },
  { label: 'Usage Analytics', text: 'Platform navigation, feature usage, and performance metrics.' },
]

const USE_BLOCKS: UseBlock[] = [
  { icon: 'Activity', label: 'Improve Platform', text: 'To provide, maintain, and improve VyostraAI service and interface performance.' },
  { icon: 'Bell', label: 'Lead Alerts', text: 'To send lead notifications via WhatsApp and other integrated channels.' },
  { icon: 'RefreshCw', label: 'CRM Sync', text: 'To sync captured leads with connected CRMs including Zoho CRM.' },
  {
    icon: 'ShieldCheck',
    label: 'Privacy First',
    text: 'We never sell or share your personal or lead data to third parties under any circumstances.',
    isSpecial: true,
  },
]

const PARTNERS: Partner[] = [
  { name: 'AWS', role: 'Cloud Infrastructure', icon: 'Cloud' },
  { name: 'Gupshup', role: 'WhatsApp BSP Delivery', icon: 'Send' },
  { name: 'Zoho CRM', role: 'Lead Synchronization', icon: 'Layers' },
  { name: 'OpenAI', role: 'LLM & AI Intelligence', icon: 'Sparkles' },
]

const RIGHTS_BULLETS: InfoBullet[] = [
  { text: 'Access your account data and captured leads anytime via the dashboard.' },
  { text: 'Request full account or lead data deletion at any time by emailing support@vyostra.com.' },
  { text: 'Export your leads, analytics, and chats in CSV or JSON formats.' },
]

function renderBlockIcon(icon: UseBlock['icon']) {
  switch (icon) {
    case 'Activity':
      return <Activity className="w-6 h-6 text-primary" />
    case 'Bell':
      return <Bell className="w-6 h-6 text-secondary" />
    case 'RefreshCw':
      return <RefreshCw className="w-6 h-6 text-secondary" />
    default:
      return <Shield className="w-6 h-6 text-white" />
  }
}

function renderPartnerIcon(icon: Partner['icon']) {
  switch (icon) {
    case 'Cloud':
      return <Cloud className="w-6 h-6 text-blue-600" />
    case 'Send':
      return <Send className="w-6 h-6 text-green-600" />
    case 'Layers':
      return <Layers className="w-6 h-6 text-amber-600" />
    default:
      return <Sparkles className="w-6 h-6 text-purple-600" />
  }
}

function PolicyHeader({ onDownload }: { onDownload: () => void }) {
  return (
    <div className="relative mb-12 py-10 bg-gradient-to-br from-surface-container-high/60 via-surface to-background border-b border-outline-variant/30 rounded-3xl overflow-hidden px-6 md:px-12">
      <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6 max-w-7xl mx-auto">
        <div>
          <div className="flex items-center gap-2.5 px-3 py-1 bg-primary/10 text-primary text-xs font-bold rounded-full w-fit mb-4">
            <Calendar className="w-3.5 h-3.5" />
            <span>Last Updated: July 2026</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-on-surface tracking-tight">Privacy Policy</h1>
          <p className="mt-3 text-base text-on-surface-variant max-w-xl leading-relaxed">
            At VyostraAI, we value your privacy. This policy explains how we collect, protect, and use your data.
          </p>
        </div>
        <button
          onClick={onDownload}
          className="print:hidden flex items-center justify-center gap-2 px-6 py-3.5 bg-white hover:bg-surface-container-low text-primary font-semibold border border-outline-variant/50 hover:border-primary/30 rounded-xl hover:shadow-xs transition-all cursor-pointer shadow-xs self-start md:self-center"
          id="download-policy-btn"
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
        <p className="text-sm font-semibold opacity-90 mb-4 leading-relaxed">
          Have customized client privacy questions or require a custom DPA?
        </p>
        <a
          href="mailto:support@vyostra.com"
          className="inline-flex items-center gap-2 text-sm font-bold bg-white text-primary px-4 py-2.5 rounded-xl hover:shadow-xs hover:opacity-95 transition-all"
        >
          <Mail className="w-4 h-4" />
          <span>Contact Support</span>
        </a>
      </div>
    </aside>
  )
}

function SectionHeading({ order, title }: { order: string; title: string }) {
  return (
    <div className="flex items-center gap-4 mb-6">
      <span className="flex w-10 h-10 rounded-xl bg-primary/10 text-primary items-center justify-center text-lg font-bold shrink-0">
        {order}
      </span>
      <h2 className="text-2xl md:text-3xl font-extrabold text-on-surface">{title}</h2>
    </div>
  )
}

function CollectSection() {
  return (
    <section id="section-1" className="scroll-mt-28 border-b border-outline-variant/20 pb-12">
      <SectionHeading order="1" title="Information We Collect" />
      <p className="text-base text-on-surface-variant leading-relaxed mb-6">
        We gather multiple types of information to ensure the best possible chatbot experience and service performance.
      </p>
      <div className="p-6 md:p-8 bg-white border border-outline-variant/30 rounded-2xl shadow-xs space-y-6">
        {COLLECT_BULLETS.map((bullet) => (
          <div key={bullet.label} className="flex gap-4 items-start">
            <CheckCircle2 className="w-5.5 h-5.5 text-primary shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-on-surface text-base mb-1">{bullet.label}</h4>
              <p className="text-sm md:text-base text-on-surface-variant leading-relaxed">{bullet.text}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function UsageSection() {
  return (
    <section id="section-2" className="scroll-mt-28 border-b border-outline-variant/20 pb-12">
      <SectionHeading order="2" title="How We Use Your Information" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {USE_BLOCKS.map((block) => (
          <div
            key={block.label}
            className={`p-6 border rounded-2xl shadow-xs transition-all duration-300 ${
              block.isSpecial ? 'bg-secondary text-white border-secondary-container' : 'bg-white border-outline-variant/30 hover:shadow-xs'
            }`}
          >
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${block.isSpecial ? 'bg-white/20' : 'bg-primary/10'}`}>
              {renderBlockIcon(block.icon)}
            </div>
            <h4 className={`font-bold text-base mb-1.5 ${block.isSpecial ? 'text-white' : 'text-on-surface'}`}>{block.label}</h4>
            <p className={`text-sm md:text-base leading-relaxed ${block.isSpecial ? 'text-white/90' : 'text-on-surface-variant'}`}>{block.text}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function StorageSection() {
  return (
    <section id="section-3" className="scroll-mt-28 border-b border-outline-variant/20 pb-12">
      <SectionHeading order="3" title="Data Storage" />
      <div className="border border-outline-variant/30 rounded-2xl bg-white overflow-hidden shadow-xs">
        <div className="p-6 bg-surface-container-low border-b border-outline-variant/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-on-surface rounded-xl flex items-center justify-center text-white shrink-0 shadow-xs">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-on-surface text-base">AWS Cloud Infrastructure</h4>
              <p className="text-xs text-outline font-medium">Region: ap-south-1 (Mumbai, India)</p>
            </div>
          </div>
          <span className="px-3.5 py-1 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full text-xs font-bold tracking-wider uppercase w-fit">
            Fully Secure
          </span>
        </div>
        <div className="p-6 md:p-8 space-y-6">
          <div className="flex gap-4 items-start">
            <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Lock className="w-4.5 h-4.5" />
            </div>
            <div>
              <h5 className="font-bold text-on-surface text-sm md:text-base mb-1">TLS / AES-256 Encryption</h5>
              <p className="text-sm text-on-surface-variant leading-relaxed">
                All user interaction logs and captured dialogue data are encrypted instantly in transit using TLS 1.3 and stored at-rest using AES-256 protocols.
              </p>
            </div>
          </div>
          <div className="flex gap-4 items-start">
            <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Key className="w-4.5 h-4.5" />
            </div>
            <div>
              <h5 className="font-bold text-on-surface text-sm md:text-base mb-1">AWS KMS Key Envelope</h5>
              <p className="text-sm text-on-surface-variant leading-relaxed">
                Client-specific API credentials, including WhatsApp and Zoho CRM secrets, are fully encrypted with envelope keys managed by AWS KMS.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function PartnersSection() {
  return (
    <section id="section-4" className="scroll-mt-28 border-b border-outline-variant/20 pb-12">
      <SectionHeading order="4" title="Third Party Services" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {PARTNERS.map((partner) => (
          <div
            key={partner.name}
            className="p-5 bg-white border border-outline-variant/30 rounded-2xl hover:shadow-md transition-all duration-300 text-center flex flex-col items-center justify-center"
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3 bg-slate-50 border border-outline-variant/10">
              {renderPartnerIcon(partner.icon)}
            </div>
            <h5 className="font-bold text-on-surface text-sm mb-1">{partner.name}</h5>
            <p className="text-xs text-outline font-medium">{partner.role}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function RightsSection() {
  return (
    <section id="section-5" className="scroll-mt-28 border-b border-outline-variant/20 pb-12">
      <SectionHeading order="5" title="Your Rights" />
      <div className="p-6 md:p-8 bg-white border border-outline-variant/30 rounded-2xl shadow-xs space-y-6">
        {RIGHTS_BULLETS.map((bullet) => (
          <div key={bullet.text} className="flex gap-4 items-start">
            <CheckCircle2 className="w-5.5 h-5.5 text-primary shrink-0 mt-0.5" />
            <p className="text-sm md:text-base text-on-surface-variant leading-relaxed">{bullet.text}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function ContactSection() {
  return (
    <section id="section-6" className="scroll-mt-28">
      <SectionHeading order="6" title="Contact Us" />
      <p className="text-base text-on-surface-variant leading-relaxed mb-6">
        If you have questions regarding your data or our policies, feel free to contact us.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="p-6 bg-white border border-outline-variant/30 rounded-2xl flex items-center gap-5 shadow-xs">
          <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center shrink-0">
            <Mail className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-xs text-outline uppercase tracking-wider">Email Inquiries</h4>
            <a href="mailto:support@vyostra.com" className="text-base font-bold text-on-surface hover:text-primary transition-colors">
              support@vyostra.com
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

export default function Privacy() {
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
    document.title = 'VyostraAI - Privacy Policy'
    window.print()
    document.title = previousTitle
  }

  return (
    <div className="landing-page bg-background">
      <Navbar onOpenDemo={() => setIsDemoOpen(true)} />

      <main className="pt-36 pb-24 px-6 lg:px-8">
        <PolicyHeader onDownload={handleDownload} />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 max-w-7xl mx-auto items-start">
          <TocSidebar activeSection={activeSection} onNavigate={handleNavigate} />

          <article className="lg:col-span-9 print:col-span-12 space-y-16 max-w-3xl print:max-w-none">
            <CollectSection />
            <UsageSection />
            <StorageSection />
            <PartnersSection />
            <RightsSection />
            <ContactSection />
          </article>
        </div>
      </main>

      <Footer />
      <DemoModal isOpen={isDemoOpen} onClose={() => setIsDemoOpen(false)} />
    </div>
  )
}
