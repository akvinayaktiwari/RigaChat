import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Rocket, Link as LinkIcon, CheckCircle2, MessageCircle, TrendingUp, Zap, Globe, Compass } from 'lucide-react'
import Navbar from '../components/landing/Navbar'
import Footer from '../components/landing/Footer'
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
}

const STATS: StatItem[] = [
  { value: '24/7', label: 'AI Chatbot Uptime', icon: 'Zap' },
  { value: '4s', label: 'Average Lead Alert Time', icon: 'CheckCircle2' },
  { value: '2', label: 'Live Integrations', icon: 'TrendingUp' },
  { value: '100%', label: 'Data Encrypted at Rest', icon: 'MessageCircle' },
]

const FOUNDERS: FounderInfo[] = [
  {
    name: 'Adarsh Jee Pandey',
    role: 'Co-Founder & Performance Marketer',
    description:
      'Drives growth and customer acquisition for BeepBoop. Performance marketer at Drsyeta Corp, Bangalore.',
    avatarGradient: 'from-emerald-600 to-teal-500',
  },
  {
    name: 'Vinayak Tiwari',
    role: 'Co-Founder & Builder',
    description:
      'Built BeepBoop to help businesses capture every lead automatically. Full-stack engineer at Drsyeta Corp, Bangalore.',
    avatarGradient: 'from-purple-600 to-indigo-500',
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
          BeepBoop is an AI-powered lead generation platform built by Drsyeta Corp, Bangalore. We bridge the gap
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
        We built BeepBoop because we saw too many businesses losing leads to slow response times, missed form
        submissions, and disconnected tools. BeepBoop fixes that with an AI chatbot, WhatsApp automation, and CRM
        sync — all in one platform.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
        <div className="p-5 bg-white border border-outline-variant/30 rounded-2xl flex gap-4 items-start shadow-xs">
          <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center shrink-0">
            <Rocket className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-on-surface text-sm mb-1">Always On</h4>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              AI chatbot captures leads 24/7, even on holidays.
            </p>
          </div>
        </div>
        <div className="p-5 bg-white border border-outline-variant/30 rounded-2xl flex gap-4 items-start shadow-xs">
          <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center shrink-0">
            <LinkIcon className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-on-surface text-sm mb-1">Seamless Integration</h4>
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
              Drsyeta Corp
            </span>
            <Globe className="w-5 h-5 text-white/50" />
          </div>
          <div className="max-w-md">
            <p className="text-2xl font-black tracking-tight leading-snug">
              "Integrating AI with WhatsApp to make sure no lead ever goes unanswered."
            </p>
            <p className="text-xs text-white/70 mt-2 font-medium tracking-wide">
              Drsyeta Corp Headquarters, Bangalore, India
            </p>
          </div>
        </div>
      </div>
      <div className="lg:col-span-6 flex flex-col gap-6">
        <div className="text-xs font-extrabold uppercase tracking-widest text-secondary bg-secondary/10 px-3 py-1.5 rounded-full w-fit">
          Drsyeta Corp
        </div>
        <h2 className="text-3xl md:text-4xl font-extrabold text-on-surface tracking-tight leading-tight">
          Built in Bangalore. Designed for growth.
        </h2>
        <p className="text-base md:text-lg text-on-surface-variant leading-relaxed">
          Drsyeta Corp is a performance marketing and technology company based in Bangalore, India. We build tools
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
              <span className="block text-xs font-semibold text-outline tracking-wider uppercase mt-1 max-w-[160px] mx-auto">
                {stat.label}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function FounderCard({ founder }: { founder: FounderInfo }) {
  return (
    <div className="bg-white border border-outline-variant/30 rounded-2xl p-6 shadow-xs hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col items-center text-center">
      <div
        className={`w-28 h-28 rounded-full bg-gradient-to-tr ${founder.avatarGradient} flex items-center justify-center text-white text-3xl font-black shadow-inner uppercase mb-5`}
      >
        {founder.name.split(' ').map((n) => n[0]).join('')}
      </div>
      <h4 className="font-bold text-base text-on-surface leading-tight">{founder.name}</h4>
      <p className="text-xs text-outline font-semibold tracking-wider uppercase mt-1">{founder.role}</p>
      <p className="text-xs md:text-sm text-on-surface-variant mt-3 leading-relaxed">{founder.description}</p>
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
        <h2 className="text-3xl md:text-4xl font-extrabold text-on-surface mt-4 tracking-tight">Meet the Founders</h2>
      </div>
      <div className="max-w-2xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-6">
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
