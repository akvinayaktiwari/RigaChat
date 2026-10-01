import { Link } from 'react-router-dom'
import FaqList from '../components/landing/FaqList'
import MarketingPageShell from '../components/landing/MarketingPageShell'
import { WHAT_IS_VYOSTRA } from '../components/landing/WhatIsVyostra'
import PageMeta from '../components/seo/PageMeta'
import StructuredData from '../components/seo/StructuredData'
import { pricingSummary } from '../lib/pricing-copy'
import { PRICING_TIERS } from '../lib/pricingTiers'
import { faqPageSchema, jsonLdGraph, organizationSchema, pageGraphNodes, type FaqItem } from '../lib/structured-data'

interface FaqSection {
  /** Section heading, phrased the way people ask it. */
  heading: string
  items: FaqItem[]
}

/**
 * The questions people ask before signing up. /help answers the ones asked
 * after: how to do a thing inside the dashboard.
 *
 * Every answer has to be true of the shipped product and already said somewhere
 * on the site (the homepage definition, a feature page, the help center). An
 * answer engine quotes these as fact, so a hopeful one is a wrong one.
 */
export const FAQ_SECTIONS: FaqSection[] = [
  {
    heading: 'What is Vyostra AI, and what does it do?',
    items: [
      { question: 'What is Vyostra AI?', answer: WHAT_IS_VYOSTRA[0] ?? '' },
      {
        question: 'Which channels does Vyostra AI answer on?',
        answer:
          'Vyostra AI answers on website chat, on-page voice and WhatsApp. Leads from lead forms and Meta lead ads arrive in the same lead CRM. The voice agent is an add-on that is enabled per account.',
      },
      {
        question: 'Does the Vyostra AI agent make up answers?',
        answer:
          'It is built not to. The agent answers only from the content you give it: your website and the knowledge base entries you add. When the answer is not there, it says so instead of guessing.',
      },
      {
        question: 'Does the Vyostra AI voice agent need a phone number?',
        answer:
          'No. The Vyostra AI voice agent runs inside your web page: the visitor taps a button and speaks through their browser, so there is no number to buy, no app to install and no call charge.',
      },
    ],
  },
  {
    heading: 'How do you set Vyostra AI up?',
    items: [
      {
        question: 'How does Vyostra AI learn about my business?',
        answer:
          'You enter your website URL, and Vyostra AI reads the site and builds a knowledge base from it automatically. You can also add your own knowledge base entries by hand.',
      },
      {
        question: 'Do I need to write code to install Vyostra AI?',
        answer:
          'No. You copy one script tag and paste it before the closing body tag of your website, and the chat widget appears. It works on WordPress, Webflow and custom HTML sites.',
      },
      {
        question: 'How long does it take to set up a Vyostra AI agent?',
        answer:
          'Under 5 minutes for a first agent. You enter your website URL, Vyostra AI trains the agent on it, and you paste the embed code into your site.',
      },
    ],
  },
  {
    heading: 'What happens to the leads Vyostra AI captures?',
    items: [
      {
        question: 'Where do captured leads go?',
        answer:
          'Every lead goes into the built-in lead CRM in your Vyostra AI dashboard, with its conversation transcript. You can filter leads by date, source and status, and sync them to Zoho CRM.',
      },
      {
        question: 'How will I know when a new lead arrives?',
        answer:
          'Vyostra AI sends a WhatsApp message to your number the moment a lead is captured. You connect a Gupshup account and switch on Lead Notifications to enable it.',
      },
      {
        question: 'Does Vyostra AI follow up with leads on WhatsApp?',
        answer:
          'Yes. A follow-up journey messages a new lead on WhatsApp, waits for a real reply rather than firing on a timer, and hands the lead to your team when it needs a person.',
      },
    ],
  },
  {
    heading: 'What does Vyostra AI cost?',
    items: [
      { question: 'How much does Vyostra AI cost per month?', answer: `${pricingSummary(PRICING_TIERS)} Plans are billed monthly.` },
      {
        question: 'Can I try Vyostra AI before paying?',
        answer: 'Yes. Every new Vyostra AI account starts with a 14-day free trial, and no credit card is needed to begin.',
      },
    ],
  },
]

const ALL_QUESTIONS: FaqItem[] = FAQ_SECTIONS.flatMap((section) => section.items)

const PAGE = { name: 'FAQ', path: '/faq/' }

const LINK = 'font-semibold text-primary hover:underline'

export default function Faq() {
  return (
    <>
      <PageMeta
        title="Vyostra AI FAQ — Setup, Leads, WhatsApp and Pricing"
        description="Direct answers about Vyostra AI: what it is, how the agent is trained, where leads go, WhatsApp follow-up, the voice agent, pricing and the free trial."
        path="/faq/"
      />
      <StructuredData data={jsonLdGraph([organizationSchema(), ...pageGraphNodes(PAGE), faqPageSchema(ALL_QUESTIONS)])} />
      <MarketingPageShell
        badge="FAQ"
        headline="Vyostra AI: frequently asked questions"
        lead="Vyostra AI is a lead-capture platform: an AI agent trained on your website answers visitors on chat, voice and WhatsApp, and writes each lead into a built-in CRM. These are the questions people ask before signing up, from how setup works to what it costs."
      >
        <div className="max-w-3xl mx-auto space-y-16">
          {FAQ_SECTIONS.map((section) => (
            <section key={section.heading}>
              <h2 className="text-2xl md:text-3xl font-extrabold text-on-surface tracking-tight mb-6">{section.heading}</h2>
              <FaqList items={section.items} />
            </section>
          ))}

          <p className="text-sm md:text-base text-on-surface-variant leading-relaxed">
            Plan details are on the{' '}
            <Link to="/pricing" className={LINK}>
              pricing page
            </Link>
            . Already a customer? The{' '}
            <Link to="/help" className={LINK}>
              Help Center
            </Link>{' '}
            covers setup inside the dashboard.
          </p>
        </div>
      </MarketingPageShell>
    </>
  )
}
