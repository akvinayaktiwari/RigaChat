import { useState, type ReactNode } from 'react'
import { Helmet } from 'react-helmet-async'
import { useNavigate } from 'react-router-dom'
import { Bot, MessageSquare, Users, FileText, Mic, Route, CalendarCheck } from 'lucide-react'
import Navbar from '../components/landing/Navbar'
import Footer from '../components/landing/Footer'
import DemoModal from '../components/landing/modals/DemoModal'

interface FeatureCardData {
  icon: ReactNode
  title: string
  body: string
  // Absent for features that are live but don't have a marketing deep-dive page
  // yet. Only /features/chatbot, /whatsapp, /crm and /forms exist as routes --
  // giving a card an href that has no route would 404, so the card renders
  // static instead of guessing at a URL.
  href?: string
}

const FEATURE_CARDS: FeatureCardData[] = [
  { icon: <Bot className="w-6 h-6" />, title: 'AI Chatbot', body: '24/7 lead capture. Trained on your content. No code required.', href: '/features/chatbot' },
  {
    icon: <MessageSquare className="w-6 h-6" />,
    title: 'WhatsApp Automation',
    body: 'Instant lead alerts, weekly reports, and a two-way AI agent that answers replies.',
    href: '/features/whatsapp',
  },
  { icon: <Users className="w-6 h-6" />, title: 'Lead CRM', body: 'Every lead organized and trackable. Sync to Zoho in one click.', href: '/features/crm' },
  {
    icon: <FileText className="w-6 h-6" />,
    title: 'Form Builder',
    body: 'Beautiful forms that embed anywhere. Leads captured and notified instantly.',
    href: '/features/forms',
  },
  {
    icon: <Route className="w-6 h-6" />,
    title: 'Follow-up Journeys',
    body: 'Your agent messages a new lead, waits for their reply, nudges once if they go quiet, and hands to your team instead of following up forever.',
  },
  {
    icon: <Mic className="w-6 h-6" />,
    title: 'AI Voice Agent',
    body: 'Visitors talk to your agent on the page — no app, no phone call. Same knowledge base, same CRM.',
  },
  {
    icon: <CalendarCheck className="w-6 h-6" />,
    title: 'Appointments & Reminders',
    body: 'Bookings land in your dashboard via Cal.com, with reminders on a schedule you set.',
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
          One platform. AI chat and voice agents, WhatsApp, CRM, forms, and follow-up journeys that keep working after
          the lead is captured.
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

function FeatureCardBody({ card }: { card: FeatureCardData }) {
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center">{card.icon}</div>
        <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full">LIVE</span>
      </div>
      <h3 className="font-bold text-on-surface text-lg mb-2">{card.title}</h3>
      <p className="text-sm text-on-surface-variant leading-relaxed">{card.body}</p>
    </>
  )
}

const CARD_SHELL = 'text-left bg-white border border-outline-variant/30 rounded-2xl p-6 shadow-xs'

function FeatureCard({ card }: { card: FeatureCardData }) {
  const navigate = useNavigate()

  // No deep-dive page for this feature yet, so it renders as a plain panel --
  // no hover lift and no pointer cursor, which would promise a click that
  // goes nowhere.
  if (!card.href) {
    return (
      <div className={CARD_SHELL}>
        <FeatureCardBody card={card} />
      </div>
    )
  }

  const href = card.href
  return (
    <button
      onClick={() => navigate(href)}
      className={`${CARD_SHELL} hover:shadow-md hover:-translate-y-1 transition-all cursor-pointer`}
    >
      <FeatureCardBody card={card} />
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
        Set up your AI agent, WhatsApp, and CRM in minutes — then let a journey handle the follow-up. No credit card
        required.
      </p>
      <div className="flex flex-wrap justify-center gap-4">
        <button
          onClick={() => navigate('/signup')}
          className="bg-primary text-white px-8 py-4 rounded-xl font-bold hover:opacity-95 transition-all cursor-pointer"
        >
          Get Started Free
        </button>
        <a
          href="mailto:support@vyostra.com"
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
        <title>Features — VyostraAI Lead Generation</title>
        <meta
          name="description"
          content="AI chat and voice agents, two-way WhatsApp, follow-up journeys, Lead CRM, Form Builder, and Zoho integration. Everything you need to capture and convert leads."
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
