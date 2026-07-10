import { Helmet } from 'react-helmet-async'
import { Key, ToggleRight, BarChart2, Bell, Lock, Bot, Users, RefreshCw } from 'lucide-react'
import UseCaseLayout from '../../components/landing/UseCaseLayout'

function WhatsAppNotificationMockup() {
  return (
    <div className="bg-[#111B21] rounded-2xl p-5 max-w-xs w-full shadow-lg">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-white/60 text-lg">‹</span>
        <div>
          <p className="text-white text-sm font-bold">+15559330029</p>
          <p className="text-emerald-400 text-[10px]">online</p>
        </div>
      </div>

      <div className="bg-[#005C4B] rounded-2xl rounded-tl-none p-4">
        <p className="text-white font-mono text-xs leading-relaxed whitespace-pre-line">
          {'🔔 New Lead — BeepBoop\n\nName: Rahul Sharma\nPhone: +91 98765 43210\nEmail: rahul@example.com\nBot: Property Assistant\nTime: Today, 2:34 PM\n\nbeepboop.drsyeta.in/leads'}
        </p>
        <div className="flex items-center justify-end gap-1 mt-2">
          <span className="text-white/50 text-[10px]">2:34 PM</span>
          <span className="text-blue-300 text-[10px]">✓✓</span>
        </div>
      </div>
    </div>
  )
}

export default function WhatsAppFeaturePage() {
  return (
    <>
      <Helmet>
        <title>WhatsApp Lead Notifications — BeepBoop</title>
        <meta
          name="description"
          content="Get instant WhatsApp alerts every time a new lead is captured. Weekly reports every Monday. Powered by Gupshup."
        />
      </Helmet>
      <UseCaseLayout
        badge="WHATSAPP AUTOMATION"
        headline="Never miss a lead — get notified instantly"
        subheadline="BeepBoop sends a WhatsApp message to your number the moment a lead is captured — from your chatbot or your forms. No app switching. No delays."
        heroVisual={<WhatsAppNotificationMockup />}
        howItWorksSteps={[
          {
            number: '1',
            title: 'Connect Your Gupshup Account',
            body: 'Enter your Gupshup API key and WhatsApp Business number in BeepBoop settings. BeepBoop encrypts your credentials with AWS KMS — never stored in plain text.',
            icon: <Key className="w-6 h-6" />,
          },
          {
            number: '2',
            title: 'Enable Lead Notifications',
            body: 'Turn on the Lead Notifications toggle. From that moment, every new lead captured by any of your chatbots or forms triggers an instant WhatsApp message to your number.',
            icon: <ToggleRight className="w-6 h-6" />,
          },
          {
            number: '3',
            title: 'Get Weekly Reports',
            body: 'Every Monday at 9am IST, receive a full summary of your week — total leads, conversations, top performing bot — directly on WhatsApp.',
            icon: <BarChart2 className="w-6 h-6" />,
          },
        ]}
        benefits={[
          {
            icon: <Bell className="w-5 h-5" />,
            title: 'Instant Alerts',
            body: 'Lead captured at 2am? You get the WhatsApp message at 2am. No batching, no delays. Average delivery time under 4 seconds.',
          },
          {
            icon: <Lock className="w-5 h-5" />,
            title: 'Your Credentials, Your Control',
            body: 'BeepBoop never stores your API key in plain text. It is encrypted with AWS KMS and only decrypted in memory when sending a message.',
          },
          {
            icon: <BarChart2 className="w-5 h-5" />,
            title: 'Weekly Performance Reports',
            body: 'Every Monday morning, a consolidated report arrives on your WhatsApp — leads by bot, total conversations, and your best performing chatbot of the week.',
          },
        ]}
        integrations={[
          { icon: <Bot className="w-4 h-4" />, title: 'AI Chatbot', href: '/features/chatbot' },
          { icon: <Users className="w-4 h-4" />, title: 'Lead CRM', href: '/features/crm' },
          { icon: <RefreshCw className="w-4 h-4" />, title: 'Zoho Sync', href: '/features/crm' },
        ]}
        ctaHeadline="Start getting WhatsApp lead alerts today"
        ctaBody="Connect your Gupshup account in 2 minutes. Every lead. Instantly on WhatsApp."
      />
    </>
  )
}
