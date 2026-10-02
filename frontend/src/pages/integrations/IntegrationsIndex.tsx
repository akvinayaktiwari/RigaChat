import { Link } from 'react-router-dom'
import MarketingPageShell from '../../components/landing/MarketingPageShell'
import PageMeta from '../../components/seo/PageMeta'
import StructuredData from '../../components/seo/StructuredData'
import { INTEGRATIONS, integrationPath } from '../../content/integrations/registry'
import { integrationsIndexNodes, jsonLdGraph, organizationSchema } from '../../lib/structured-data'

const CARD = 'block rounded-2xl border border-outline-variant/30 bg-white p-6 shadow-xs hover:border-primary/40 hover:shadow-md transition-all'

/** WhatsApp is connected from the product too, but its page is the feature page, not a second page saying the same thing. */
const WHATSAPP = {
  name: 'WhatsApp',
  summary: 'An instant WhatsApp alert for every new lead, a weekly summary, and follow-up journeys.',
  path: '/features/whatsapp',
}

function IntegrationCard({ name, summary, to }: { name: string; summary: string; to: string }) {
  return (
    <Link to={to} className={CARD}>
      <h3 className="font-bold text-on-surface text-lg mb-2">{name}</h3>
      <p className="text-sm md:text-base text-on-surface-variant leading-relaxed">{summary}</p>
    </Link>
  )
}

export default function IntegrationsIndex() {
  return (
    <>
      <PageMeta
        title="Vyostra AI Integrations — Meta Lead Ads, Zoho CRM"
        description="The tools Vyostra AI connects to today: Meta Lead Ads, Zoho CRM and WhatsApp. What each connection does and how to set it up."
        path="/integrations/"
      />
      <StructuredData data={jsonLdGraph([organizationSchema(), ...integrationsIndexNodes()])} />
      <MarketingPageShell
        badge="INTEGRATIONS"
        headline="Vyostra AI integrations"
        lead="Vyostra AI connects to Meta Lead Ads, Zoho CRM and WhatsApp today. Meta Lead Ads brings the leads from your ads into the lead CRM as they are submitted, Zoho CRM receives leads from your forms and ads, and WhatsApp carries your lead alerts and follow-up. Each page below says exactly what the connection does and where it stops."
      >
        <section className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-extrabold text-on-surface tracking-tight text-center mb-10">Which tools does Vyostra AI connect to?</h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {INTEGRATIONS.map((integration) => (
              <IntegrationCard key={integration.slug} name={integration.name} summary={integration.summary} to={integrationPath(integration).replace(/\/$/, '')} />
            ))}
            <IntegrationCard name={WHATSAPP.name} summary={WHATSAPP.summary} to={WHATSAPP.path} />
          </div>
        </section>
      </MarketingPageShell>
    </>
  )
}
