import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Rocket, Link as LinkIcon, CheckCircle2, MessageCircle, TrendingUp, Zap, Globe, Compass } from 'lucide-react'
import Navbar from '../components/landing/Navbar'
import Footer from '../components/landing/Footer'
import PageMeta from '../components/seo/PageMeta'
import StructuredData from '../components/seo/StructuredData'
import { aboutPageNodes, jsonLdGraph, organizationSchema } from '../lib/structured-data'
import DemoModal from '../components/landing/modals/DemoModal'

interface StatItem {
  value: string
  label: string
  icon: 'Zap' | 'CheckCircle2' | 'TrendingUp' | 'MessageCircle'
}

interface FounderInfo {
  name: string
  role: string
  description: string
  avatarGradient: string
  linkedinUrl: string
}

const STATS: StatItem[] = [
  { value: '24/7', label: 'AI Agent Uptime', icon: 'Zap' },
  { value: '4s', label: 'Average Lead Alert Time', icon: 'CheckCircle2' },
  { value: '2', label: 'Live Integrations', icon: 'TrendingUp' },
  { value: '100%', label: 'Data Encrypted at Rest', icon: 'MessageCircle' },
]

const FOUNDERS: FounderInfo[] = [
  {
    name: 'Adarsh Jee Pandey',
    role: 'Co-Founder & Performance Marketer',
    description:
      'Drives growth and customer acquisition for Vyostra AI. Performance marketer at Vyostra AI, Bangalore.',
    avatarGradient: 'from-emerald-600 to-teal-500',
    linkedinUrl: 'https://www.linkedin.com/in/adarshjeepandey',
  },
  {
    name: 'V. Sai Kavshik',
    role: 'Head of Sales',
    description:
      'Runs the client side of every launch at Vyostra AI. Has managed ₹10L+ a month in ad spend for developers.',
    avatarGradient: 'from-orange-500 to-amber-400',
    linkedinUrl: 'https://www.linkedin.com/in/v-s-kavshik',
  },
  {
    name: 'Vinayak Tiwari',
    role: 'Co-Founder & Builder',
    description:
      'Built Vyostra AI to help businesses capture every lead automatically. Full-stack engineer at Vyostra AI, Bangalore.',
    avatarGradient: 'from-purple-600 to-indigo-500',
    linkedinUrl: 'https://www.linkedin.com/in/vinayaktiwari-ai',
  },
]

function renderStatIcon(icon: StatItem['icon']) {
  switch (icon) {
    case 'CheckCircle2':
      return <CheckCircle2 className="w-6 h-6 text-emerald-600" />
    case 'MessageCircle':
      return <MessageCircle className="w-6 h-6 text-blue-600" />
    case 'TrendingUp':
      return <TrendingUp className="w-6 h-6 text-purple-600" />
    default:
      return <Zap className="w-6 h-6 text-amber-600" />
  }
}

function HeroBanner() {
  return (
    <section className="relative py-16 md:py-24 bg-gradient-to-br from-surface-container-high/60 via-surface to-background border-b border-outline-variant/30 rounded-3xl mb-16 overflow-hidden px-6 md:px-12 text-center">
      <div className="absolute inset-0 pointer-events-none opacity-30">
        <div className="absolute top-0 left-10 w-80 h-80 bg-primary/10 rounded-full blur-[110px]" />
        <div className="absolute bottom-0 right-10 w-80 h-80 bg-secondary/10 rounded-full blur-[110px]" />
      </div>
      <div className="relative z-10 max-w-4xl mx-auto">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Compass className="w-5 h-5 text-primary" />
          <span className="text-xs font-bold uppercase tracking-widest text-primary">Discover Our Journey</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold text-on-surface tracking-tight leading-tight">
          Built to help modern businesses <br className="hidden md:inline" />
          <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            never miss a single lead
          </span>
        </h1>
        <p className="mt-4 text-base md:text-lg text-on-surface-variant max-w-2xl mx-auto leading-relaxed">
          Vyostra AI is an AI-powered lead generation platform built by Vyostra AI, Bangalore. We bridge the gap
          between initial customer contact and closed deals.
        </p>
      </div>
    </section>
  )
}

function StoryBlockOneText() {
  return (
    <div className="lg:col-span-6 flex flex-col gap-6">
      <h2 className="text-3xl md:text-4xl font-extrabold text-on-surface tracking-tight leading-tight">
        Every business deserves to capture every lead.
      </h2>
      <p className="text-base md:text-lg text-on-surface-variant leading-relaxed">
        We built Vyostra AI because we saw too many businesses losing leads to slow response times, missed form
        submissions, and disconnected tools. Vyostra AI fixes that with an AI agent, WhatsApp automation, and CRM
        sync — all in one platform.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
        <div className="p-5 bg-white border border-outline-variant/30 rounded-2xl flex gap-4 items-start shadow-xs">
          <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center shrink-0">
            <Rocket className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-on-surface text-sm mb-1">Always On</h3>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              AI agent captures leads 24/7, even on holidays.
            </p>
          </div>
        </div>
        <div className="p-5 bg-white border border-outline-variant/30 rounded-2xl flex gap-4 items-start shadow-xs">
          <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center shrink-0">
            <LinkIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-on-surface text-sm mb-1">Seamless Integration</h3>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Connect Zoho CRM and WhatsApp in minutes.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function StoryBlockOneVisual() {
  return (
    <div className="lg:col-span-6">
      <div className="bg-gradient-to-br from-primary/10 to-secondary/10 rounded-2xl border border-outline-variant p-8 flex flex-col gap-4 items-start justify-center min-h-[280px]">
        <span className="text-xs font-bold uppercase tracking-widest text-primary mb-2">Live Dashboard Snapshot</span>
        <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
          247 Leads Captured
        </span>
        <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-primary/15 text-primary border border-primary/20">
          3 Active Bots
        </span>
        <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-green-100 text-green-700 border border-green-200">
          WhatsApp Connected
        </span>
      </div>
    </div>
  )
}

function StoryBlockTwo() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center pt-8">
      <div className="lg:col-span-6 order-last lg:order-first">
        <div className="relative h-80 rounded-3xl overflow-hidden border border-outline-variant/30 bg-gradient-to-br from-indigo-900 via-slate-900 to-primary p-8 text-white flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs bg-white/10 border border-white/10 px-3 py-1 rounded-full font-bold uppercase tracking-widest">
              Vyostra AI
            </span>
            <Globe className="w-5 h-5 text-white/50" />
          </div>
          <div className="max-w-md">
            <p className="text-2xl font-black tracking-tight leading-snug">
              "Integrating AI with WhatsApp to make sure no lead ever goes unanswered."
            </p>
            <p className="text-xs text-white/70 mt-2 font-medium tracking-wide">
              Vyostra AI Headquarters, Bangalore, India
            </p>
          </div>
        </div>
      </div>
      <div className="lg:col-span-6 flex flex-col gap-6">
        <div className="text-xs font-extrabold uppercase tracking-widest text-secondary bg-secondary/10 px-3 py-1.5 rounded-full w-fit">
          Vyostra AI
        </div>
        <h2 className="text-3xl md:text-4xl font-extrabold text-on-surface tracking-tight leading-tight">
          Built in Bangalore. Designed for growth.
        </h2>
        <p className="text-base md:text-lg text-on-surface-variant leading-relaxed">
          Vyostra AI is a performance marketing and technology company based in Bangalore, India. We build tools
          that help businesses grow faster using AI, automation, and data.
        </p>
      </div>
    </div>
  )
}

function StatsSection() {
  return (
    <section className="bg-surface-container rounded-[2rem] p-8 md:p-12 mb-20 max-w-7xl mx-auto border border-outline-variant/35 shadow-xs">
      <div className="text-center mb-10 max-w-2xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-extrabold text-on-surface">Numbers that Define Us</h2>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
        {STATS.map((stat) => (
          <div
            key={stat.label}
            className="p-6 bg-white border border-outline-variant/20 rounded-2xl shadow-xs hover:shadow-md transition-shadow flex flex-col gap-4 text-center items-center"
          >
            <div className="w-11 h-11 bg-primary/10 rounded-xl flex items-center justify-center">
              {renderStatIcon(stat.icon)}
            </div>
            <div>
              <span className="block text-3xl md:text-4xl font-black text-on-surface tracking-tight">
                {stat.value}
              </span>
              <span className="block text-xs font-semibold text-on-surface-variant tracking-wider uppercase mt-1 max-w-[160px] mx-auto">
                {stat.label}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
    </svg>
  )
}

function FounderCard({ founder }: { founder: FounderInfo }) {
  return (
    <div className="bg-white border border-outline-variant/30 rounded-2xl p-6 shadow-xs hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col items-center text-center">
      <div
        className={`w-28 h-28 rounded-full bg-gradient-to-tr ${founder.avatarGradient} flex items-center justify-center text-white text-3xl font-black shadow-inner uppercase mb-5 ring-4 ring-white`}
      >
        {founder.name.split(' ').map((n) => n[0]).join('')}
      </div>
      <div className="relative inline-flex items-center">
        <h3 className="font-bold text-base text-on-surface leading-tight">{founder.name}</h3>
        <a
          href={founder.linkedinUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${founder.name} on LinkedIn`}
          className="absolute left-full top-1/2 -translate-y-1/2 p-3 rounded-full text-on-surface-variant hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition-colors"
        >
          <LinkedInIcon />
        </a>
      </div>
      <p className="text-xs text-primary font-semibold tracking-wider uppercase mt-1.5">{founder.role}</p>
      <p className="text-xs md:text-sm text-on-surface-variant mt-3 leading-relaxed flex-1">{founder.description}</p>
    </div>
  )
}

function TeamSection() {
  return (
    <section className="mb-16 max-w-7xl mx-auto">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <span className="text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-3 py-1.5 rounded-full">
          The Builders Behind The AI
        </span>
        <h2 className="text-3xl md:text-4xl font-extrabold text-on-surface mt-4 tracking-tight">Meet the Team</h2>
      </div>
      <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-6">
        {FOUNDERS.map((founder) => (
          <FounderCard key={founder.name} founder={founder} />
        ))}
      </div>
    </section>
  )
}

export default function About() {
  const navigate = useNavigate()
  const [isDemoOpen, setIsDemoOpen] = useState(false)

  return (
    <div className="landing-page bg-background">
      <PageMeta
        title="About Vyostra AI — AI Lead Generation, Built in Bangalore"
        description="Vyostra AI is a Bangalore-built platform that captures every lead with AI chat and voice agents, WhatsApp follow-up and a built-in CRM. Meet the founders."
        path="/about-us/"
      />
      <StructuredData data={jsonLdGraph([organizationSchema(), ...aboutPageNodes({ name: 'About Vyostra AI', path: '/about-us/' })])} />
      <Navbar onOpenDemo={() => setIsDemoOpen(true)} />

      <main className="pt-36 pb-24 px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <HeroBanner />

          <section className="space-y-20 mb-20">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
              <StoryBlockOneText />
              <StoryBlockOneVisual />
            </div>
            <StoryBlockTwo />
          </section>

          <StatsSection />
          <TeamSection />

          <div className="text-center">
            <h2 className="text-2xl md:text-3xl font-extrabold text-on-background tracking-tight mb-6">
              Start capturing leads today
            </h2>
            <button
              onClick={() => navigate('/signup')}
              className="bg-primary text-white px-8 py-4 rounded-2xl font-bold hover:scale-[1.02] transition-all cursor-pointer"
            >
              Get Started Free
            </button>
          </div>
        </div>
      </main>

      <Footer />
      <DemoModal isOpen={isDemoOpen} onClose={() => setIsDemoOpen(false)} />
    </div>
  )
}
