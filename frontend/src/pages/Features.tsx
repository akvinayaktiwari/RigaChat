import { useState, type ReactNode } from 'react'
import { Helmet } from 'react-helmet-async'
import { useNavigate } from 'react-router-dom'
import { Bot, MessageSquare, Users, FileText } from 'lucide-react'
import Navbar from '../components/landing/Navbar'
import Footer from '../components/landing/Footer'
import DemoModal from '../components/landing/modals/DemoModal'

interface FeatureCardData {
  icon: ReactNode
  title: string
  body: string
  href: string
}

const FEATURE_CARDS: FeatureCardData[] = [
  { icon: <Bot className="w-6 h-6" />, title: 'AI Chatbot', body: '24/7 lead capture. Trained on your content. No code required.', href: '/features/chatbot' },
  {
    icon: <MessageSquare className="w-6 h-6" />,
    title: 'WhatsApp Automation',
    body: 'Instant lead alerts and weekly reports on your WhatsApp.',
    href: '/features/whatsapp',
  },
  { icon: <Users className="w-6 h-6" />, title: 'Lead CRM', body: 'Every lead organized and trackable. Sync to Zoho in one click.', href: '/features/crm' },
  {
    icon: <FileText className="w-6 h-6" />,
    title: 'Form Builder',
    body: 'Beautiful forms that embed anywhere. Leads captured and notified instantly.',
    href: '/features/forms',
  },
]

const COMING_SOON: { title: string; body: string }[] = [
  { title: 'HubSpot Integration', body: 'Sync leads to HubSpot CRM automatically.' },
  { title: 'Salesforce Integration', body: 'Push captured leads directly into Salesforce.' },
]

function FeaturesHero() {
  const navigate = useNavigate()
  return (
    <section className="relative py-16 md:py-24 bg-gradient-to-br from-surface-container-high/60 via-surface to-background border-b border-outline-variant/30 rounded-3xl mb-16 overflow-hidden px-6 md:px-12 text-center">
      <div className="relative z-10 max-w-3xl mx-auto">
        <span className="inline-flex items-center bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-4">
          ALL FEATURES
        </span>
        <h1 className="text-4xl md:text-5xl font-extrabold text-on-surface tracking-tight leading-tight">
          Everything you need to never miss a lead
        </h1>
        <p className="mt-4 text-base md:text-lg text-on-surface-variant leading-relaxed max-w-2xl mx-auto">
          One platform. AI chatbot, WhatsApp alerts, CRM, forms, and integrations. Built for businesses that take leads seriously.
        </p>
        <button
          onClick={() => navigate('/signup')}
          className="mt-8 bg-primary text-white font-bold text-base px-8 py-4 rounded-2xl hover:scale-[1.02] transition-all cursor-pointer"
          id="features-hero-cta"
        >
          Get Started Free
        </button>
      </div>
    </section>
  )
}

function FeatureCard({ card }: { card: FeatureCardData }) {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate(card.href)}
      className="text-left bg-white border border-outline-variant/30 rounded-2xl p-6 shadow-xs hover:shadow-md hover:-translate-y-1 transition-all cursor-pointer"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center">{card.icon}</div>
        <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full">LIVE</span>
      </div>
      <h3 className="font-bold text-on-surface text-lg mb-2">{card.title}</h3>
      <p className="text-sm text-on-surface-variant leading-relaxed">{card.body}</p>
    </button>
  )
}

function ComingSoonSection() {
  return (
    <section className="max-w-7xl mx-auto mb-20">
      <h2 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4">Coming Soon</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 opacity-60">
        {COMING_SOON.map((item) => (
          <div key={item.title} className="bg-white border border-outline-variant/30 rounded-2xl p-6 shadow-xs">
            <span className="bg-orange-50 text-orange-600 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full">
              COMING SOON
            </span>
            <h3 className="font-bold text-on-surface text-lg mt-3 mb-2">{item.title}</h3>
            <p className="text-sm text-on-surface-variant leading-relaxed">{item.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function FeaturesCta() {
  const navigate = useNavigate()
  return (
    <section className="max-w-7xl mx-auto bg-on-surface rounded-3xl p-12 text-center text-white">
      <h2 className="text-2xl md:text-3xl font-extrabold mb-4">Ready to never miss a lead again?</h2>
      <p className="text-white/80 max-w-xl mx-auto mb-8 leading-relaxed">
        Set up your AI chatbot, WhatsApp alerts, and CRM in minutes. No credit card required.
      </p>
      <div className="flex flex-wrap justify-center gap-4">
        <button
          onClick={() => navigate('/signup')}
          className="bg-primary text-white px-8 py-4 rounded-xl font-bold hover:opacity-95 transition-all cursor-pointer"
        >
          Get Started Free
        </button>
        <a
          href="mailto:admin@drsyeta.in"
          className="bg-white/10 hover:bg-white/20 text-white border border-white/20 px-8 py-4 rounded-xl font-bold transition-all"
        >
          Book a Demo
        </a>
      </div>
    </section>
  )
}

export default function Features() {
  const [isDemoOpen, setIsDemoOpen] = useState(false)

  return (
    <div className="landing-page bg-background">
      <Helmet>
        <title>Features — BeepBoop AI Lead Generation</title>
        <meta
          name="description"
          content="AI Chatbot, WhatsApp notifications, Lead CRM, Form Builder, and Zoho integration. Everything you need to capture and convert leads."
        />
      </Helmet>
      <Navbar onOpenDemo={() => setIsDemoOpen(true)} />

      <main className="pt-36 pb-24 px-6 lg:px-8">
        <FeaturesHero />
        <section className="max-w-7xl mx-auto mb-20 grid grid-cols-1 md:grid-cols-2 gap-6">
          {FEATURE_CARDS.map((card) => (
            <FeatureCard key={card.title} card={card} />
          ))}
        </section>
        <ComingSoonSection />
        <FeaturesCta />
      </main>

      <Footer />
      <DemoModal isOpen={isDemoOpen} onClose={() => setIsDemoOpen(false)} />
    </div>
  )
}
