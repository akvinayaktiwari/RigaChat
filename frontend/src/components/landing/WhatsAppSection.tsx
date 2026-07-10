import { Bell, BarChart2, Settings } from 'lucide-react'

const FEATURE_ROWS = [
  {
    Icon: Bell,
    title: 'Instant Lead Alerts',
    body: "Get a WhatsApp message with the lead's name, phone, email, and which bot captured them — within seconds of capture.",
  },
  {
    Icon: BarChart2,
    title: 'Weekly Performance Reports',
    body: 'Every Monday at 9am IST, receive a full summary of your leads, conversations, and top performing bot directly on WhatsApp.',
  },
  {
    Icon: Settings,
    title: 'Your Credentials, Your Control',
    body: 'Connect your own Gupshup account. BeepBoop never stores your API key in plain text — encrypted and secure.',
  },
]

export default function WhatsAppSection() {
  return (
    <section className="py-24 px-6 lg:px-8 bg-background" id="whatsapp">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full w-fit mx-auto mb-6">
            <span className="text-xs font-bold uppercase tracking-wider">WhatsApp Automation</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-extrabold text-on-background tracking-tight mb-4">
            Get notified the moment a lead comes in
          </h2>
          <p className="text-lg text-on-surface-variant max-w-2xl mx-auto">
            BeepBoop sends an instant WhatsApp message to your number every time a new lead is captured — from your
            chatbot or your forms.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-16 items-center">
          {/* Left column - Feature rows */}
          <div className="flex flex-col gap-4">
            {FEATURE_ROWS.map((row) => (
              <div key={row.title} className="p-4 rounded-xl border border-transparent">
                <div className="flex items-start gap-4">
                  <div className="p-2 rounded-lg bg-surface-container text-on-surface-variant">
                    <row.Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-base text-on-surface">{row.title}</h4>
                    <p className="text-sm text-on-surface-variant mt-1">{row.body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Right column - WhatsApp notification mockup */}
          <div className="flex flex-col items-center md:items-start gap-3">
            <div className="bg-[#075E54] rounded-2xl p-5 max-w-xs font-mono text-xs text-white leading-relaxed whitespace-pre-line">
              {`🔔 New Lead — BeepBoop

Name: Rahul Sharma
Phone: +91 98765 43210
Email: rahul@example.com
Bot: Property Assistant
Time: Today, 2:34 PM

View: beepboop.drsyeta.in/dashboard/leads`}
            </div>
            <p className="text-xs text-on-surface-variant opacity-60">Delivered via WhatsApp Business API</p>
          </div>
        </div>
      </div>
    </section>
  )
}
