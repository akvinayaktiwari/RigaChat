import { Link } from 'react-router-dom'
import MarketingPageShell from '../components/landing/MarketingPageShell'
import PageMeta from '../components/seo/PageMeta'
import StructuredData from '../components/seo/StructuredData'
import { GLOSSARY_TERMS } from '../content/glossary'
import { glossaryPageNodes, jsonLdGraph, organizationSchema } from '../lib/structured-data'

const PAGE = { name: 'Glossary', path: '/glossary/' }

const LINK = 'font-semibold text-primary hover:underline'

/**
 * One definition per term, each under its own fragment so an answer engine or
 * a post can point at a single term. The schema is built from the same list
 * the page renders.
 */
export default function Glossary() {
  return (
    <>
      <PageMeta
        title="Glossary: AI Chatbot, WhatsApp and Lead Terms"
        description="Plain definitions of the terms used for AI chatbots, voice agents, WhatsApp Business messaging and lead management, from RAG to template messages."
        path={PAGE.path}
      />
      <StructuredData data={jsonLdGraph([organizationSchema(), ...glossaryPageNodes(PAGE, GLOSSARY_TERMS)])} />
      <MarketingPageShell
        badge="Glossary"
        headline="Glossary of AI chatbot, WhatsApp and lead terms"
        lead="Plain definitions of the words used around AI chatbots, voice agents, WhatsApp Business messaging and lead management. Each definition describes the term in general, not one product, and links to a longer article where Vyostra AI has written one."
      >
        <div className="max-w-3xl mx-auto">
          <div className="divide-y divide-outline-variant/30">
            {GLOSSARY_TERMS.map((entry) => (
              <section key={entry.id} id={entry.id} className="py-6 scroll-mt-32">
                <h2 className="text-xl md:text-2xl font-extrabold text-on-surface tracking-tight">{entry.term}</h2>
                <p className="mt-2 text-base text-on-surface-variant leading-relaxed">
                  {entry.definition}
                  {entry.link && (
                    <>
                      {' '}
                      Read more:{' '}
                      <Link to={entry.link.path} className={LINK}>
                        {entry.link.label}
                      </Link>
                    </>
                  )}
                </p>
              </section>
            ))}
          </div>
        </div>
      </MarketingPageShell>
    </>
  )
}
