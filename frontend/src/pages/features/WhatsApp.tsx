import PageMeta from '../../components/seo/PageMeta'
import StructuredData from '../../components/seo/StructuredData'
import { faqPageSchema, featurePageNodes, jsonLdGraph, type FaqItem } from '../../lib/structured-data'
import { Key, ToggleRight, BarChart2, Bell, Lock, Bot, Users, RefreshCw, Megaphone } from 'lucide-react'
import UseCaseLayout from '../../components/landing/UseCaseLayout'

/**
 * Rendered on the page and published as FAQPage from this one array.
 *
 * Alerts go through the client's own Gupshup account today. When connecting
 * directly through Meta opens to clients, change these answers together with
 * the Gupshup answers in Faq.tsx and Help.tsx.
 */
export const WHATSAPP_FAQ: FaqItem[] = [
  {
    question: 'Do I need a Gupshup account for WhatsApp lead alerts?',
    answer:
      'Yes. Gupshup is a WhatsApp Business API provider, and Vyostra AI sends alerts through your own Gupshup account. You enter your Gupshup API key and WhatsApp Business number once, then switch on Lead Notifications.',
  },
  {
    question: 'Which leads trigger a WhatsApp alert?',
    answer:
      'Every new lead captured by any of your chat agents or lead forms, and every lead from a connected Meta lead ad. Each one sends its own WhatsApp message to your number as it arrives; alerts are not batched.',
  },
  {
    question: 'When does the weekly WhatsApp report arrive?',
    answer:
      'Every Monday at 9am IST, once Weekly Reports is switched on. It counts the new leads from the past week, split between your chat agents and your forms.',
  },
  {
    question: 'How does Vyostra AI store my Gupshup API key?',
    answer:
      'Encrypted. The key is encrypted with AWS KMS, never stored in plain text, and decrypted only in memory at the moment a message is sent.',
  },
  {
    question: 'Does Vyostra AI also follow up with leads on WhatsApp?',
    answer:
      'Yes. A follow-up journey messages a new lead on WhatsApp, waits for a real reply rather than firing on a timer, and hands the lead to your team when it needs a person.',
  },
]

const PAGE = { name: 'WhatsApp Automation', path: '/features/whatsapp/' }

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
          {'🔔 New Lead — Vyostra AI\n\nName: Rahul Sharma\nPhone: +1 (555) 010-4821\nEmail: rahul@example.com\nBot: Property Assistant\nTime: Today, 2:34 PM\n\nvyostra.com/leads'}
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
      <PageMeta
        title="WhatsApp Lead Notifications — Vyostra AI"
        description="Get instant WhatsApp alerts every time a new lead is captured. Weekly reports every Monday. Powered by Gupshup."
        path="/features/whatsapp/"
      />
      <StructuredData data={jsonLdGraph([...featurePageNodes(PAGE), faqPageSchema(WHATSAPP_FAQ)])} />
      <UseCaseLayout
        featurePath="/features/whatsapp"
        badge="WHATSAPP AUTOMATION"
        headline="WhatsApp alerts for every new lead"
        subheadline="Vyostra AI WhatsApp lead notifications send a WhatsApp message to your own number the moment a lead is captured, whether it came from a chat agent, a lead form or a Meta lead ad. A weekly summary of new leads arrives on WhatsApp every Monday at 9am IST."
        howItWorksHeading="How do you set up WhatsApp lead alerts?"
        benefitsHeading="Why get lead alerts on WhatsApp?"
        heroVisual={<WhatsAppNotificationMockup />}
        howItWorksSteps={[
          {
            number: '1',
            title: 'Connect Your Gupshup Account',
            body: 'Enter your Gupshup API key and WhatsApp Business number in Vyostra AI settings. Vyostra AI encrypts your credentials with AWS KMS — never stored in plain text.',
            icon: <Key className="w-6 h-6" />,
          },
          {
            number: '2',
            title: 'Enable Lead Notifications',
            body: 'Turn on the Lead Notifications toggle. From that moment, every new lead from your chat agents, lead forms and connected Meta lead ads triggers an instant WhatsApp message to your number.',
            icon: <ToggleRight className="w-6 h-6" />,
          },
          {
            number: '3',
            title: 'Get Weekly Reports',
            body: 'Every Monday at 9am IST, receive a summary of the past week’s new leads, split between chat agents and forms, directly on WhatsApp.',
            icon: <BarChart2 className="w-6 h-6" />,
          },
        ]}
        benefits={[
          {
            icon: <Bell className="w-5 h-5" />,
            title: 'Instant Alerts',
            body: 'Lead captured at 2am? You get the WhatsApp message at 2am. Alerts are sent one by one as leads arrive, not batched.',
          },
          {
            icon: <Lock className="w-5 h-5" />,
            title: 'Your Credentials, Your Control',
            body: 'Vyostra AI never stores your API key in plain text. It is encrypted with AWS KMS and only decrypted in memory when sending a message.',
          },
          {
            icon: <BarChart2 className="w-5 h-5" />,
            title: 'Weekly Performance Reports',
            body: 'Every Monday morning, one report arrives on your WhatsApp with the week’s new leads, counted separately for chat agents and forms.',
          },
        ]}
        integrations={[
          { icon: <Bot className="w-4 h-4" />, title: 'AI Agent', href: '/features/chatbot' },
          { icon: <Users className="w-4 h-4" />, title: 'Lead CRM', href: '/features/crm' },
          { icon: <RefreshCw className="w-4 h-4" />, title: 'Zoho CRM', href: '/features/zoho-crm' },
          { icon: <Megaphone className="w-4 h-4" />, title: 'Meta Lead Ads', href: '/integrations/meta-lead-ads' },
        ]}
        faq={{ heading: 'What do people ask about WhatsApp lead alerts?', items: WHATSAPP_FAQ }}
        ctaHeadline="Start getting WhatsApp lead alerts today"
        ctaBody="Connect your Gupshup account in 2 minutes. Every lead. Instantly on WhatsApp."
      />
    </>
  )
}
