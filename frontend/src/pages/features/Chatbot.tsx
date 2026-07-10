import { Helmet } from 'react-helmet-async'
import { Bot, Code, Users, Brain, Clock, Zap, MessageSquare, Users as CrmIcon, FileText } from 'lucide-react'
import UseCaseLayout from '../../components/landing/UseCaseLayout'

function ChatWidgetMockup() {
  return (
    <div className="bg-white rounded-2xl border border-outline-variant shadow-lg p-4 max-w-xs w-full">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-9 h-9 bg-primary text-white rounded-xl flex items-center justify-center">
          <Bot className="w-5 h-5" />
        </div>
        <div>
          <p className="font-bold text-on-surface text-sm">BeepBoop Assistant</p>
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
          I'm looking for a 3BHK apartment
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
      <Helmet>
        <title>AI Chatbot for Lead Generation — BeepBoop</title>
        <meta
          name="description"
          content="Capture leads 24/7 with an AI chatbot trained on your business data. No code required. Set up in under 5 minutes."
        />
      </Helmet>
      <UseCaseLayout
        badge="AI CHATBOT"
        headline="Your 24/7 AI sales assistant"
        subheadline="BeepBoop's AI chatbot engages every visitor, answers their questions, and captures their contact details automatically — even when you are not there."
        heroVisual={<ChatWidgetMockup />}
        howItWorksSteps={[
          {
            number: '1',
            title: 'Create Your Bot',
            body: 'Enter your website URL. BeepBoop reads your content and trains your AI chatbot automatically. No prompts, no configuration needed.',
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
            body: 'Your chatbot qualifies visitors, captures their details, and stores every lead in your dashboard automatically. You get notified instantly.',
            icon: <Users className="w-6 h-6" />,
          },
        ]}
        benefits={[
          {
            icon: <Brain className="w-5 h-5" />,
            title: 'Trained on Your Content',
            body: 'BeepBoop reads your website, FAQs, and product pages to build a knowledge base automatically. Answers are always accurate and on-brand.',
          },
          {
            icon: <Clock className="w-5 h-5" />,
            title: 'Captures Leads 24/7',
            body: 'Your chatbot never sleeps. It engages visitors at 2am on a Sunday and captures their details just as effectively as during business hours.',
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
        ctaHeadline="Ready to capture leads on autopilot?"
        ctaBody="Set up your AI chatbot in under 5 minutes. No code required. No credit card needed."
      />
    </>
  )
}
