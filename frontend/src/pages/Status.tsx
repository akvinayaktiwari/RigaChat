import { useState } from 'react'
import Navbar from '../components/landing/Navbar'
import Footer from '../components/landing/Footer'
import DemoModal from '../components/landing/modals/DemoModal'

const SERVICES = [
  'API Server',
  'Dashboard',
  'Chat Widget',
  'WhatsApp Notifications',
  'Zoho Integration',
  'Database',
]

export default function Status() {
  const [isDemoOpen, setIsDemoOpen] = useState(false)

  return (
    <div className="landing-page bg-background">
      <Navbar onOpenDemo={() => setIsDemoOpen(true)} />

      <main className="pt-36 pb-24 px-6 lg:px-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-4xl font-extrabold text-on-background tracking-tight mb-10">System Status</h1>

          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3 mb-10">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-emerald-700 font-bold">All Systems Operational</span>
          </div>

          <div className="bg-white rounded-2xl border border-outline-variant divide-y divide-outline-variant/50">
            {SERVICES.map((service) => (
              <div key={service} className="flex items-center justify-between px-6 py-4">
                <span className="text-sm font-semibold text-on-surface">{service}</span>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-md uppercase tracking-wide">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Operational
                </span>
              </div>
            ))}
          </div>

          <p className="text-xs text-on-surface-variant mt-4">Last checked: just now</p>

          <p className="text-sm text-on-surface-variant mt-10">
            For incident reports or outages, contact{' '}
            <a href="mailto:admin@drsyeta.in" className="text-primary hover:underline">
              admin@drsyeta.in
            </a>
          </p>
        </div>
      </main>

      <Footer />
      <DemoModal isOpen={isDemoOpen} onClose={() => setIsDemoOpen(false)} />
    </div>
  )
}
