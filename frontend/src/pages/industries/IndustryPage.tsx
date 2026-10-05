import { Link } from 'react-router-dom'
import FaqList from '../../components/landing/FaqList'
import MarketingPageShell from '../../components/landing/MarketingPageShell'
import RelatedPosts from '../../components/landing/RelatedPosts'
import PageMeta from '../../components/seo/PageMeta'
import StructuredData from '../../components/seo/StructuredData'
import { getPostBySlug } from '../../content/blog/registry'
import { industryPath } from '../../content/industries/registry'
import type { IndustryContent } from '../../content/industries/types'
import { faqPageSchema, jsonLdGraph, organizationSchema, pageGraphNodes } from '../../lib/structured-data'
import type { BlogPostMeta } from '../../types/blog'

const SECTION = 'max-w-3xl mx-auto mb-20'
const SECTION_HEADING = 'text-3xl md:text-4xl font-extrabold text-on-surface tracking-tight text-center mb-10'
const CARD = 'rounded-2xl border border-outline-variant/30 bg-white p-6 shadow-xs'

function QualifyingQuestions({ qualifying }: { qualifying: IndustryContent['qualifying'] }) {
  return (
    <section className={SECTION}>
      <h2 className={SECTION_HEADING}>{qualifying.heading}</h2>
      <ul className="space-y-4">
        {qualifying.questions.map((item) => (
          <li key={item.question} className={CARD}>
            <h3 className="font-bold text-on-surface text-base md:text-lg leading-snug">“{item.question}”</h3>
            <p className="mt-2 text-sm md:text-base text-on-surface-variant leading-relaxed">{item.why}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

function SampleFlow({ flow }: { flow: IndustryContent['sampleFlow'] }) {
  return (
    <section className="max-w-5xl mx-auto mb-20">
      <h2 className={SECTION_HEADING}>{flow.heading}</h2>
      <ol className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {flow.steps.map((step, index) => (
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

function Limits({ limits }: { limits: IndustryContent['limits'] }) {
  return (
    <section className={SECTION}>
      <h2 className={SECTION_HEADING}>{limits.heading}</h2>
      <ul className={`${CARD} space-y-3 list-disc pl-10 text-base text-on-surface-variant leading-relaxed marker:text-primary`}>
        {limits.points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </section>
  )
}

function StartSection() {
  return (
    <section className="max-w-3xl mx-auto mt-20 rounded-3xl bg-on-surface p-10 text-center text-white">
      <h2 className="text-2xl md:text-3xl font-extrabold mb-4">Ready to try it on your own project?</h2>
      <p className="text-white/80 leading-relaxed mb-8">Start a 14-day free trial with no credit card, and train the agent on your project page.</p>
      <div className="flex flex-wrap justify-center gap-4">
        <Link to="/signup" className="inline-flex items-center justify-center rounded-xl bg-primary px-8 py-4 font-bold text-white hover:opacity-95 transition-opacity">
          Start free trial
        </Link>
        <Link to="/features" className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-8 py-4 font-bold text-white hover:bg-white/20 transition-colors">
          All features
        </Link>
      </div>
    </section>
  )
}

function publishedPosts(slugs: readonly string[]): BlogPostMeta[] {
  return slugs.flatMap((slug) => {
    const post = getPostBySlug(slug)
    return post ? [post.meta] : []
  })
}

/**
 * One industry, rendered from its content file. A new page is a content file,
 * an entry in content/industries/registry.ts and a <Route> in App.tsx;
 * crawl-files.test.ts fails if the route is missing.
 */
export default function IndustryPage({ industry }: { industry: IndustryContent }) {
  const path = industryPath(industry)

  return (
    <>
      <PageMeta title={industry.title} description={industry.description} path={path} />
      <StructuredData data={jsonLdGraph([organizationSchema(), ...pageGraphNodes({ name: industry.headline, path }), faqPageSchema(industry.faqs)])} />
      <MarketingPageShell badge={industry.name.toUpperCase()} headline={industry.headline} lead={industry.answerFirstIntro}>
        <SampleFlow flow={industry.sampleFlow} />
        <QualifyingQuestions qualifying={industry.qualifying} />
        <Limits limits={industry.limits} />
        <section className={SECTION}>
          <h2 className={SECTION_HEADING}>What do {industry.name.toLowerCase()} teams ask about Vyostra AI?</h2>
          <FaqList items={industry.faqs} />
        </section>
        <RelatedPosts posts={publishedPosts(industry.relatedPosts)} heading="Go deeper" />
        <StartSection />
      </MarketingPageShell>
    </>
  )
}
