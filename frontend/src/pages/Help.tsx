import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, Search } from 'lucide-react'
import Navbar from '../components/landing/Navbar'
import Footer from '../components/landing/Footer'
import DemoModal from '../components/landing/modals/DemoModal'

interface FaqItem {
  id: string
  question: string
  answer: string
}

interface FaqSection {
  title: string
  items: FaqItem[]
}

const FAQ_SECTIONS: FaqSection[] = [
  {
    title: 'Getting Started',
    items: [
      {
        id: 'gs-1',
        question: 'How do I create my first chatbot?',
        answer:
          'Log in to your dashboard, click "Chatbots" in the sidebar, then click "Create New Bot". Enter your website URL and BeepBoop will train your AI chatbot automatically. It takes under 5 minutes.',
      },
      {
        id: 'gs-2',
        question: 'How do I embed the chat widget on my website?',
        answer:
          'After creating your bot, go to the bot settings and copy the embed code. Paste it before the closing </body> tag on your website. The widget will appear immediately.',
      },
      {
        id: 'gs-3',
        question: 'What is the knowledge base?',
        answer:
          'The knowledge base is the information your chatbot uses to answer questions. BeepBoop automatically builds it from your website URL. You can also add custom entries manually from the bot settings.',
      },
    ],
  },
  {
    title: 'WhatsApp',
    items: [
      {
        id: 'wa-1',
        question: 'How do I set up WhatsApp notifications?',
        answer:
          'Go to WhatsApp in the sidebar, click "Connect WhatsApp", enter your Gupshup API key and phone number, then click Connect. Once connected, enable "Lead Notifications" to start receiving alerts.',
      },
      {
        id: 'wa-2',
        question: 'What is Gupshup and do I need an account?',
        answer:
          'Gupshup is a WhatsApp Business API provider. You need a free Gupshup account to use WhatsApp features. Sign up at platform.gupshup.io, create an app, and copy your API key into BeepBoop settings.',
      },
      {
        id: 'wa-3',
        question: 'How do I set up weekly reports?',
        answer:
          'After connecting WhatsApp, go to the Weekly Reports tab and enable the toggle. You will receive a summary every Monday at 9am IST covering leads, conversations, and top performing bots.',
      },
    ],
  },
  {
    title: 'Integrations',
    items: [
      {
        id: 'int-1',
        question: 'How do I connect Zoho CRM?',
        answer:
          'Go to Settings → Integrations → Zoho CRM → Connect. You will be redirected to Zoho to authorize BeepBoop. Once connected, all new leads sync to Zoho automatically.',
      },
      {
        id: 'int-2',
        question: 'Which CRMs does BeepBoop support?',
        answer: 'BeepBoop currently supports Zoho CRM. HubSpot and Salesforce integrations are coming soon.',
      },
    ],
  },
  {
    title: 'Leads and Forms',
    items: [
      {
        id: 'lf-1',
        question: 'Where do I see my captured leads?',
        answer: 'All leads appear in the Leads section of your dashboard. You can filter by date, bot, source, and status.',
      },
      {
        id: 'lf-2',
        question: 'How do I create a lead capture form?',
        answer:
          'Go to Forms in the sidebar, click "Create Form", add your fields, and copy the embed code. Forms work independently of chatbots and can be embedded anywhere.',
      },
    ],
  },
  {
    title: 'Billing',
    items: [
      {
        id: 'bi-1',
        question: 'Is there a free trial?',
        answer: 'Yes. BeepBoop is free to start. No credit card required.',
      },
      {
        id: 'bi-2',
        question: 'Can I change my plan later?',
        answer: 'Yes. You can upgrade or downgrade your plan anytime from Settings → Subscription Plans.',
      },
      {
        id: 'bi-3',
        question: 'How do I cancel my subscription?',
        answer: 'You can cancel anytime from Settings. Your account remains active until the end of the billing period.',
      },
    ],
  },
]

export default function Help() {
  const navigate = useNavigate()
  const [isDemoOpen, setIsDemoOpen] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  function toggleFaq(id: string) {
    setOpenId((prev) => (prev === id ? null : id))
  }

  return (
    <div className="landing-page bg-background">
      <Navbar onOpenDemo={() => setIsDemoOpen(true)} />

      <main className="pt-36 pb-24 px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <h1 className="text-4xl md:text-5xl font-extrabold text-on-background tracking-tight mb-4">
              Help Center
            </h1>
            <p className="text-lg text-on-surface-variant max-w-2xl mx-auto">
              Everything you need to get started with BeepBoop.
            </p>
          </div>

          <div className="relative mb-16">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant" />
            <input
              type="text"
              placeholder="Search for answers..."
              className="w-full pl-12 pr-4 py-3.5 border border-outline-variant rounded-xl text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          <div className="flex flex-col gap-12">
            {FAQ_SECTIONS.map((section) => (
              <div key={section.title}>
                <h2 className="text-xs font-bold uppercase tracking-widest text-primary mb-4">{section.title}</h2>
                <div className="flex flex-col gap-3">
                  {section.items.map((item) => {
                    const isOpen = openId === item.id
                    return (
                      <div
                        key={item.id}
                        className="bg-white rounded-xl border border-outline-variant overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() => toggleFaq(item.id)}
                          className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                        >
                          <span className="font-semibold text-on-surface text-sm">{item.question}</span>
                          <ChevronDown
                            className={`w-4 h-4 text-on-surface-variant shrink-0 transition-transform duration-300 ${
                              isOpen ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                        <div
                          className={`grid transition-all duration-300 ease-in-out ${
                            isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                          }`}
                        >
                          <div className="overflow-hidden">
                            <p className="px-5 pb-4 text-sm text-on-surface-variant leading-relaxed">{item.answer}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-16">
            <h2 className="text-xl font-bold text-on-surface mb-2">Still have questions?</h2>
            <p className="text-sm text-on-surface-variant mb-6">Email us at admin@drsyeta.in</p>
            <button
              onClick={() => navigate('/contact')}
              className="cta-accent text-white font-bold px-8 py-3.5 rounded-xl shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 cursor-pointer"
            >
              Contact Support
            </button>
          </div>
        </div>
      </main>

      <Footer />
      <DemoModal isOpen={isDemoOpen} onClose={() => setIsDemoOpen(false)} />
    </div>
  )
}
