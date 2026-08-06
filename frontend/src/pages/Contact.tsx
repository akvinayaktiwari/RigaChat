import { useState } from 'react'
import { CheckCircle2, Mail, MessageSquare, Send } from 'lucide-react'
import Navbar from '../components/landing/Navbar'
import Footer from '../components/landing/Footer'
import DemoModal from '../components/landing/modals/DemoModal'
import { submitContactMessage } from '../services/api'

interface ContactFormState {
  name: string
  email: string
  subject: string
  message: string
  // Honeypot, hidden from real users — see the hidden input near the bottom
  // of the form. Part of form state (not a ref) so resetting the form clears
  // it too.
  company: string
}

type SubmitStatus = 'idle' | 'submitting' | 'success' | 'error'

const EMPTY_FORM: ContactFormState = { name: '', email: '', subject: '', message: '', company: '' }

const GENERIC_ERROR = 'Could not send your message. Please try again, or email us directly.'

const FORM_INPUT_CLASSES =
  'w-full px-4 py-3 bg-white border border-outline-variant/60 focus:border-primary rounded-xl shadow-xs focus:outline-hidden focus:ring-4 focus:ring-primary/10 text-on-surface text-sm transition-all placeholder:text-outline disabled:opacity-60 disabled:cursor-not-allowed'
const FORM_LABEL_CLASSES = 'block text-sm font-semibold text-on-surface mb-2'

export default function Contact() {
  const [isDemoOpen, setIsDemoOpen] = useState(false)
  const [form, setForm] = useState<ContactFormState>(EMPTY_FORM)
  const [status, setStatus] = useState<SubmitStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string>('')

  const isSubmitting = status === 'submitting'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isSubmitting) return

    setStatus('submitting')
    setErrorMessage('')

    try {
      const response = await submitContactMessage(form)

      if (!response.success) {
        // The backend's own message is shown as-is for the cases a visitor can
        // act on (validation, rate limit); anything else is a server-side
        // problem whose raw text would mean nothing to them.
        setErrorMessage(response.error ?? GENERIC_ERROR)
        setStatus('error')
        return
      }

      setForm(EMPTY_FORM)
      setStatus('success')
    } catch {
      // Network failure / non-JSON response — apiClient throws rather than
      // returning an ApiResponse here.
      setErrorMessage(GENERIC_ERROR)
      setStatus('error')
    }
  }

  function updateField(field: keyof ContactFormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    // Clear a previous failure as soon as they start changing something, so a
    // stale red banner doesn't sit above a form they're actively fixing.
    if (status === 'error') {
      setStatus('idle')
      setErrorMessage('')
    }
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
            {status === 'success' ? (
              <div
                role="status"
                className="bg-white rounded-2xl border border-outline-variant p-8 flex flex-col items-center text-center gap-4 min-h-100 justify-center"
              >
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7 text-emerald-600" />
                </div>
                <h2
                  className="text-xl font-bold text-on-surface"
                  style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                >
                  Message sent
                </h2>
                <p className="text-sm text-on-surface-variant max-w-xs leading-relaxed">
                  Thanks for reaching out — we&apos;ll reply to your email within 24 hours.
                </p>
                <button
                  type="button"
                  onClick={() => setStatus('idle')}
                  className="mt-2 text-sm font-semibold text-primary hover:opacity-80 transition-opacity"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-outline-variant p-8 flex flex-col gap-5">
                {status === 'error' && (
                  <p
                    role="alert"
                    className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3"
                  >
                    {errorMessage}
                  </p>
                )}
                <div>
                  <label htmlFor="contact-name" className={FORM_LABEL_CLASSES}>
                    Name
                  </label>
                  <input
                    id="contact-name"
                    type="text"
                    required
                    disabled={isSubmitting}
                    value={form.name}
                    onChange={(e) => updateField('name', e.target.value)}
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
                    disabled={isSubmitting}
                    value={form.email}
                    onChange={(e) => updateField('email', e.target.value)}
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
                    disabled={isSubmitting}
                    value={form.subject}
                    onChange={(e) => updateField('subject', e.target.value)}
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
                    disabled={isSubmitting}
                    value={form.message}
                    onChange={(e) => updateField('message', e.target.value)}
                    className={`${FORM_INPUT_CLASSES} resize-none`}
                    placeholder="Tell us more..."
                  />
                </div>

                {/* Honeypot: hidden from people (and from screen readers via
                    aria-hidden), left in the DOM for bots that fill every
                    input. A non-empty value makes the backend drop the
                    submission. tabIndex=-1 keeps keyboard users out of it. */}
                <input
                  type="text"
                  name="company"
                  value={form.company}
                  onChange={(e) => updateField('company', e.target.value)}
                  className="hidden"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                />

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="mt-2 inline-flex items-center justify-center gap-2 bg-linear-to-r from-violet-600 to-purple-500 text-white font-semibold px-6 py-3 rounded-xl shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                  {isSubmitting ? 'Sending...' : 'Send message'}
                </button>
              </form>
            )}

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
                  href="mailto:support@vyostra.com"
                  className="mt-auto inline-flex items-center justify-center bg-linear-to-r from-violet-600 to-purple-500 text-white font-semibold px-6 py-3 rounded-xl shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity"
                >
                  support@vyostra.com
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
