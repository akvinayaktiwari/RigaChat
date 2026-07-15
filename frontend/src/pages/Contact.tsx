import { useState } from 'react'
import { Mail, MessageSquare, Send } from 'lucide-react'
import Navbar from '../components/landing/Navbar'
import Footer from '../components/landing/Footer'
import DemoModal from '../components/landing/modals/DemoModal'

interface ContactFormState {
  name: string
  email: string
  subject: string
  message: string
}

const EMPTY_FORM: ContactFormState = { name: '', email: '', subject: '', message: '' }

const FORM_INPUT_CLASSES =
  'w-full px-4 py-3 bg-white border border-outline-variant/60 focus:border-primary rounded-xl shadow-xs focus:outline-hidden focus:ring-4 focus:ring-primary/10 text-on-surface text-sm transition-all placeholder:text-outline'
const FORM_LABEL_CLASSES = 'block text-sm font-semibold text-on-surface mb-2'

export default function Contact() {
  const [isDemoOpen, setIsDemoOpen] = useState(false)
  const [form, setForm] = useState<ContactFormState>(EMPTY_FORM)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // TODO: wire to email service
    setForm(EMPTY_FORM)
  }

  return (
    <div className="landing-page bg-background">
      <Navbar onOpenDemo={() => setIsDemoOpen(true)} />

      <main className="pt-36 pb-24 px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-5xl font-extrabold text-on-background tracking-tight mb-4">
              Get in touch
            </h1>
            <p className="text-lg text-on-surface-variant max-w-2xl mx-auto">
              We respond within 24 hours.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 items-start">
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-outline-variant p-8 flex flex-col gap-5">
              <div>
                <label htmlFor="contact-name" className={FORM_LABEL_CLASSES}>
                  Name
                </label>
                <input
                  id="contact-name"
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  className={FORM_INPUT_CLASSES}
                  placeholder="Your name"
                />
              </div>
              <div>
                <label htmlFor="contact-email" className={FORM_LABEL_CLASSES}>
                  Email
                </label>
                <input
                  id="contact-email"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  className={FORM_INPUT_CLASSES}
                  placeholder="you@company.com"
                />
              </div>
              <div>
                <label htmlFor="contact-subject" className={FORM_LABEL_CLASSES}>
                  Subject
                </label>
                <input
                  id="contact-subject"
                  type="text"
                  required
                  value={form.subject}
                  onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
                  className={FORM_INPUT_CLASSES}
                  placeholder="How can we help?"
                />
              </div>
              <div>
                <label htmlFor="contact-message" className={FORM_LABEL_CLASSES}>
                  Message
                </label>
                <textarea
                  id="contact-message"
                  rows={4}
                  required
                  value={form.message}
                  onChange={(e) => setForm((prev) => ({ ...prev, message: e.target.value }))}
                  className={`${FORM_INPUT_CLASSES} resize-none`}
                  placeholder="Tell us more..."
                />
              </div>
              <button
                type="submit"
                className="mt-2 inline-flex items-center justify-center gap-2 bg-linear-to-r from-violet-600 to-purple-500 text-white font-semibold px-6 py-3 rounded-xl shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity"
              >
                <Send className="w-4 h-4" />
                Send message
              </button>
            </form>

            <div className="flex flex-col gap-6">
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

              <div className="bg-white rounded-2xl border border-outline-variant p-8 flex flex-col gap-3">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-on-surface">Technical Support</h3>
                <p className="text-sm text-on-surface-variant leading-relaxed">
                  For help with your VyostraAI account, chatbots, or integrations.
                </p>
                <p className="text-xs text-on-surface-variant">Mon-Fri, 9am-6pm IST</p>
              </div>
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
