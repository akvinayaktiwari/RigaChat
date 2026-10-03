import { META_LEAD_ADS } from './meta-lead-ads'
import type { IntegrationContent } from './types'

/**
 * Shipped integrations only. One that is merely planned does not get a page.
 * Zoho CRM and WhatsApp are shipped too, but each already has a feature page,
 * so the integrations index links there rather than publishing a second page
 * that says the same thing under the same title.
 */
export const INTEGRATIONS: readonly IntegrationContent[] = [META_LEAD_ADS]

export function integrationPath(integration: IntegrationContent): string {
  return `/integrations/${integration.slug}/`
}

export function getIntegrationBySlug(slug: string | undefined): IntegrationContent | undefined {
  return INTEGRATIONS.find((integration) => integration.slug === slug)
}
