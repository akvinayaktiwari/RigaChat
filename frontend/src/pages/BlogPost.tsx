import { Suspense, lazy, useMemo, useState, type ComponentType } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import Navbar from '../components/landing/Navbar'
import Footer from '../components/landing/Footer'
import DemoModal from '../components/landing/modals/DemoModal'
import { getPostBySlug } from '../content/blog/registry'
import { AttachmentCard, BlogSurface, PostMetaLine, PostTags } from '../components/blog/BlogChrome'
import { JAKARTA_FONT, ScrollReveal, StatRow, StatTile } from '../components/blog/BlogPrimitives'

const SITE_URL = 'https://vyostra.com'

function BackToBlog() {
  return (
    <Link
      to="/blog"
      className="inline-flex items-center gap-2 text-sm font-medium text-white/50 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-300"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      All posts
    </Link>
  )
}

function PostBodyFallback() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading article">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-4 animate-pulse rounded bg-white/[0.06]" style={{ width: `${100 - i * 8}%` }} />
      ))}
    </div>
  )
}

function PostNotFound() {
  const [isDemoOpen, setIsDemoOpen] = useState(false)

  return (
    <div className="landing-page bg-background">
      <Helmet>
        <title>Post not found — BeepBoop</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <Navbar onOpenDemo={() => setIsDemoOpen(true)} />
      <BlogSurface>
        <main className="mx-auto max-w-3xl px-6 pb-32 pt-40 text-center lg:px-8">
          <h1 className="text-3xl font-extrabold text-white md:text-4xl" style={JAKARTA_FONT}>
            We couldn't find that post
          </h1>
          <p className="mt-4 text-white/55">It may have been moved or renamed.</p>
          <div className="mt-8 flex justify-center">
            <BackToBlog />
          </div>
        </main>
      </BlogSurface>
      <Footer />
      <DemoModal isOpen={isDemoOpen} onClose={() => setIsDemoOpen(false)} />
    </div>
  )
}

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>()
  const [isDemoOpen, setIsDemoOpen] = useState(false)
  const post = slug ? getPostBySlug(slug) : undefined

  // Keyed on slug so navigating between posts swaps the lazy component
  // instead of reusing the previously resolved one.
  const Content = useMemo<ComponentType | null>(() => {
    if (!post) return null
    return lazy(post.loadContent)
  }, [post])

  if (!post || !Content) {
    return <PostNotFound />
  }

  const { meta } = post
  const canonical = `${SITE_URL}/blog/${meta.slug}`

  return (
    <div className="landing-page bg-background">
      <Helmet>
        <title>{`${meta.title} — BeepBoop`}</title>
        <meta name="description" content={meta.excerpt} />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={meta.title} />
        <meta property="og:description" content={meta.excerpt} />
        <meta property="og:url" content={canonical} />
        <meta property="article:published_time" content={meta.publishedAt} />
        {meta.tags.map((tag) => (
          <meta property="article:tag" content={tag} key={tag} />
        ))}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={meta.title} />
        <meta name="twitter:description" content={meta.excerpt} />
      </Helmet>

      <Navbar onOpenDemo={() => setIsDemoOpen(true)} />

      <BlogSurface>
        <article className="mx-auto max-w-4xl px-6 pb-24 pt-36 lg:px-8">
          <header>
            <ScrollReveal>
              <BackToBlog />
              <div className="mt-6 text-[11px] font-bold uppercase tracking-[0.2em] text-violet-300">{meta.category}</div>
              <h1 className="mt-4 text-3xl font-extrabold leading-[1.12] text-white md:text-5xl" style={JAKARTA_FONT}>
                {meta.title}
              </h1>
              <p className="mt-6 max-w-3xl text-base leading-relaxed text-white/60 md:text-lg">{meta.excerpt}</p>
              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
                <PostMetaLine meta={meta} />
                <PostTags tags={meta.tags} />
              </div>
            </ScrollReveal>

            {meta.highlights?.length ? (
              <ScrollReveal delay={0.05}>
                <div className="mt-10">
                  <StatRow>
                    {meta.highlights.map((highlight, index) => (
                      <StatTile key={highlight.label} value={highlight.value} label={highlight.label} accent={index % 2 === 1 ? 'cyan' : 'violet'} />
                    ))}
                  </StatRow>
                </div>
              </ScrollReveal>
            ) : null}

            {meta.attachment ? (
              <ScrollReveal delay={0.1}>
                <div className="mt-8">
                  <AttachmentCard attachment={meta.attachment} />
                </div>
              </ScrollReveal>
            ) : null}
          </header>

          <hr className="my-14 border-white/10" />

          <div className="blog-body">
            <Suspense fallback={<PostBodyFallback />}>
              <Content />
            </Suspense>
          </div>

          {meta.attachment ? (
            <div className="mt-20">
              <h2 className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-white/40">Take the full model with you</h2>
              <AttachmentCard attachment={meta.attachment} variant="compact" />
            </div>
          ) : null}

          <div className="mt-16 border-t border-white/10 pt-8">
            <BackToBlog />
          </div>
        </article>
      </BlogSurface>

      <Footer />
      <DemoModal isOpen={isDemoOpen} onClose={() => setIsDemoOpen(false)} />
    </div>
  )
}
