import { Link } from 'react-router-dom'
import FaqList from '../../components/landing/FaqList'
import MarketingPageShell from '../../components/landing/MarketingPageShell'
import PageMeta from '../../components/seo/PageMeta'
import StructuredData from '../../components/seo/StructuredData'
import { integrationPath } from '../../content/integrations/registry'
import type { IntegrationContent } from '../../content/integrations/types'
import { faqPageSchema, integrationPageNodes, jsonLdGraph, organizationSchema } from '../../lib/structured-data'

const SECTION = 'max-w-3xl mx-auto mb-20'
const SECTION_HEADING = 'text-3xl md:text-4xl font-extrabold text-on-surface tracking-tight text-center mb-10'
const CARD = 'rounded-2xl border border-outline-variant/30 bg-white p-6 shadow-xs'

function SetupSteps({ setup }: { setup: IntegrationContent['setup'] }) {
  return (
    <section className="max-w-5xl mx-auto mb-20">
      <h2 className={SECTION_HEADING}>{setup.heading}</h2>
      <ol className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {setup.steps.map((step, index) => (
          <li key={step.title} className={CARD}>
            <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-base font-black text-white" aria-hidden="true">
              {index + 1}
            </span>
            <h3 className="font-bold text-on-surface text-base mb-2">{step.title}</h3>
            <p className="text-sm text-on-surface-variant leading-relaxed">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

function PointList({ heading, points }: { heading: string; points: readonly string[] }) {
  return (
    <section className={SECTION}>
      <h2 className={SECTION_HEADING}>{heading}</h2>
      <ul className={`${CARD} space-y-3 list-disc pl-10 text-base text-on-surface-variant leading-relaxed marker:text-primary`}>
        {points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </section>
  )
}

function MappingTable({ mapping }: { mapping: NonNullable<IntegrationContent['mapping']> }) {
  return (
    <section className={SECTION}>
      <h2 className={SECTION_HEADING}>{mapping.heading}</h2>
      <div className="overflow-x-auto rounded-2xl border border-outline-variant/30 bg-white shadow-xs">
        <table className="w-full border-collapse text-left text-sm md:text-base">
          <thead>
            <tr className="border-b border-outline-variant/30 bg-surface-container-low">
              <th scope="col" className="px-5 py-3 font-bold text-on-surface">{mapping.fromLabel}</th>
              <th scope="col" className="px-5 py-3 font-bold text-on-surface">{mapping.toLabel}</th>
            </tr>
          </thead>
          <tbody>
            {mapping.rows.map((row) => (
              <tr key={row.to} className="border-b border-outline-variant/20 last:border-b-0">
                <td className="px-5 py-3 text-on-surface-variant">{row.from}</td>
                <td className="px-5 py-3 font-semibold text-on-surface">{row.to}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {mapping.note ? <p className="mt-4 text-sm text-on-surface-variant leading-relaxed">{mapping.note}</p> : null}
    </section>
  )
}

function StartSection({ name }: { name: string }) {
  return (
    <section className="max-w-3xl mx-auto mt-20 rounded-3xl bg-on-surface p-10 text-center text-white">
      <h2 className="text-2xl md:text-3xl font-extrabold mb-4">Ready to connect {name}?</h2>
      <p className="text-white/80 leading-relaxed mb-8">Start a 14-day free trial with no credit card, then connect {name} from your dashboard.</p>
      <div className="flex flex-wrap justify-center gap-4">
        <Link to="/signup" className="inline-flex items-center justify-center rounded-xl bg-primary px-8 py-4 font-bold text-white hover:opacity-95 transition-opacity">
          Start free trial
        </Link>
        <Link to="/integrations" className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-8 py-4 font-bold text-white hover:bg-white/20 transition-colors">
          All integrations
        </Link>
      </div>
    </section>
  )
}

/**
 * One integration, rendered from its content file. A new page is a content
 * file, an entry in content/integrations/registry.ts and a <Route> in App.tsx;
 * crawl-files.test.ts fails if the route is missing.
 */
export default function IntegrationPage({ integration }: { integration: IntegrationContent }) {
  const path = integrationPath(integration)

  return (
    <>
      <PageMeta title={integration.title} description={integration.description} path={path} />
      <StructuredData data={jsonLdGraph([organizationSchema(), ...integrationPageNodes({ name: integration.name, path }), faqPageSchema(integration.faq)])} />
      <MarketingPageShell badge="INTEGRATION" headline={integration.headline} lead={integration.lead}>
        <SetupSteps setup={integration.setup} />
        <PointList heading={integration.flow.heading} points={integration.flow.points} />
        {integration.mapping ? <MappingTable mapping={integration.mapping} /> : null}
        <PointList heading={integration.limits.heading} points={integration.limits.points} />
        <section className="max-w-3xl mx-auto">
          <h2 className={SECTION_HEADING}>What do people ask about the {integration.name} integration?</h2>
          <FaqList items={integration.faq} />
        </section>
        <StartSection name={integration.name} />
      </MarketingPageShell>
    </>
  )
}
