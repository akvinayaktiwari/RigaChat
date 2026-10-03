import type { FaqItem } from '../../lib/structured-data'

export interface IntegrationStep {
  title: string
  body: string
}

/** One row of a "what goes where" table. */
export interface IntegrationMapping {
  from: string
  to: string
}

export interface IntegrationContent {
  /** URL segment under /integrations/. */
  slug: string
  /** The other product's name, as its owner writes it. */
  name: string
  /** One line for the integrations index and llms.txt. */
  summary: string
  /** <title>, 60 characters or fewer. */
  title: string
  description: string
  /** The page's H1. */
  headline: string
  /** The direct answer the page opens with, 40 to 70 words, naming Vyostra AI. */
  lead: string
  setup: { heading: string; steps: readonly IntegrationStep[] }
  /** What happens to each lead, in order. */
  flow: { heading: string; points: readonly string[] }
  /** A table of what is sent where. Omitted when the integration has no field mapping to show. */
  mapping?: { heading: string; fromLabel: string; toLabel: string; rows: readonly IntegrationMapping[]; note?: string }
  /** Limits a buyer should know before connecting. Stated plainly: a limit found after signing up costs more than one read here. */
  limits: { heading: string; points: readonly string[] }
  faq: readonly FaqItem[]
  /** YYYY-MM-DD of the last real change to this content. */
  lastModified: string
}
