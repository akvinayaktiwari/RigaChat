import { useState } from 'react'
import Navbar from '../components/landing/Navbar'
import Footer from '../components/landing/Footer'
import DemoModal from '../components/landing/modals/DemoModal'

interface TermsSection {
  title: string
  body: string
}

const SECTIONS: TermsSection[] = [
  { title: '1. Acceptance of Terms', body: 'By using BeepBoop you agree to these terms.' },
  {
    title: '2. Use of Service',
    body: 'You must provide accurate information. You are responsible for your chatbot content. Do not use BeepBoop for spam or illegal activity.',
  },
  { title: '3. Data and Privacy', body: 'Your data is governed by our Privacy Policy.' },
  {
    title: '4. Payments and Billing',
    body: 'Subscriptions billed monthly. Cancel anytime, no refunds for partial months. Prices in INR, inclusive of applicable taxes.',
  },
  {
    title: '5. Limitation of Liability',
    body: 'BeepBoop is provided as-is. We are not liable for lead loss, missed notifications, or third-party service outages.',
  },
  { title: '6. Changes to Terms', body: 'We may update these terms. Continued use means acceptance.' },
]

export default function Terms() {
  const [isDemoOpen, setIsDemoOpen] = useState(false)

  return (
    <div className="landing-page bg-background">
      <Navbar onOpenDemo={() => setIsDemoOpen(true)} />

      <main className="pt-36 pb-24 px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl font-extrabold text-on-background tracking-tight mb-2">Terms of Service</h1>
          <p className="text-sm text-on-surface-variant mb-12">Last updated: July 2026</p>

          <div className="flex flex-col gap-10">
            {SECTIONS.map((section) => (
              <section key={section.title}>
                <h2 className="text-xl font-bold text-on-surface mb-3">{section.title}</h2>
                <p className="text-sm text-on-surface-variant leading-relaxed">{section.body}</p>
              </section>
            ))}

            <section>
              <h2 className="text-xl font-bold text-on-surface mb-3">7. Contact</h2>
              <p className="text-sm text-on-surface-variant leading-relaxed">
                <a href="mailto:admin@drsyeta.in" className="text-primary hover:underline">admin@drsyeta.in</a>
                <br />
                Drsyeta Corp, Bangalore, India
              </p>
            </section>
          </div>
        </div>
      </main>

      <Footer />
      <DemoModal isOpen={isDemoOpen} onClose={() => setIsDemoOpen(false)} />
    </div>
  )
}
