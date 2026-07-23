import { useState, type ReactNode } from 'react'
import { Helmet } from 'react-helmet-async'
import { Globe, Zap, Heart, Laptop, Calendar, BookOpen, TrendingUp, Shield, Coffee, MessageSquare, Star, Code2, Megaphone, Mail } from 'lucide-react'
import Navbar from '../components/landing/Navbar'
import Footer from '../components/landing/Footer'
import DemoModal from '../components/landing/modals/DemoModal'

interface CultureCard {
  icon: ReactNode
  title: string
  body: string
}

interface BenefitCard {
  icon: ReactNode
  title: string
  body: string
}

interface RoleCard {
  icon: ReactNode
  title: string
  tags: string[]
}

const CULTURE_CARDS: CultureCard[] = [
  {
    icon: <Globe className="w-6 h-6" />,
    title: '100% Remote',
    body: 'Work from anywhere in India. We are async-first, results-driven, and trust our team to own their work completely. No daily standups. No micromanagement.',
  },
  {
    icon: <Zap className="w-6 h-6" />,
    title: 'Move Fast',
    body: 'We ship weekly. Every team member directly impacts the product. If you have an idea, you can build it. We value speed and execution over endless planning.',
  },
  {
    icon: <Heart className="w-6 h-6" />,
    title: 'Care About Craft',
    body: 'We take pride in what we build. Clean code, thoughtful UX, and honest communication matter here. We build products we would use ourselves.',
  },
]

const BENEFIT_CARDS: BenefitCard[] = [
  { icon: <Laptop className="w-5 h-5" />, title: 'Remote First', body: 'Work from home, a cafe, or anywhere with good internet.' },
  { icon: <Calendar className="w-5 h-5" />, title: 'Flexible Hours', body: 'Own your schedule. We care about output, not hours.' },
  { icon: <BookOpen className="w-5 h-5" />, title: 'Learning Budget', body: 'Annual budget for courses, books, and conferences.' },
  { icon: <TrendingUp className="w-5 h-5" />, title: 'Equity Potential', body: 'Early team members get equity as BeepBoop grows.' },
  { icon: <Shield className="w-5 h-5" />, title: 'Health Coverage', body: 'Health insurance for you and your family.' },
  { icon: <Coffee className="w-5 h-5" />, title: 'Home Office Setup', body: 'One-time stipend to set up your remote workspace.' },
  { icon: <MessageSquare className="w-5 h-5" />, title: 'Async Communication', body: 'No unnecessary meetings. We communicate via docs and chat.' },
  { icon: <Star className="w-5 h-5" />, title: 'Recognition', body: 'Your work ships to real users. No invisible backlog tasks here.' },
]

const ROLE_CARDS: RoleCard[] = [
  { icon: <Code2 className="w-5 h-5" />, title: 'Full Stack Engineer', tags: ['Remote', 'Intern', 'TypeScript', 'Node.js', 'React'] },
  {
    icon: <Megaphone className="w-5 h-5" />,
    title: 'Performance Marketing Manager',
    tags: ['Remote', 'Intern', 'Meta Ads', 'Google Ads', 'Real Estate'],
  },
  { icon: <MessageSquare className="w-5 h-5" />, title: 'Customer Success Manager', tags: ['Remote', 'Intern', 'SaaS', 'Onboarding', 'WhatsApp'] },
]

function CareersHero() {
  return (
    <section className="relative py-16 md:py-24 bg-gradient-to-br from-surface-container-high/60 via-surface to-background border-b border-outline-variant/30 rounded-3xl mb-16 overflow-hidden px-6 md:px-12 text-center">
      <div className="relative z-10 max-w-3xl mx-auto">
        <span className="inline-flex items-center bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-4">
          WE ARE HIRING
        </span>
        <h1 className="text-4xl md:text-5xl font-extrabold text-on-surface tracking-tight leading-tight">
          Build the future of lead generation — remotely
        </h1>
        <p className="mt-4 text-base md:text-lg text-on-surface-variant leading-relaxed max-w-2xl mx-auto">
          BeepBoop is a fully remote team building AI products that help businesses capture and convert leads. We move fast, build lean, and care about craft.
        </p>
        <a
          href="mailto:support@vyostra.com"
          className="inline-flex items-center gap-2 mt-8 bg-primary text-white font-bold text-base px-8 py-4 rounded-2xl hover:scale-[1.02] transition-all"
          id="careers-hero-cta"
        >
          <Mail className="w-4.5 h-4.5" />
          Send Your Resume to support@vyostra.com
        </a>
      </div>
    </section>
  )
}

function WorkCultureSection() {
  return (
    <section className="max-w-7xl mx-auto mb-20">
      <h2 className="text-3xl font-extrabold text-on-surface mb-2 text-center">How we work</h2>
      <p className="text-on-surface-variant text-center mb-12">Small team. Big ambitions. No bureaucracy.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {CULTURE_CARDS.map((card) => (
          <div key={card.title} className="bg-white border border-outline-variant/30 rounded-2xl p-6 shadow-xs hover:shadow-md transition-all">
            <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center mb-4">{card.icon}</div>
            <h3 className="font-bold text-on-surface text-base mb-2">{card.title}</h3>
            <p className="text-sm text-on-surface-variant leading-relaxed">{card.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function BenefitsSection() {
  return (
    <section className="max-w-7xl mx-auto mb-20">
      <h2 className="text-3xl font-extrabold text-on-surface mb-8 text-center">Benefits</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {BENEFIT_CARDS.map((card) => (
          <div key={card.title} className="bg-white border border-outline-variant/30 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all">
            <div className="w-9 h-9 bg-primary/10 text-primary rounded-xl flex items-center justify-center mb-3">{card.icon}</div>
            <h3 className="font-bold text-on-surface text-sm mb-1.5">{card.title}</h3>
            <p className="text-xs text-on-surface-variant leading-relaxed">{card.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function RoleTag({ tag }: { tag: string }) {
  return <span className="bg-surface-container-low text-on-surface-variant text-xs rounded-full px-3 py-1">{tag}</span>
}

function RoleCardItem({ role }: { role: RoleCard }) {
  return (
    <div className="bg-white border border-outline-variant/30 rounded-2xl p-6 shadow-xs hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center shrink-0">{role.icon}</div>
        <div>
          <h3 className="font-bold text-on-surface text-base mb-1.5">{role.title}</h3>
          <div className="flex flex-wrap gap-2">
            {role.tags.map((tag) => (
              <RoleTag key={tag} tag={tag} />
            ))}
          </div>
        </div>
      </div>
      <a
        href="mailto:support@vyostra.com"
        className="shrink-0 bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-bold text-center hover:opacity-95 transition-all"
      >
        Apply Now
      </a>
    </div>
  )
}

function OpenRolesSection() {
  return (
    <section className="max-w-7xl mx-auto mb-20">
      <h2 className="text-3xl font-extrabold text-on-surface mb-2 text-center">Open Positions</h2>
      <p className="text-on-surface-variant text-center mb-12">We hire for attitude and craft over credentials.</p>
      <div className="flex flex-col gap-4 max-w-3xl mx-auto">
        {ROLE_CARDS.map((role) => (
          <RoleCardItem key={role.title} role={role} />
        ))}
      </div>
    </section>
  )
}

function GeneralApplicationCta() {
  return (
    <section className="max-w-7xl mx-auto bg-on-surface rounded-3xl p-10 text-center text-white">
      <h2 className="text-2xl md:text-3xl font-extrabold mb-4">Don't see a role that fits?</h2>
      <p className="text-white/80 max-w-xl mx-auto mb-8 leading-relaxed">
        We always want to hear from talented people. Send us your resume and tell us how you would contribute to BeepBoop.
      </p>
      <a
        href="mailto:support@vyostra.com?subject=Resume — BeepBoop Application"
        className="inline-flex items-center gap-2 bg-primary text-white px-8 py-4 rounded-xl font-bold hover:opacity-95 transition-all"
      >
        <Mail className="w-4.5 h-4.5" />
        Send Resume to support@vyostra.com
      </a>
    </section>
  )
}

export default function Careers() {
  const [isDemoOpen, setIsDemoOpen] = useState(false)

  return (
    <div className="landing-page bg-background">
      <Helmet>
        <title>Careers at BeepBoop — Work Remotely</title>
        <meta
          name="description"
          content="Join BeepBoop. Fully remote. Build AI products that help businesses grow. Send your resume to support@vyostra.com"
        />
      </Helmet>
      <Navbar onOpenDemo={() => setIsDemoOpen(true)} />

      <main className="pt-36 pb-24 px-6 lg:px-8">
        <CareersHero />
        <WorkCultureSection />
        <BenefitsSection />
        <OpenRolesSection />
        <GeneralApplicationCta />
      </main>

      <Footer />
      <DemoModal isOpen={isDemoOpen} onClose={() => setIsDemoOpen(false)} />
    </div>
  )
}
