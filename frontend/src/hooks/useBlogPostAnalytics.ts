import { useCallback, useEffect } from 'react'
import { trackEvent, type EventParams } from '../lib/analytics'
import type { BlogPostMeta } from '../types/blog'

/**
 * GA4 measurement for a single blog post.
 *
 * A page_view alone tells you a URL was opened, which is the one thing about a
 * blog that is already obvious. What a content decision needs is the post's
 * dimensions on every event -- category, tags, age -- so "which cluster earns
 * its keep" is a report rather than a spreadsheet exercise, and some signal
 * that the page was actually READ, because a post with traffic and no read
 * depth is a headline that works attached to a body that does not.
 */

/** Read-depth milestones, in percent. Each fires at most once per post. */
const PROGRESS_MILESTONES: readonly number[] = [25, 50, 75, 100]

const MILLISECONDS_PER_DAY = 86_400_000

/** Whole days between publication and now; 0 for a post dated in the future. */
function ageInDays(publishedAt: string): number {
  const published = Date.parse(publishedAt)
  if (Number.isNaN(published)) return 0
  return Math.max(0, Math.floor((Date.now() - published) / MILLISECONDS_PER_DAY))
}

/**
 * The dimensions every blog event carries.
 *
 * Tags are joined rather than sent as an array: a GA4 parameter is a scalar,
 * and an array arrives as the string "[object Object]"-ish noise nobody can
 * filter. "|" separators keep a single tag findable with a contains filter.
 */
export function postDimensions(meta: BlogPostMeta): EventParams {
  return {
    post_slug: meta.slug,
    post_title: meta.title,
    post_category: meta.category,
    post_tags: meta.tags.join('|'),
    post_published_at: meta.publishedAt,
    post_age_days: ageInDays(meta.publishedAt),
    reading_minutes: meta.readingMinutes,
  }
}

/** How far down the document the viewport has reached, 0-100. */
export function readPercent(scrollY: number, viewportHeight: number, documentHeight: number): number {
  const scrollable = documentHeight - viewportHeight
  // A post shorter than the viewport can never be scrolled, and reporting it
  // as 0% read would make every short post look like a bounce.
  if (scrollable <= 0) return 100
  return Math.max(0, Math.min(100, Math.round((scrollY / scrollable) * 100)))
}

/** The milestones newly crossed at `percent`, given those already sent. */
export function milestonesCrossed(percent: number, sent: ReadonlySet<number>): number[] {
  return PROGRESS_MILESTONES.filter((milestone) => percent >= milestone && !sent.has(milestone))
}

/**
 * Reports one blog_post_view, then blog_read_progress at each depth milestone.
 *
 * Returns a callback for the post's conversion event, so the demo CTA on a post
 * is attributed to the post that produced it rather than to the site at large.
 */
export function useBlogPostAnalytics(meta: BlogPostMeta): (action: string) => void {
  const { slug } = meta

  useEffect(() => {
    trackEvent('blog_post_view', postDimensions(meta))
    // Keyed on slug, not on the meta object: the registry hands back a new
    // object identity on every render, which would refire the view endlessly.
  }, [slug])

  useEffect(() => {
    const sent = new Set<number>()

    const onScroll = (): void => {
      const percent = readPercent(window.scrollY, window.innerHeight, document.documentElement.scrollHeight)
      for (const milestone of milestonesCrossed(percent, sent)) {
        sent.add(milestone)
        trackEvent('blog_read_progress', { ...postDimensions(meta), percent: milestone })
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    // Fires once up front so a post that fits on one screen is not recorded as
    // unread, and so a deep link with a #fragment starts from where it landed.
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [slug])

  return useCallback(
    (action: string) => {
      trackEvent('blog_cta_click', { ...postDimensions(meta), cta_action: action })
    },
    [slug]
  )
}
