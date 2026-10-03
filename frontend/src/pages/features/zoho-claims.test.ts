import { describe, expect, it } from 'vitest'
import { STATIC_PAGES } from '../../lib/crawl-files'
import { FAQ_SECTIONS } from '../Faq'
import { HELP_ARTICLES } from '../Help'
import { CHAT_AGENT_FAQ } from './Chatbot'
import { LEAD_CRM_FAQ } from './Crm'
import { FORM_BUILDER_FAQ } from './Forms'
import { VOICE_AGENT_FAQ } from './VoiceAgent'
import { WHATSAPP_FAQ } from './WhatsApp'
import { ZOHO_CRM_FAQ } from './ZohoCrm'

/**
 * What reaches Zoho CRM is decided in backend/src/services/crm-service.ts:
 * only form-lead-service and meta-lead-service call it. Chat and voice leads
 * stay in the Vyostra AI CRM. The site said "every new lead" syncs from five
 * places, so any copy that says leads reach Zoho has to name the two sources
 * that really do, and must not name one that does not.
 *
 * This is a rule over the class of sentence rather than a list of the old
 * phrases: a list only catches an exact revert, and it passed while the
 * homepage still said "Syncs to Zoho." of a chat lead.
 */

const marketingSources: Record<string, string> = import.meta.glob<string>(
  [
    '../*.tsx',
    './*.tsx',
    '../../components/landing/**/*.tsx',
    '../integrations/*.tsx',
    '../../content/integrations/*.ts',
    '!../../content/integrations/*.test.*',
    '!../**/*.test.tsx',
    '!../../components/landing/**/*.test.tsx',
    '!../../components/landing/TestimonialsSection.tsx',
  ],
  { query: '?raw', import: 'default', eager: true },
)

/** Copy that says leads go to Zoho, as opposed to copy that only mentions Zoho. */
const SAYS_LEADS_REACH_ZOHO =
  /\b(?:sync(?:s|ed|ing)?|sent|send|pushed|created|arrives?|reach(?:es)?|lands?|goes|go|flows?)\b[^.]*\b(?:to|in|into|with) Zoho\b|\bZoho(?: CRM)? (?:gets|receives)\b/i

/** Lead sources that do not sync. A sync sentence that names one has to be saying so. */
const UNSYNCED_SOURCE = /\b(?:chat|voice|agents?|WhatsApp|calls?)\b/i

function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/)
}

/** Words that turn a short label into a claim about which leads sync. */
const SCOPE_WORD = /\b(?:every|all|chat|voice|agents?|WhatsApp|calls?)\b/i

/**
 * A short heading ("Sync to Zoho CRM") names a topic; it does not claim which
 * leads sync. One that says every lead, or names a source, does.
 */
function isTopicHeading(text: string): boolean {
  return !/[.!]$/.test(text) && text.split(/\s+/).length <= 5 && !SCOPE_WORD.test(text)
}

/** Why a piece of copy misstates the Zoho sync, or null when it is accurate or makes no sync claim. */
function overstatement(copy: string): string | null {
  // A question asks; it does not claim. Drop question sentences, keep the rest.
  const text = sentencesOf(copy).filter((sentence) => !sentence.endsWith('?')).join(' ')
  if (isTopicHeading(text) || !SAYS_LEADS_REACH_ZOHO.test(text)) return null
  if (!/\bforms?\b/i.test(text) || !/\bMeta lead ads?\b/i.test(text)) return 'does not name forms and Meta lead ads'
  const wrong = sentencesOf(text).find((s) => SAYS_LEADS_REACH_ZOHO.test(s) && UNSYNCED_SOURCE.test(s) && !/\bnot\b/i.test(s))
  return wrong ? `names a source that does not sync: "${wrong}"` : null
}

/** The text a TSX file can show: its string literals and the text between JSX tags. */
function copyIn(source: string): string[] {
  const literals = (source.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`[^`]*`/g) ?? []).map((quoted) => quoted.slice(1, -1))
  const jsxText = [...source.matchAll(/>([^<>{}]+)</g)].map((match) => match[1] ?? '')
  return [...literals, ...jsxText].map((text) => text.trim()).filter(Boolean)
}

interface PublishedAnswer {
  route: string
  question: string
  answer: string
}

function answersOn(route: string, items: readonly { question: string; answer: string }[]): PublishedAnswer[] {
  return items.map((item) => ({ route, question: item.question, answer: item.answer }))
}

/** Every answer the site publishes as FAQPage schema: these are what an answer engine quotes. */
const PUBLISHED_ANSWERS: PublishedAnswer[] = [
  ...answersOn('/faq', FAQ_SECTIONS.flatMap((section) => section.items)),
  ...answersOn('/help', HELP_ARTICLES),
  ...answersOn('/features/chatbot', CHAT_AGENT_FAQ),
  ...answersOn('/features/crm', LEAD_CRM_FAQ),
  ...answersOn('/features/forms', FORM_BUILDER_FAQ),
  ...answersOn('/features/voice-agent', VOICE_AGENT_FAQ),
  ...answersOn('/features/whatsapp', WHATSAPP_FAQ),
  ...answersOn('/features/zoho-crm', ZOHO_CRM_FAQ),
]

const SYNC_CLAIMS = PUBLISHED_ANSWERS.filter((published) => SAYS_LEADS_REACH_ZOHO.test(published.answer))

/** The pages whose llms.txt line says what syncs to Zoho. */
const ZOHO_SUMMARY_ROUTES = ['/features/crm', '/features/zoho-crm']

describe('the overstatement rule', () => {
  it.each([
    'Every field captured, with the full transcript and the page they came from. Syncs to Zoho.',
    'You connect Zoho once, and every new lead is then sent to Zoho automatically.',
    'Every lead, from chat, voice, forms and Meta lead ads, syncs to Zoho CRM automatically.',
    'Syncs every lead to Zoho',
    'Chat leads sync to Zoho',
    'Every lead lands in Zoho CRM automatically.',
    'Every chat lead syncs to Zoho. Want to try it?',
  ])('rejects: %s', (text) => {
    expect(overstatement(text)).not.toBeNull()
  })

  it.each([
    'New leads from your lead forms and Meta lead ads sync to Zoho automatically. Chat and voice leads stay in the Vyostra AI CRM.',
    'Leads from chat and voice are not sent to Zoho; form and Meta lead ad leads are.',
    'Which leads does Vyostra AI send to Zoho CRM?',
    'Sync to Zoho CRM',
  ])('accepts: %s', (text) => {
    expect(overstatement(text)).toBeNull()
  })
})

describe('Zoho sync claims in marketing copy', () => {
  it('finds the files it checks', () => {
    expect(Object.keys(marketingSources).length).toBeGreaterThan(10)
  })

  // The Zoho page makes the claim many times. If none is extracted, copyIn has
  // stopped reading the source and every check below passes with nothing to check.
  it('extracts the sync claims the Zoho page makes', () => {
    const zohoPage = Object.entries(marketingSources).find(([file]) => file.endsWith('/ZohoCrm.tsx'))?.[1] ?? ''
    expect(copyIn(zohoPage).filter((text) => SAYS_LEADS_REACH_ZOHO.test(text)).length).toBeGreaterThan(3)
  })

  it.each(Object.entries(marketingSources))('%s states the sync accurately wherever it mentions it', (_file, source) => {
    const wrong = copyIn(source).flatMap((text) => {
      const reason = overstatement(text)
      return reason ? [`${reason} -- ${text}`] : []
    })
    expect(wrong).toEqual([])
  })
})

describe('published answers about the Zoho sync', () => {
  // /faq, /help, the CRM page and the Zoho page each say it. A missing route
  // means the pattern stopped recognising the claim and the check below is idle.
  it('finds the answers it checks', () => {
    expect(new Set(SYNC_CLAIMS.map((claim) => claim.route))).toEqual(new Set(['/faq', '/help', '/features/crm', '/features/zoho-crm']))
  })

  it.each(SYNC_CLAIMS)('$route: $question states the sync accurately', ({ answer }) => {
    expect(overstatement(answer)).toBeNull()
  })

  // The page a buyer lands on to ask "does my chat lead reach Zoho?" has to answer no.
  it('says on the Zoho page that chat and voice leads are not sent', () => {
    const answers = ZOHO_CRM_FAQ.map((item) => item.answer)
    expect(answers.some((answer) => /\bchat\b/i.test(answer) && /\bvoice\b/i.test(answer) && /\bnot\b[^.]*\bZoho\b/i.test(answer))).toBe(true)
  })
})

describe('llms.txt lines about the Zoho sync', () => {
  it.each(ZOHO_SUMMARY_ROUTES)('%s states the sync accurately', (route) => {
    const summary = STATIC_PAGES.find((page) => page.route === route)?.summary ?? ''
    expect(summary).toMatch(SAYS_LEADS_REACH_ZOHO)
    expect(overstatement(summary)).toBeNull()
  })
})
