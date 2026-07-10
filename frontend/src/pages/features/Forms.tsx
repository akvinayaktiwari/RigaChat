import { Helmet } from 'react-helmet-async'
import { FileText, Code, Bell, Palette, Globe, Bot, MessageSquare, Users } from 'lucide-react'
import UseCaseLayout from '../../components/landing/UseCaseLayout'

function FormMockup() {
  return (
    <div className="bg-white rounded-2xl border border-outline-variant shadow-lg p-5 max-w-xs w-full">
      <p className="font-bold text-on-surface text-sm mb-4">Get a Free Consultation</p>
      <div className="flex flex-col gap-3 mb-4">
        <span className="w-full border border-outline-variant rounded-xl px-3 py-2.5 text-xs text-on-surface-variant">Full Name</span>
        <span className="w-full border border-outline-variant rounded-xl px-3 py-2.5 text-xs text-on-surface-variant">Phone Number</span>
        <span className="w-full border border-outline-variant rounded-xl px-3 py-2.5 text-xs text-on-surface-variant">Email Address</span>
      </div>
      <span className="block bg-primary text-white w-full py-3 rounded-xl text-sm font-bold text-center cursor-default">Submit</span>
      <p className="text-[10px] text-on-surface-variant text-center mt-3">🔒 Your data is secure</p>
    </div>
  )
}

export default function Forms() {
  return (
    <>
      <Helmet>
        <title>Smart Form Builder — BeepBoop</title>
        <meta
          name="description"
          content="Build beautiful lead capture forms in minutes. Embed anywhere. Every submission captured and notified instantly via WhatsApp."
        />
      </Helmet>
      <UseCaseLayout
        badge="FORM BUILDER"
        headline="Beautiful forms that capture leads"
        subheadline="Build custom lead capture forms in minutes. Embed on any website. Every submission is captured in your CRM and triggers an instant WhatsApp notification."
        heroVisual={<FormMockup />}
        howItWorksSteps={[
          {
            number: '1',
            title: 'Build Your Form',
            body: 'Add fields, customize labels, and set up your form in minutes. No code required. Choose from text, phone, email, and dropdown field types.',
            icon: <FileText className="w-6 h-6" />,
          },
          {
            number: '2',
            title: 'Embed Anywhere',
            body: 'Copy the embed code and paste it on your website, landing page, or any platform. Forms work on WordPress, Webflow, custom HTML — anywhere.',
            icon: <Code className="w-6 h-6" />,
          },
          {
            number: '3',
            title: 'Get Notified Instantly',
            body: "Every form submission is saved to your CRM and triggers an instant WhatsApp notification with the lead's details.",
            icon: <Bell className="w-6 h-6" />,
          },
        ]}
        benefits={[
          {
            icon: <Palette className="w-5 h-5" />,
            title: 'No Code Form Builder',
            body: 'Build professional lead capture forms without writing a single line of code. Drag, drop, and publish in minutes.',
          },
          {
            icon: <Globe className="w-5 h-5" />,
            title: 'Embed on Any Website',
            body: 'One embed code works everywhere. Paste it on your website once and it works on all pages where you place it.',
          },
          {
            icon: <Bell className="w-5 h-5" />,
            title: 'Instant WhatsApp Alerts',
            body: 'Every form submission triggers a WhatsApp notification to your number with the lead details — just like chatbot leads.',
          },
        ]}
        integrations={[
          { icon: <Bot className="w-4 h-4" />, title: 'AI Chatbot', href: '/features/chatbot' },
          { icon: <MessageSquare className="w-4 h-4" />, title: 'WhatsApp Alerts', href: '/features/whatsapp' },
          { icon: <Users className="w-4 h-4" />, title: 'Lead CRM', href: '/features/crm' },
        ]}
        ctaHeadline="Start capturing form leads today"
        ctaBody="Build your first form in under 2 minutes. No code, no credit card required."
      />
    </>
  )
}
