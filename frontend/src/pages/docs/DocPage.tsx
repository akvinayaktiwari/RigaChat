import { Suspense, lazy, useMemo, type ComponentType } from 'react'
import { MDXProvider } from '@mdx-js/react'
import { Helmet } from 'react-helmet-async'
import { Link, useParams } from 'react-router-dom'
import DocsLayout from '../../components/docs/DocsLayout'
import { docsMdxComponents } from '../../components/docs/DocsMdxComponents'
import FaqList from '../../components/landing/FaqList'
import PageMeta from '../../components/seo/PageMeta'
import StructuredData from '../../components/seo/StructuredData'
import { adjacentDocs, getDocBySlug, loadedDocContent } from '../../content/docs/registry'
import { PEOPLE } from '../../lib/people'
import { breadcrumbSchema, faqPageSchema, jsonLdGraph, organizationSchema, techArticleSchema } from '../../lib/structured-data'
import type { DocMeta, DocPage as DocPageRecord } from '../../types/docs'

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function DocNotFound() {
  return (
    <DocsLayout>
      <Helmet>
        <title>Page not found | Vyostra AI docs</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <h1 className="text-3xl font-extrabold text-on-surface">We couldn't find that page</h1>
      <p className="mt-4 text-on-surface-variant">
        It may have been moved or renamed. <Link to="/docs/" className="font-medium text-primary underline">Go to the docs overview</Link>.
      </p>
    </DocsLayout>
  )
}

function BodyFallback() {
  return (
    <div className="mt-8 space-y-4" role="status" aria-label="Loading page">
      {[100, 92, 84, 76].map((width) => (
        <div key={width} className="h-4 animate-pulse rounded bg-on-surface/[0.06]" style={{ width: `${width}%` }} />
      ))}
    </div>
  )
}

/** The byline. Dates are on the page because the schema states them, and schema may only say what the page shows. */
function DocByline({ meta }: { meta: DocMeta }) {
  const author = PEOPLE[meta.authorId]

  return (
    <p className="mt-5 text-sm text-on-surface/60">
      By {author.name}, {author.role}. Published <time dateTime={meta.publishedAt}>{formatDate(meta.publishedAt)}</time>
      {meta.updatedAt ? (
        <>
          , updated <time dateTime={meta.updatedAt}>{formatDate(meta.updatedAt)}</time>
        </>
      ) : null}
      .
    </p>
  )
}

function AdjacentLinks({ slug }: { slug: string }) {
  const { previous, next } = adjacentDocs(slug)
  const linkClass = 'block rounded-2xl border border-outline-variant/30 bg-white p-5 transition-colors hover:border-primary/50'

  return (
    <nav aria-label="More documentation" className="mt-16 grid grid-cols-1 gap-4 md:grid-cols-2">
      {previous ? (
        <Link to={`/docs/${previous.slug}/`} className={linkClass}>
          <span className="text-xs font-bold uppercase tracking-widest text-on-surface/50">Previous</span>
          <span className="mt-1 block font-bold text-on-surface">{previous.title}</span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link to={`/docs/${next.slug}/`} className={`${linkClass} md:text-right`}>
          <span className="text-xs font-bold uppercase tracking-widest text-on-surface/50">Next</span>
          <span className="mt-1 block font-bold text-on-surface">{next.title}</span>
        </Link>
      ) : null}
    </nav>
  )
}

function DocSchema({ meta, path }: { meta: DocMeta; path: string }) {
  return (
    <StructuredData
      data={jsonLdGraph([
        organizationSchema(),
        techArticleSchema({ title: meta.title, description: meta.description, publishedAt: meta.publishedAt, updatedAt: meta.updatedAt, path, author: PEOPLE[meta.authorId] }),
        breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Docs', path: '/docs/' },
          { name: meta.title, path },
        ]),
        ...(meta.faq?.length ? [faqPageSchema(meta.faq)] : []),
      ])}
    />
  )
}

function DocArticle({ doc }: { doc: DocPageRecord }) {
  const { meta } = doc
  // Trailing slash: the prerendered page is served from docs/<slug>/index.html.
  const path = `/docs/${meta.slug}/`

  // Keyed on the page so navigating between pages swaps the lazy component.
  // A body preloaded before hydration renders directly; see preloadDocContent().
  const Content = useMemo<ComponentType>(() => loadedDocContent(meta.slug) ?? lazy(doc.loadContent), [doc, meta.slug])

  return (
    <DocsLayout currentSlug={meta.slug}>
      <PageMeta title={`${meta.metaTitle ?? meta.title} | Vyostra AI Docs`} description={meta.description} path={path} type="article" />
      <DocSchema meta={meta} path={path} />

      <article>
        <p className="text-xs font-bold uppercase tracking-widest text-primary">{meta.section}</p>
        <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight text-on-surface md:text-5xl">{meta.title}</h1>
        <p className="mt-5 text-base leading-relaxed text-on-surface-variant md:text-lg">{meta.lead}</p>
        <DocByline meta={meta} />

        <div className="mt-10">
          <MDXProvider components={docsMdxComponents}>
            <Suspense fallback={<BodyFallback />}>
              <Content />
            </Suspense>
          </MDXProvider>
        </div>

        {meta.faq?.length ? (
          <section className="mt-14">
            <h2 className="mb-6 text-2xl font-extrabold tracking-tight text-on-surface md:text-3xl">Common questions</h2>
            <FaqList items={meta.faq} />
          </section>
        ) : null}
      </article>

      <AdjacentLinks slug={meta.slug} />
    </DocsLayout>
  )
}

export default function DocPage() {
  const { slug } = useParams<{ slug: string }>()
  const doc = slug ? getDocBySlug(slug) : undefined
  return doc ? <DocArticle doc={doc} /> : <DocNotFound />
}
