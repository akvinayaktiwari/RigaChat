import { useState } from 'react'
import { Mail, MessageSquare } from 'lucide-react'
import Navbar from '../components/landing/Navbar'
import Footer from '../components/landing/Footer'
import DemoModal from '../components/landing/modals/DemoModal'

export default function Contact() {
  const [isDemoOpen, setIsDemoOpen] = useState(false)

  return (
    <div className="landing-page bg-background">
      <Navbar onOpenDemo={() => setIsDemoOpen(true)} />

      <main className="pt-36 pb-24 px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-5xl font-extrabold text-on-background tracking-tight mb-4">
              Get in touch
            </h1>
            <p className="text-lg text-on-surface-variant max-w-2xl mx-auto">
              We typically respond within 24 hours on business days.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-white rounded-2xl border border-outline-variant p-8 flex flex-col gap-4">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                <Mail className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-on-surface">Email Us</h3>
              <p className="text-sm text-on-surface-variant leading-relaxed">
                For general questions, demos, and partnerships.
              </p>
              <a
                href="mailto:admin@drsyeta.in"
                className="mt-auto inline-flex items-center justify-center cta-accent text-white font-semibold px-6 py-3 rounded-xl transition-all hover:shadow-lg"
              >
                admin@drsyeta.in
              </a>
            </div>

            <div className="bg-white rounded-2xl border border-outline-variant p-8 flex flex-col gap-4">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                <MessageSquare className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-on-surface">Technical Support</h3>
              <p className="text-sm text-on-surface-variant leading-relaxed">
                For help with your VyostraAI account, chatbots, or integrations.
              </p>
              <a
                href="mailto:admin@drsyeta.in"
                className="inline-flex items-center justify-center border border-outline text-on-surface font-semibold px-6 py-3 rounded-xl hover:bg-surface-container transition-colors"
              >
                admin@drsyeta.in
              </a>
              <p className="text-xs text-on-surface-variant">Mon-Fri, 9am-6pm IST</p>
            </div>
          </div>

          <div className="mt-10 text-center">
            <p className="text-sm text-on-surface-variant">
              ⚡ Average response time: under 4 hours during business hours
            </p>
          </div>
        </div>
      </main>

      <Footer />
      <DemoModal isOpen={isDemoOpen} onClose={() => setIsDemoOpen(false)} />
    </div>
  )
}
