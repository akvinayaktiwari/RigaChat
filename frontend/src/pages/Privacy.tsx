import { useState } from 'react'
import Navbar from '../components/landing/Navbar'
import Footer from '../components/landing/Footer'
import DemoModal from '../components/landing/modals/DemoModal'

interface PolicySection {
  title: string
  items: string[]
}

const SECTIONS: PolicySection[] = [
  {
    title: '1. Information We Collect',
    items: ['Name, email, phone number (when you sign up)', 'Lead data captured through your chatbots', 'Usage data and analytics'],
  },
  {
    title: '2. How We Use Your Information',
    items: [
      'To provide and improve BeepBoop services',
      'To send lead notifications via WhatsApp',
      'To sync data with connected CRMs (Zoho)',
      'We never sell your data to third parties',
    ],
  },
  {
    title: '3. Data Storage',
    items: [
      'All data stored on AWS infrastructure in ap-south-1 (Mumbai, India)',
      'Data encrypted at rest and in transit',
      'API keys encrypted using AWS KMS',
    ],
  },
  {
    title: '4. Third Party Services',
    items: ['AWS (infrastructure)', 'Gupshup (WhatsApp delivery)', 'Zoho CRM (if connected by you)', 'OpenAI (AI chatbot responses)'],
  },
  {
    title: '5. Your Rights',
    items: ['Access your data anytime from dashboard', 'Request data deletion: admin@drsyeta.in', 'Export your leads as CSV'],
  },
]

export default function Privacy() {
  const [isDemoOpen, setIsDemoOpen] = useState(false)

  return (
    <div className="landing-page bg-background">
      <Navbar onOpenDemo={() => setIsDemoOpen(true)} />

      <main className="pt-36 pb-24 px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl font-extrabold text-on-background tracking-tight mb-2">Privacy Policy</h1>
          <p className="text-sm text-on-surface-variant mb-12">Last updated: July 2026</p>

          <div className="flex flex-col gap-10">
            {SECTIONS.map((section) => (
              <section key={section.title}>
                <h2 className="text-xl font-bold text-on-surface mb-3">{section.title}</h2>
                <ul className="flex flex-col gap-2">
                  {section.items.map((item) => (
                    <li key={item} className="text-sm text-on-surface-variant leading-relaxed pl-4 relative">
                      <span className="absolute left-0">•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            <section>
              <h2 className="text-xl font-bold text-on-surface mb-3">6. Contact</h2>
              <p className="text-sm text-on-surface-variant leading-relaxed">
                Email: <a href="mailto:admin@drsyeta.in" className="text-primary hover:underline">admin@drsyeta.in</a>
                <br />
                Company: Drsyeta Corp, Bangalore, India
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
