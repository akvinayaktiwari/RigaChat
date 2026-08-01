import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { ArrowRight, FileText } from 'lucide-react'
import Navbar from '../components/landing/Navbar'
import Footer from '../components/landing/Footer'
import DemoModal from '../components/landing/modals/DemoModal'
import { getAllPosts } from '../content/blog/registry'
import { BlogSurface, PostMetaLine, PostTags } from '../components/blog/BlogChrome'
import { JAKARTA_FONT, ScrollReveal, StatTile } from '../components/blog/BlogPrimitives'
import type { BlogPost } from '../types/blog'

const SITE_URL = 'https://vyostra.com'

function FeaturedPost({ post }: { post: BlogPost }) {
  const { meta } = post

  return (
    <ScrollReveal>
      <article className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-violet-400/30 md:p-10">
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-violet-500/15 blur-3xl" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-violet-400/30 bg-violet-500/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-violet-300">
              Latest
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">{meta.category}</span>
          </div>

          <h2 className="mt-5 text-2xl font-extrabold leading-tight text-white md:text-4xl" style={JAKARTA_FONT}>
            <Link to={`/blog/${meta.slug}`} className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-300">
              <span className="absolute inset-0" aria-hidden="true" />
              {meta.title}
            </Link>
          </h2>

          <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-white/60 md:text-base">{meta.excerpt}</p>

          <div className="mt-6">
            <PostMetaLine meta={meta} />
          </div>

          {meta.highlights?.length ? (
            <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
              {meta.highlights.map((highlight, index) => (
                <StatTile key={highlight.label} value={highlight.value} label={highlight.label} accent={index % 2 === 1 ? 'cyan' : 'violet'} />
              ))}
            </div>
          ) : null}

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-violet-300 transition-transform group-hover:translate-x-0.5">
              Read the breakdown
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </span>
            {meta.attachment ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-white/40">
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                Includes the {meta.attachment.pages ? `${meta.attachment.pages}-page ` : ''}source PDF
              </span>
            ) : null}
          </div>
        </div>
      </article>
    </ScrollReveal>
  )
}

function PostCard({ post, index }: { post: BlogPost; index: number }) {
  const { meta } = post

  return (
    <ScrollReveal delay={index * 0.05}>
      <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-violet-400/30">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">{meta.category}</span>
        <h3 className="mt-3 text-lg font-bold leading-snug text-white" style={JAKARTA_FONT}>
          <Link to={`/blog/${meta.slug}`} className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-300">
            <span className="absolute inset-0" aria-hidden="true" />
            {meta.title}
          </Link>
        </h3>
        <p className="mt-3 flex-1 text-sm leading-relaxed text-white/55">{meta.excerpt}</p>
        <div className="mt-5">
          <PostMetaLine meta={meta} />
        </div>
        <div className="mt-4">
          <PostTags tags={meta.tags.slice(0, 3)} />
        </div>
      </article>
    </ScrollReveal>
  )
}

export default function BlogIndex() {
  const [isDemoOpen, setIsDemoOpen] = useState(false)
  const posts = getAllPosts()
  const [featured, ...rest] = posts

  return (
    <div className="landing-page bg-background">
      <Helmet>
        <title>Blog — BeepBoop</title>
        <meta name="description" content="Research, breakdowns and field notes from the BeepBoop team on AI, lead generation and the markets our customers build in." />
        <link rel="canonical" href={`${SITE_URL}/blog`} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Blog — BeepBoop" />
        <meta property="og:description" content="Research, breakdowns and field notes from the BeepBoop team." />
        <meta property="og:url" content={`${SITE_URL}/blog`} />
        <meta name="twitter:card" content="summary_large_image" />
      </Helmet>

      <Navbar onOpenDemo={() => setIsDemoOpen(true)} />

      <BlogSurface>
        <main className="mx-auto max-w-5xl px-6 pb-24 pt-36 lg:px-8">
          <ScrollReveal>
            <span className="inline-flex items-center rounded-full border border-violet-400/30 bg-violet-500/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-violet-300">
              The BeepBoop Blog
            </span>
            <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] text-white md:text-6xl" style={JAKARTA_FONT}>
              Research from the{' '}
              <span className="bg-gradient-to-r from-violet-400 to-cyan-300 bg-clip-text text-transparent">edge of the market</span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/55 md:text-lg">
              Deep dives, feasibility models and field notes — the kind of work we do to understand the markets our customers sell into.
            </p>
          </ScrollReveal>

          {posts.length === 0 ? (
            <p className="mt-16 rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-white/50">
              No posts published yet. Check back soon.
            </p>
          ) : (
            <>
              <div className="mt-14">{featured ? <FeaturedPost post={featured} /> : null}</div>

              {rest.length > 0 ? (
                <>
                  <h2 className="mt-20 text-[11px] font-bold uppercase tracking-[0.2em] text-white/40">More posts</h2>
                  <div className="mt-6 grid gap-5 md:grid-cols-2">
                    {rest.map((post, index) => (
                      <PostCard key={post.meta.slug} post={post} index={index} />
                    ))}
                  </div>
                </>
              ) : null}
            </>
          )}
        </main>
      </BlogSurface>

      <Footer />
      <DemoModal isOpen={isDemoOpen} onClose={() => setIsDemoOpen(false)} />
    </div>
  )
}
