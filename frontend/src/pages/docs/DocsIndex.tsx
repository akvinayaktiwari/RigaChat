import { Link } from 'react-router-dom'
import DocsLayout from '../../components/docs/DocsLayout'
import PageMeta from '../../components/seo/PageMeta'
import StructuredData from '../../components/seo/StructuredData'
import { docsBySection } from '../../content/docs/registry'
import { breadcrumbSchema, jsonLdGraph, organizationSchema } from '../../lib/structured-data'

export const DOCS_INDEX_TITLE = 'Vyostra AI developer docs'

/**
 * The answer the index opens with. Exported because llms.txt and the test that
 * keeps this page honest read the same sentence.
 */
export const DOCS_INDEX_LEAD =
  'The Vyostra AI API is a REST API that lets your own code read the leads, chatbots, forms and voice agents in your Vyostra AI account, and create lead forms. You authenticate with an API key, call HTTPS endpoints under /v1, and get JSON back. These docs cover the API and the script tags that embed each widget.'

export default function DocsIndex() {
  return (
    <DocsLayout>
      <PageMeta
        title="Developer Docs: Chatbot API and Widget Embeds | Vyostra AI"
        description="Developer documentation for Vyostra AI: the REST API for leads, chatbots, forms and voice agents, API keys, rate limits, and how to embed each widget."
        path="/docs/"
      />
      <StructuredData
        data={jsonLdGraph([
          organizationSchema(),
          breadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Docs', path: '/docs/' },
          ]),
        ])}
      />

      <p className="text-xs font-bold uppercase tracking-widest text-primary">Developers</p>
      <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight text-on-surface md:text-5xl">{DOCS_INDEX_TITLE}</h1>
      <p className="mt-5 text-base leading-relaxed text-on-surface-variant md:text-lg">{DOCS_INDEX_LEAD}</p>

      {docsBySection().map((group) => (
        <section key={group.section} className="mt-12">
          <h2 className="text-2xl font-extrabold tracking-tight text-on-surface">{group.section}</h2>
          <ul className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            {group.pages.map((page) => (
              <li key={page.slug}>
                <Link
                  to={`/docs/${page.slug}/`}
                  className="block h-full rounded-2xl border border-outline-variant/30 bg-white p-5 shadow-xs transition-colors hover:border-primary/50"
                >
                  <span className="block text-base font-bold text-on-surface">{page.title}</span>
                  <span className="mt-2 block text-sm leading-relaxed text-on-surface-variant">{page.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </DocsLayout>
  )
}
