import PageMeta from '../../components/seo/PageMeta'
import StructuredData from '../../components/seo/StructuredData'
import { faqPageSchema, featurePageNodes, jsonLdGraph, type FaqItem } from '../../lib/structured-data'
import { Bot, Code, Users, Brain, Clock, Zap, MessageSquare, Users as CrmIcon, FileText } from 'lucide-react'
import UseCaseLayout from '../../components/landing/UseCaseLayout'

/**
 * Rendered on the page and published as FAQPage from this one array.
 *
 * Every answer describes a setting or behaviour that exists in the dashboard
 * today. An answer engine quotes these as fact, so nothing here is aspirational.
 */
export const CHAT_AGENT_FAQ: FaqItem[] = [
  {
    question: 'How does the Vyostra AI chat agent learn about my business?',
    answer:
      'You enter your website URL and Vyostra AI reads the site and builds a knowledge base from it automatically. You can add your own knowledge base entries by hand for anything the site does not cover.',
  },
  {
    question: 'What does the chat agent do when it does not know the answer?',
    answer:
      'It says so. The Vyostra AI chat agent answers only from your website content and knowledge base, and when the answer is not there it tells the visitor instead of guessing.',
  },
  {
    question: 'When does the chat agent ask a visitor for their contact details?',
    answer:
      'After a number of messages that you set. The agent then shows a short lead form with the fields you chose, and the visitor’s details are saved as a lead with the conversation transcript.',
  },
  {
    question: 'Can I control when the chat widget appears?',
    answer:
      'Yes. You choose one of four triggers: as soon as the page loads, after 5 seconds, after the visitor scrolls halfway down the page, or when they move to leave.',
  },
  {
    question: 'Do I need to write code to add the chat agent to my site?',
    answer:
      'No. You copy one script tag and paste it before the closing body tag of your website. It works on WordPress, Webflow and custom HTML sites.',
  },
]

const PAGE = { name: 'AI Agent', path: '/features/chatbot/' }

function ChatWidgetMockup() {
  return (
    <div className="bg-white rounded-2xl border border-outline-variant shadow-lg p-4 max-w-xs w-full">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-9 h-9 bg-primary text-white rounded-xl flex items-center justify-center">
          <Bot className="w-5 h-5" />
        </div>
        <div>
          <p className="font-bold text-on-surface text-sm">Vyostra AI Assistant</p>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-xs text-on-surface-variant">Online</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <p className="bg-surface-container-low rounded-2xl rounded-tl-none p-3 text-xs text-on-surface">
          Hi! How can I help you today? 👋
        </p>
        <p className="bg-primary text-white rounded-2xl rounded-tr-none p-3 text-xs ml-auto max-w-[85%]">
          I'm looking for a 3-bedroom apartment
        </p>
        <p className="bg-surface-container-low rounded-2xl rounded-tl-none p-3 text-xs text-on-surface">
          Great! I can help with that. Could I get your name and phone number to connect you with our team?
        </p>
      </div>

      <div className="mt-3">
        <span className="inline-flex items-center bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold rounded-full px-3 py-1">
          ✓ Lead Captured
        </span>
      </div>
    </div>
  )
}

export default function Chatbot() {
  return (
    <>
      <PageMeta
        title="AI Agent for Lead Generation — Vyostra AI"
        description="Capture leads 24/7 with an AI agent trained on your business data. No code required. Set up in under 5 minutes."
        path="/features/chatbot/"
      />
      <StructuredData data={jsonLdGraph([...featurePageNodes(PAGE), faqPageSchema(CHAT_AGENT_FAQ)])} />
      <UseCaseLayout
        featurePath="/features/chatbot"
        badge="AI AGENT"
        headline="An AI chat agent that answers visitors and captures leads"
        subheadline="The Vyostra AI chat agent is a chat widget for your website, trained on your own site content and knowledge base. It answers visitors’ questions at any hour, asks for their contact details once they are engaged, and saves each lead with its transcript in the built-in lead CRM."
        howItWorksHeading="How does the Vyostra AI chat agent work?"
        benefitsHeading="Why put an AI chat agent on your website?"
        heroVisual={<ChatWidgetMockup />}
        howItWorksSteps={[
          {
            number: '1',
            title: 'Create Your Bot',
            body: 'Enter your website URL. Vyostra AI reads your content and trains your AI agent automatically. No prompts, no configuration needed.',
            icon: <Bot className="w-6 h-6" />,
          },
          {
            number: '2',
            title: 'Embed One Line of Code',
            body: 'Copy a single script tag and paste it on your website. The chat widget appears instantly. Works on any platform — WordPress, Webflow, custom HTML.',
            icon: <Code className="w-6 h-6" />,
          },
          {
            number: '3',
            title: 'Watch Leads Come In',
            body: 'Your agent qualifies visitors, captures their details, and stores every lead in your dashboard automatically. You get notified instantly.',
            icon: <Users className="w-6 h-6" />,
          },
        ]}
        benefits={[
          {
            icon: <Brain className="w-5 h-5" />,
            title: 'Trained on Your Content',
            body: 'Vyostra AI reads your website, FAQs, and product pages to build a knowledge base automatically. The agent answers only from that content, and says so when the answer is not there.',
          },
          {
            icon: <Clock className="w-5 h-5" />,
            title: 'Captures Leads 24/7',
            body: 'Your agent never sleeps. It engages visitors at 2am on a Sunday and captures their details just as effectively as during business hours.',
          },
          {
            icon: <Zap className="w-5 h-5" />,
            title: 'Instant Lead Notifications',
            body: 'Every lead captured triggers an instant alert via WhatsApp. You know the moment someone shows interest — name, phone, and what they asked.',
          },
        ]}
        integrations={[
          { icon: <MessageSquare className="w-4 h-4" />, title: 'WhatsApp Notifications', href: '/features/whatsapp' },
          { icon: <CrmIcon className="w-4 h-4" />, title: 'Lead CRM', href: '/features/crm' },
          { icon: <FileText className="w-4 h-4" />, title: 'Form Builder', href: '/features/forms' },
        ]}
        faq={{ heading: 'What do people ask about the Vyostra AI chat agent?', items: CHAT_AGENT_FAQ }}
        ctaHeadline="Ready to capture leads on autopilot?"
        ctaBody="Set up your AI agent in under 5 minutes. No code required. No credit card needed."
      />
    </>
  )
}
