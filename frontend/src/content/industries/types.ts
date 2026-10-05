import type { FaqItem } from '../../lib/structured-data'

/** One thing the agent asks a lead in this industry, and what the answer is for. */
export interface QualifyingQuestion {
  question: string
  why: string
}

export interface FlowStep {
  title: string
  body: string
}

/**
 * One industry page. Every field is required: a page that cannot fill one of
 * them from what the product does for that industry is a copy of another page
 * with a word swapped, and is not published.
 */
export interface IndustryContent {
  /** URL segment under /industries/. */
  slug: string
  /** The industry's name, as a breadcrumb and a link label. */
  name: string
  /** One line for llms.txt. */
  summary: string
  /** <title>, 60 characters or fewer. */
  title: string
  description: string
  /** The page's H1. */
  headline: string
  /** The direct answer the page opens with, 40 to 70 words, naming Vyostra AI. Unique to the industry. */
  answerFirstIntro: string
  qualifying: { heading: string; questions: readonly QualifyingQuestion[] }
  /** What happens to one lead, in order. */
  sampleFlow: { heading: string; steps: readonly FlowStep[] }
  /** What the agent leaves to a person. A buyer finds these out either here or after signing up. */
  limits: { heading: string; points: readonly string[] }
  faqs: readonly FaqItem[]
  /** Blog post slugs, shown as further reading. Each must be a published post. */
  relatedPosts: readonly string[]
  /** YYYY-MM-DD of the last real change to this content. */
  lastModified: string
}
