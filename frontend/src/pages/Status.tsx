import { useState } from 'react'
import { Activity, Server, LayoutDashboard, MessageSquare, MessageCircle, Layers, Database, CheckCircle2, Clock, Mail } from 'lucide-react'
import Navbar from '../components/landing/Navbar'
import Footer from '../components/landing/Footer'
import DemoModal from '../components/landing/modals/DemoModal'

interface ServiceStatus {
  name: string
  icon: 'Server' | 'LayoutDashboard' | 'MessageSquare' | 'MessageCircle' | 'Layers' | 'Database'
}

const SERVICES: ServiceStatus[] = [
  { name: 'API Server', icon: 'Server' },
  { name: 'Dashboard', icon: 'LayoutDashboard' },
  { name: 'Chat Widget', icon: 'MessageSquare' },
  { name: 'WhatsApp Notifications', icon: 'MessageCircle' },
  { name: 'Zoho Integration', icon: 'Layers' },
  { name: 'Database', icon: 'Database' },
]

function renderServiceIcon(icon: ServiceStatus['icon']) {
  switch (icon) {
    case 'LayoutDashboard':
      return <LayoutDashboard className="w-5 h-5" />
    case 'MessageSquare':
      return <MessageSquare className="w-5 h-5" />
    case 'MessageCircle':
      return <MessageCircle className="w-5 h-5" />
    case 'Layers':
      return <Layers className="w-5 h-5" />
    case 'Database':
      return <Database className="w-5 h-5" />
    default:
      return <Server className="w-5 h-5" />
  }
}

function StatusHero() {
  return (
    <section className="relative py-16 md:py-20 bg-gradient-to-br from-surface-container-high/60 via-surface to-background border-b border-outline-variant/30 rounded-3xl mb-12 overflow-hidden px-6 md:px-12 text-center">
      <div className="relative z-10 max-w-3xl mx-auto">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-primary" />
          <span className="text-xs font-bold uppercase tracking-widest text-primary">Live Platform Status</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold text-on-surface tracking-tight leading-tight">System Status</h1>
        <p className="mt-4 text-base md:text-lg text-on-surface-variant max-w-2xl mx-auto leading-relaxed">
          Real-time status for BeepBoop's chatbot, dashboard, and integrations.
        </p>
      </div>
    </section>
  )
}

function OverallStatusBanner() {
  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 flex items-center gap-4 mb-8 shadow-xs">
      <span className="relative flex w-3 h-3 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full w-3 h-3 bg-emerald-500" />
      </span>
      <div>
        <p className="text-emerald-800 font-extrabold text-base">All Systems Operational</p>
        <p className="text-emerald-700 text-xs mt-0.5">Every BeepBoop service is running normally.</p>
      </div>
    </div>
  )
}

function ServiceRow({ service }: { service: ServiceStatus }) {
  return (
    <div className="flex items-center justify-between px-6 py-4">
      <div className="flex items-center gap-3.5">
        <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          {renderServiceIcon(service.icon)}
        </div>
        <span className="text-sm font-bold text-on-surface">{service.name}</span>
      </div>
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-md uppercase tracking-wide">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Operational
      </span>
    </div>
  )
}

function ServicesList() {
  return (
    <section className="bg-white rounded-2xl border border-outline-variant/30 divide-y divide-outline-variant/20 shadow-xs mb-6">
      {SERVICES.map((service) => (
        <ServiceRow key={service.name} service={service} />
      ))}
    </section>
  )
}

function SupportCard() {
  return (
    <div className="p-6 bg-white border border-outline-variant/30 rounded-2xl flex items-center gap-5 shadow-xs">
      <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center shrink-0">
        <Mail className="w-6 h-6" />
      </div>
      <div>
        <h4 className="font-bold text-xs text-outline uppercase tracking-wider">Incident Reports</h4>
        <a href="mailto:admin@drsyeta.in" className="text-base font-bold text-on-surface hover:text-primary transition-colors">
          admin@drsyeta.in
        </a>
      </div>
    </div>
  )
}

export default function Status() {
  const [isDemoOpen, setIsDemoOpen] = useState(false)

  return (
    <div className="landing-page bg-background">
      <Navbar onOpenDemo={() => setIsDemoOpen(true)} />

      <main className="pt-36 pb-24 px-6 lg:px-8">
        <div className="max-w-2xl mx-auto">
          <StatusHero />
          <OverallStatusBanner />
          <ServicesList />

          <div className="flex items-center gap-1.5 text-xs text-on-surface-variant mb-8">
            <Clock className="w-3.5 h-3.5" />
            <span>Last checked: just now</span>
          </div>

          <SupportCard />
        </div>
      </main>

      <Footer />
      <DemoModal isOpen={isDemoOpen} onClose={() => setIsDemoOpen(false)} />
    </div>
  )
}
