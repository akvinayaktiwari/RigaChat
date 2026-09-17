import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { milestonesCrossed, postDimensions, readPercent, useBlogPostAnalytics } from './useBlogPostAnalytics'
import { trackEvent } from '../lib/analytics'
import type { BlogPostMeta } from '../types/blog'

vi.mock('../lib/analytics', () => ({ trackEvent: vi.fn() }))

const meta: BlogPostMeta = {
  slug: 'whatsapp-chatbot-for-real-estate-india',
  title: 'WhatsApp Chatbot for Real Estate in India',
  excerpt: 'An excerpt.',
  publishedAt: '2026-09-16',
  category: 'Lead Generation Playbook',
  tags: ['WhatsApp', 'Real Estate', 'India'],
  readingMinutes: 9,
}

describe('postDimensions', () => {
  it('carries the axes a content report is sliced by', () => {
    expect(postDimensions(meta)).toMatchObject({
      post_slug: 'whatsapp-chatbot-for-real-estate-india',
      post_category: 'Lead Generation Playbook',
      post_published_at: '2026-09-16',
      reading_minutes: 9,
    })
  })

  // GA4 parameters are scalars. An array arrives unreportable, so a tag that
  // cannot be filtered on is the same as a tag that was never sent.
  it('flattens tags into one filterable string', () => {
    expect(postDimensions(meta).post_tags).toBe('WhatsApp|Real Estate|India')
  })

  it('never reports a negative age for a post dated in the future', () => {
    expect(postDimensions({ ...meta, publishedAt: '2099-01-01' }).post_age_days).toBe(0)
  })
})

describe('readPercent', () => {
  it('reports progress through the scrollable area', () => {
    expect(readPercent(0, 800, 2400)).toBe(0)
    expect(readPercent(800, 800, 2400)).toBe(50)
    expect(readPercent(1600, 800, 2400)).toBe(100)
  })

  // A post shorter than the viewport cannot be scrolled. Reporting 0% would
  // make every short post look unread, which is the opposite of the truth.
  it('counts an unscrollable post as fully read', () => {
    expect(readPercent(0, 800, 600)).toBe(100)
  })

  it('clamps overscroll rather than reporting more than 100', () => {
    expect(readPercent(5000, 800, 2400)).toBe(100)
  })
})

describe('milestonesCrossed', () => {
  it('returns every milestone passed in one jump, each only once', () => {
    expect(milestonesCrossed(80, new Set())).toEqual([25, 50, 75])
    expect(milestonesCrossed(80, new Set([25, 50]))).toEqual([75])
    expect(milestonesCrossed(80, new Set([25, 50, 75]))).toEqual([])
  })
})

describe('useBlogPostAnalytics', () => {
  beforeEach(() => {
    vi.mocked(trackEvent).mockClear()
  })

  it('reports the post view once, with the post dimensions attached', () => {
    const { rerender } = renderHook(() => useBlogPostAnalytics(meta))
    rerender()

    const views = vi.mocked(trackEvent).mock.calls.filter(([name]) => name === 'blog_post_view')
    expect(views).toHaveLength(1)
    expect(views[0]?.[1]).toMatchObject({ post_slug: meta.slug })
  })

  // jsdom reports a zero-height document, so the initial reading is 100%: the
  // point here is that the depth events fire at all and carry the post.
  it('reports read progress with the post attached', () => {
    renderHook(() => useBlogPostAnalytics(meta))

    const progress = vi.mocked(trackEvent).mock.calls.filter(([name]) => name === 'blog_read_progress')
    expect(progress.length).toBeGreaterThan(0)
    expect(progress[0]?.[1]).toMatchObject({ post_slug: meta.slug })
  })

  it('attributes a CTA click to the post that produced it', () => {
    const { result } = renderHook(() => useBlogPostAnalytics(meta))

    result.current('open_demo')

    expect(trackEvent).toHaveBeenCalledWith(
      'blog_cta_click',
      expect.objectContaining({ post_slug: meta.slug, cta_action: 'open_demo' })
    )
  })

  it('stops reporting scroll after the post unmounts', () => {
    const { unmount } = renderHook(() => useBlogPostAnalytics(meta))
    unmount()
    vi.mocked(trackEvent).mockClear()

    window.dispatchEvent(new Event('scroll'))

    expect(trackEvent).not.toHaveBeenCalled()
  })
})
