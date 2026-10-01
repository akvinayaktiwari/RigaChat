import PageMeta from '../../components/seo/PageMeta'
import StructuredData from '../../components/seo/StructuredData'
import { faqPageSchema, featurePageNodes, jsonLdGraph, type FaqItem } from '../../lib/structured-data'
import { FileText, Code, Bell, Palette, Globe, Bot, MessageSquare, Users } from 'lucide-react'
import UseCaseLayout from '../../components/landing/UseCaseLayout'

/**
 * Rendered on the page and published as FAQPage from this one array.
 *
 * The field types are the five the form builder offers; keep the list in step
 * with NewFormPage.tsx.
 */
export const FORM_BUILDER_FAQ: FaqItem[] = [
  {
    question: 'Do I need a chat agent to use Vyostra AI forms?',
    answer: 'No. Forms work independently of agents. You can run a lead capture form on its own, or alongside a chat agent on the same site.',
  },
  {
    question: 'What field types can a form have?',
    answer: 'Five: text, number, email, phone, and options, which gives the visitor a list of choices to pick from. You set the label on every field.',
  },
  {
    question: 'Where do form submissions go?',
    answer:
      'Into the built-in lead CRM, in the same list as leads from your chat agents and Meta lead ads. Each submission is saved as a lead with the answers the visitor gave.',
  },
  {
    question: 'Do I need to write code to put a form on my site?',
    answer: 'No. You build the form in the dashboard, copy its embed code and paste it into your page. It works on WordPress, Webflow and custom HTML sites.',
  },
  {
    question: 'Will I be told when someone submits a form?',
    answer:
      'Yes, once WhatsApp lead notifications are switched on. Every submission then sends a WhatsApp message with the lead’s details to your number.',
  },
]

const PAGE = { name: 'Form Builder', path: '/features/forms/' }

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
      <PageMeta
        title="Smart Form Builder — Vyostra AI"
        description="Build beautiful lead capture forms in minutes. Embed anywhere. Every submission captured and notified instantly via WhatsApp."
        path="/features/forms/"
      />
      <StructuredData data={jsonLdGraph([...featurePageNodes(PAGE), faqPageSchema(FORM_BUILDER_FAQ)])} />
      <UseCaseLayout
        featurePath="/features/forms"
        badge="FORM BUILDER"
        headline="Lead capture forms that feed your CRM"
        subheadline="The Vyostra AI form builder makes lead capture forms you embed on any website with one snippet. Every submission is saved as a lead in the built-in lead CRM and can send a WhatsApp alert to your number. Forms work on their own, with or without a chat agent."
        howItWorksHeading="How does the Vyostra AI form builder work?"
        benefitsHeading="Why build your lead forms in Vyostra AI?"
        heroVisual={<FormMockup />}
        howItWorksSteps={[
          {
            number: '1',
            title: 'Build Your Form',
            body: 'Add fields, customize labels, and set up your form in minutes. No code required. Choose from text, number, email, phone, and options field types.',
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
            body: 'Build professional lead capture forms without writing a single line of code. Add fields, label them, and publish in minutes.',
          },
          {
            icon: <Globe className="w-5 h-5" />,
            title: 'Embed on Any Website',
            body: 'One embed code works everywhere. Paste it on your website once and it works on all pages where you place it.',
          },
          {
            icon: <Bell className="w-5 h-5" />,
            title: 'Instant WhatsApp Alerts',
            body: 'Every form submission triggers a WhatsApp notification to your number with the lead details — just like agent leads.',
          },
        ]}
        integrations={[
          { icon: <Bot className="w-4 h-4" />, title: 'AI Agent', href: '/features/chatbot' },
          { icon: <MessageSquare className="w-4 h-4" />, title: 'WhatsApp Alerts', href: '/features/whatsapp' },
          { icon: <Users className="w-4 h-4" />, title: 'Lead CRM', href: '/features/crm' },
        ]}
        faq={{ heading: 'What do people ask about Vyostra AI forms?', items: FORM_BUILDER_FAQ }}
        ctaHeadline="Start capturing form leads today"
        ctaBody="Build your first form in under 2 minutes. No code, no credit card required."
      />
    </>
  )
}
