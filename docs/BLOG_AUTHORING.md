# Writing a blog post

**Read [`seo/CONTENT-STRATEGY.md`](seo/CONTENT-STRATEGY.md) first.** It is the standing
brief: global product, focus on **India and the UAE**, written to rank on Google and to be
quoted by ChatGPT, Perplexity and AI Overviews. This file is only the mechanics.


A post is two files in one directory. Nothing else has to be registered: the
registry globs the directory, and the route, sitemap entry, blog-index card and
prerendered HTML all follow from it.

```
frontend/src/content/blog/posts/<slug>/
  meta.ts      title, excerpt, date, tags, optional FAQ
  content.mdx  the body — markdown, with components where markdown runs out
```

The directory name IS the URL slug and must equal `meta.slug`, or the build
fails on purpose.

## meta.ts

```ts
import type { BlogPostMeta } from '../../../../types/blog'

const meta: BlogPostMeta = {
  slug: 'my-post',            // must match the directory name
  title: 'Title as it appears on the page and in Google',
  excerpt: 'One or two sentences. Used as the meta description and the index card deck.',
  publishedAt: '2026-09-16',  // YYYY-MM-DD, drives ordering
  category: 'Lead Generation Playbook',
  tags: ['WhatsApp', 'India'],
  readingMinutes: 9,
  faq: [                      // optional, see below
    { question: 'A question someone actually searches', answer: 'A direct answer, in plain text.' },
  ],
}

export default meta
```

`faq` renders a "Common questions" section at the end of the post **and**
publishes FAQPage schema. One array feeds both, deliberately: schema that
answers something the page does not show is a Google spam-policy violation, and
AI answer engines quote the schema as if it were the page. Keep answers
self-contained — an answer engine may quote one without the paragraph above it.

## content.mdx

Markdown for prose. `##` headings, paragraphs, lists, links, `>` blockquote (it
renders as a pull quote) and GitHub-style tables all work and are styled to
match the rest of the blog.

When markdown runs out, use a component — no import needed, they are all in
scope (see `frontend/src/components/blog/MdxComponents.tsx`):

| Component | For |
| --- | --- |
| `<Callout title="..." tone="warning">` | An aside; `tone` is `neutral` or `warning` |
| `<DataTable headers={[...]} rows={[[...]]} caption="..." />` | A table needing a caption or JSX in cells. Plain markdown tables are fine otherwise. |
| `<CheckList items={[<>...</>, ...]} />` | A numbered list of longer points |
| `<PhaseTimeline phases={[{ phase, timeline, action }]} />` | A sequence of steps |
| `<FactCard label="...">`, `<NumberedCard number="①" title="...">` | Cards; wrap several in `<div className="mt-6 grid gap-4 md:grid-cols-2">` |
| `<StatRow>` + `<StatTile value="..." label="..." />` | Headline figures |
| `<Emphasis>`, `<PullQuote>`, `<Cite n="1" />` | Inline emphasis, quotes, source markers |

Hero stat tiles come from `meta.highlights`, not the body.

## Rules that are not style preferences

These are the short form. The reasoning is in `seo/CONTENT-STRATEGY.md`.

0. **Write for India or the UAE, and open with the answer.** A page aimed at
   nobody ranks for nobody, and the first paragraph is the one an AI engine
   quotes. UAE pages end in "talk to us": there is no self-serve checkout there
   yet.
1. **No invented numbers.** No response times, conversion rates or market sizes
   unless they are sourced and cited. An uncited figure is worth less than the
   sentence around it, and both Google and AI engines are getting better at
   noticing. If a number is an estimate, write that it is one.
2. **Nothing may render invisible.** Posts are prerendered and read without
   JavaScript. Never add an entrance animation that starts at `opacity: 0`;
   `ScrollReveal` already handles this via `useStaticMotion()`.
3. **Internal links use plain markdown** — `[text](/features/crm)`. The MDX
   anchor sends site-relative links through the router; external links get
   `target="_blank"` and `rel="noopener"` automatically.
4. **Claims about the product must be true today.** Not on the roadmap. A post
   is the easiest place for an accidental overclaim to land.

## Checking it before you push

```
cd frontend
npm run build          # prerenders every post; fails loudly on a bad body
npm test
npx vite preview       # then open /blog/<slug>/
```

Then confirm the static HTML is really there, since that is the entire point:

```
grep -c 'opacity:0' dist/blog/<slug>/index.html        # must be 0
grep -o '<title[^>]*>[^<]*' dist/blog/<slug>/index.html
```

`content.tsx` still works for a post that is mostly custom layout — the
pilgrimage-towns post is one. Prefer `.mdx` for anything prose-led.
