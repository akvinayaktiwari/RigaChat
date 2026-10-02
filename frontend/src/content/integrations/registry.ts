import { META_LEAD_ADS } from './meta-lead-ads'
import type { IntegrationContent } from './types'
import { ZOHO_CRM } from './zoho-crm'

/** Shipped integrations only. One that is merely planned does not get a page. */
export const INTEGRATIONS: readonly IntegrationContent[] = [META_LEAD_ADS, ZOHO_CRM]

export function integrationPath(integration: IntegrationContent): string {
  return `/integrations/${integration.slug}/`
}

export function getIntegrationBySlug(slug: string | undefined): IntegrationContent | undefined {
  return INTEGRATIONS.find((integration) => integration.slug === slug)
}
