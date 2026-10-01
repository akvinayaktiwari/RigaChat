import PageMeta from '../../components/seo/PageMeta'
import StructuredData from '../../components/seo/StructuredData'
import { SUPPORT_EMAIL, faqPageSchema, featurePageNodes, jsonLdGraph, type FaqItem } from '../../lib/structured-data'
import { Bot, Code, Mic, MessageSquare, PhoneOff, Timer, UserCheck, Users as CrmIcon } from 'lucide-react'
import UseCaseLayout from '../../components/landing/UseCaseLayout'

/**
 * Rendered on the page and published as FAQPage from this one array.
 *
 * Every answer restates something the voice agent posts already say and the
 * widget already does. It does not say the agent answers a phone number: that
 * is not generally available, and this page is what an answer engine quotes.
 */
export const VOICE_AGENT_FAQ: FaqItem[] = [
  {
    question: 'Do visitors need a phone number or an app to use the voice agent?',
    answer:
      'No. The Vyostra AI voice agent runs inside your web page. A visitor taps a button and speaks through their browser, so there is no number to dial, no app to install and no call charge.',
  },
  {
    question: 'Which browsers does the voice agent work in?',
    answer:
      'It works in modern desktop, Android and iOS browsers, on pages served over HTTPS, once the visitor allows the microphone. The widget checks for the audio support it needs when the page loads and does not appear in a browser that lacks it.',
  },
  {
    question: 'What language does the voice agent speak?',
    answer:
      'The Vyostra AI voice agent is English-first today. Test it with the way your own customers speak, including names and numbers, before you launch.',
  },
  {
    question: 'What happens when a visitor asks for a person?',
    answer:
      'The voice agent has a handoff action. When a visitor asks for a person, shows buying intent, or asks something the knowledge base cannot answer, it alerts your team.',
  },
  {
    question: 'Is the voice agent included in every Vyostra AI plan?',
    answer: `No. The voice agent is an add-on that is enabled per account. Email ${SUPPORT_EMAIL} to switch it on.`,
  },
]

const PAGE = { name: 'AI Voice Agent', path: '/features/voice-agent/' }

function VoiceWidgetMockup() {
  return (
    <div className="bg-white rounded-2xl border border-outline-variant shadow-lg p-5 max-w-xs w-full">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-11 h-11 bg-primary text-white rounded-full flex items-center justify-center">
          <Mic className="w-5 h-5" />
        </div>
        <div>
          <p className="font-bold text-on-surface text-sm">Vyostra AI Voice Agent</p>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-xs text-on-surface-variant">Listening</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <p className="bg-primary text-white rounded-2xl rounded-tr-none p-3 text-xs ml-auto max-w-[85%]">
          &ldquo;Is the 3BHK ready to move in?&rdquo;
        </p>
        <p className="bg-surface-container-low rounded-2xl rounded-tl-none p-3 text-xs text-on-surface">
          &ldquo;Let me check that with the team for you. Shall I have someone call you back?&rdquo;
        </p>
      </div>

      <div className="mt-3">
        <span className="inline-flex items-center bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold rounded-full px-3 py-1">
          ✓ Team alerted
        </span>
      </div>
    </div>
  )
}

export default function VoiceAgent() {
  return (
    <>
      <PageMeta
        title="On-Page AI Voice Agent for Your Website — Vyostra AI"
        description="An AI voice agent that talks to visitors inside your web page, with no phone number and no app. It answers from your knowledge base and hands off to your team."
        path="/features/voice-agent/"
      />
      <StructuredData data={jsonLdGraph([...featurePageNodes(PAGE), faqPageSchema(VOICE_AGENT_FAQ)])} />
      <UseCaseLayout
        featurePath="/features/voice-agent"
        badge="AI VOICE AGENT"
        headline="An AI voice agent that answers on your web page"
        subheadline="The Vyostra AI voice agent is a spoken conversation inside your web page. A visitor taps a button, asks out loud, and the agent answers from your website content and knowledge base. There is no phone number to dial, no app to install and no call charge."
        heroVisual={<VoiceWidgetMockup />}
        howItWorksHeading="How does the Vyostra AI voice agent work?"
        benefitsHeading="Why add a voice agent to your web page?"
        howItWorksSteps={[
          {
            number: '1',
            title: 'Create a Voice Agent',
            body: 'Add a voice agent in your dashboard and give it a knowledge base: your website content and the entries you write yourself.',
            icon: <Bot className="w-6 h-6" />,
          },
          {
            number: '2',
            title: 'Embed One Script Tag',
            body: 'Paste one script tag on any page served over HTTPS. The talk button appears only in browsers that can run it.',
            icon: <Code className="w-6 h-6" />,
          },
          {
            number: '3',
            title: 'Visitors Tap and Talk',
            body: 'A visitor taps the button, allows the microphone and asks out loud. The agent answers in speech and alerts your team when the visitor needs a person.',
            icon: <Mic className="w-6 h-6" />,
          },
        ]}
        benefits={[
          {
            icon: <PhoneOff className="w-5 h-5" />,
            title: 'No Phone Number, No App',
            body: 'The conversation runs in the browser, over the connection the visitor already has. Nothing to dial, nothing to install, and no call charge on either side.',
          },
          {
            icon: <Timer className="w-5 h-5" />,
            title: 'Short Spoken Answers',
            body: 'The agent is instructed to answer in two or three sentences. A short reply starts sooner and is easier to follow by ear than a paragraph read aloud.',
          },
          {
            icon: <UserCheck className="w-5 h-5" />,
            title: 'Hands Over to a Person',
            body: 'When a visitor asks for a human, shows buying intent, or asks something the knowledge base cannot answer, the agent alerts your team instead of improvising.',
          },
        ]}
        integrations={[
          { icon: <Bot className="w-4 h-4" />, title: 'AI Chat Agent', href: '/features/chatbot' },
          { icon: <MessageSquare className="w-4 h-4" />, title: 'WhatsApp Automation', href: '/features/whatsapp' },
          { icon: <CrmIcon className="w-4 h-4" />, title: 'Lead CRM', href: '/features/crm' },
        ]}
        faq={{ heading: 'What do people ask about the Vyostra AI voice agent?', items: VOICE_AGENT_FAQ }}
        ctaHeadline="Want visitors to talk to your site?"
        ctaBody="The voice agent is an add-on, enabled per account. Start your free trial, then contact us to switch voice on."
      />
    </>
  )
}
