# GEO / AEO Fix Plan — vyostra.com

> **Read the Progress section first.** Most of this plan has shipped; what is
> left is blocked on founder input or design assets. The audit it came from is
> [`GEO-AUDIT-2026-09-19.md`](./GEO-AUDIT-2026-09-19.md), whose Status section
> lists every commit and the measured before/after.

This is the handoff for fixing what `GEO-ANALYSIS.md` found on `main` (`d27a806`,
2026-09-19). Read that report for the reasons. This file only covers **what to change,
where, and how to check it landed**.

Everything here is marketing-site frontend, except Phase 4, which is AWS config.
Nothing touches the backend.

## Progress (branch `fix/geo-aeo-audit`, unmerged)

**Done on 2026-09-19:** 1.1, 1.2, 1.3, 1.4, 2.1, 2.3, 2.4, 2.5, 2.6, 3.3 (10
commits, `0ea8c77..55d72fb`). The full test suite (618) and `npm run build` pass.
2.1 also corrected Rule 4: Meta's docs say quality ratings pause templates and gate
scale-up, not that a low rating cuts a limit.

**Done on 2026-09-20 (branch `feat/conversion-measurement`, unmerged):** 4.1, 4.2 (sign_up and
demo chat; `purchase` deliberately left out, it needs input E) and 4.3. CloudFront standard
logging v2 now delivers to `s3://vyostra-cf-logs`, read with `./scripts/ai-crawler-hits.sh`.
628 frontend tests and both builds pass.

**Still manual in GA4 (nobody can do this from the repo):** mark `generate_lead` and `sign_up`
as key events, and register `message_index` as a custom metric. Marking is not retroactive.

**Done on 2026-09-21:** the stats-bar honesty fix (not in the original plan: production held 181
leads and 16 clients against claims of 50,000+ and 500+) and 5.1, the bundle split. The entry
chunk went 1,077 kB / 286 kB gzip to 558 kB / 168 kB gzip, and a load of / fetches that chunk
alone. `src/pages/app-bundle-split.test.ts` pins both directions of the eager/lazy line.

**Not started:**
- 2.2, 3.1, 3.2, 3.4 are blocked on inputs A–E.
- 3.5 and 3.6 need design assets.
- 4.2's `purchase` event, blocked on the INR figures (the currency trap).
- 6.1 is `llms.txt`.
- The consent banner (prompt-analytics §2).

**Found while working, not in the original audit:** `StatsBar.tsx` asserts
"50,000+ leads captured / 94% resolution rate / 500+ businesses live". No source for
these was found. Answer engines quote exactly this kind of figure, so confirm or
remove them.

---

## Ground rules

- **Branch first:** `git checkout -b fix/geo-aeo-audit`. Merging to `main` deploys to
  production.
- **Commit in chunks.** Make one commit per numbered item below, and stage files by
  name. Put a source change and its test in the same commit.
- **`npm test` does not typecheck.** Run `cd frontend && npm run build` before every
  commit. It runs `tsc`, vite, and the prerender.
- Use strict TypeScript with no `any`. Keep functions under 40 lines, typed in and out.
- **Never invent facts.** That covers ratings, performance figures, author credentials,
  and source URLs you have not opened. Where an item needs something only the founders
  know, it is marked **INPUT NEEDED**.

**Local audit.** Rerun this after each phase. The script is in the session scratchpad;
copy it to `frontend/scripts/` if you want to keep it.

```bash
cd frontend
VITE_COGNITO_REDIRECT_URI=https://vyostra.com/auth/callback npm run build
node scripts/audit-seo.mjs dist   # checks inbound links, title/desc length, JSON-LD types, og:image
```

---

## Inputs needed before starting

Collect these from the founders first. Items 3.1 and 3.2 are blocked without them.

| # | Input | Used by |
|---|---|---|
| A | Author for each post: full name, role or credential line (one sentence), LinkedIn URL | 3.1 |
| B | Founders' LinkedIn URLs, plus any X or YouTube profile | 3.2 |
| C | Every live company profile: LinkedIn (have it), YouTube, G2, Capterra, Crunchbase, Product Hunt | 3.2 |
| D | The source URL behind every "Sourced data" / footfall figure in the pilgrimage post | 2.2 |
| E | INR plan prices exactly as Razorpay charges them | 3.4 |

---

## Phase 1 — Internal links (trivial, highest leverage)

### 1.1 `fix: link the orphaned help page from the footer`

- **File:** `frontend/src/components/landing/Footer.tsx`, the `LINK_COLUMNS` array.
- **Change:** add `{ label: 'Help Center', href: '/help' }` to the **Company** column,
  or to a new **Resources** column holding Blog and Help.
- **Change:** remove the two dead `href: '#'` entries (`Changelog`, `Security`). Do not
  keep them as placeholders. A `#` link is a crawl dead-end and looks unfinished to a
  reviewer.
- **Test:** `src/pages/features/marketing-links.test.ts` already checks that literal
  hrefs resolve to mounted routes. Add a case that fails if any footer link is exactly
  `'#'`.
- **Verify:** in the rebuilt `dist/`, `/help/` inbound count goes from 0 to about 15.

### 1.2 `feat: link feature pages to the blog posts that explain them`

- **Files:** `frontend/src/pages/features/WhatsApp.tsx` and `frontend/src/pages/features/Crm.tsx`.
- **Change:** add a short "Read more" block linking to
  `/blog/whatsapp-chatbot-for-real-estate-india`. Use descriptive anchor text such as
  "How WhatsApp's 24-hour window shapes a real-estate follow-up flow", not "click here".
- **Keep it data-driven:** add an optional `relatedFeatures?: string[]` to
  `BlogPostMeta` (`src/types/blog.ts`). Add a helper in `src/content/blog/registry.ts`,
  `postsForFeature(path: string): BlogPostMeta[]`. Feature pages render whatever it
  returns, so the next post links itself without touching the feature page.
- **Test:** unit test `postsForFeature` in the registry test file.

### 1.3 `feat: surface latest posts on the homepage`

- **File:** a new `frontend/src/components/landing/LatestPosts.tsx`, mounted in
  `LandingPage.tsx` above the footer.
- **Change:** show the 3 newest posts from `getAllPosts()`. Import from `meta.ts` only,
  never post bodies, so the blog chunk stays lazy.
- **Constraint:** the homepage is prerendered, so this must render its final state in
  SSR. Follow the `useStaticMotion()` rule in `motion-primitives.tsx`, or the section
  ships at opacity 0.

### 1.4 `feat: cross-link related blog posts`

- **File:** `frontend/src/pages/BlogPost.tsx`.
- **Change:** add a "Related reading" list at the end of each post, showing posts that
  share a tag, excluding the current one.
- **Test:** unit test the selection function (it must exclude the current post and cap
  at 3).

**Phase 1 check:** no prerendered page has 0 inbound links, and each post has at least
3.

---

## Phase 2 — Citations and on-page content

### 2.1 `fix: cite Meta's docs for every WhatsApp platform rule`

- **File:** `frontend/src/content/blog/posts/whatsapp-chatbot-for-real-estate-india/content.mdx`.
- **Change:** link the official WhatsApp Business Platform documentation inline, where
  each rule is stated:
  - the 24-hour customer service window
  - template messages and template approval
  - opt-in requirements
  - pricing. The header comment already says the post "points at the current docs";
    make that true.
- Open every URL before committing it. Meta moves these pages. Prefer
  `developers.facebook.com/docs/whatsapp/...` and `business.whatsapp.com/policy`.
- **Also:** check that `MdxComponents.tsx` renders external `<a>` with
  `rel="noopener"`. Do **not** add `nofollow` to sources you are citing as authorities.

### 2.2 `fix: link the sources behind the pilgrimage post's sourced figures` — **INPUT NEEDED (D)**

- **File:** `.../branded-budget-residences-pilgrimage-towns/content.tsx`.
- **Change:** every block titled "Sourced data" and the "Note on the footfall numbers"
  gets a visible source link.
- If a figure has no findable source, relabel its block "Modeled assumption". That
  label already exists in the post. Do not leave "Sourced" on an unsourced number.

### 2.3 `fix: question-phrased H2s in the WhatsApp post`

The same file as 2.1, but a separate commit.

| Current | Replace with |
|---|---|
| `## The four rules that decide your design` | `## What rules does WhatsApp enforce on business messages?` |
| `## Build, buy, or the free app: an honest comparison` | `## Should you build, buy, or use the free WhatsApp Business app?` |
| `## Before you switch it on` | `## What do you need before launching a WhatsApp chatbot?` |

Keep the "honest comparison" framing inside the section body. It is the strongest
citation signal in the post.

### 2.4 `fix: trim titles and descriptions that truncate in results`

| Page | Now | Target |
|---|---|---|
| WhatsApp post: title | 75 chars | ≤ 60, e.g. `WhatsApp Chatbot for Real Estate in India — Vyostra AI` (54) |
| WhatsApp post: description | 299 chars | ≤ 160, leading with the definition |
| Homepage: title | 69 | ≤ 60 |
| Home / about / pilgrimage / help: description | 180 / 175 / 178 / 171 | ≤ 160 |

- Post titles come from `meta.ts`. The description currently reuses `excerpt`.
- **Add** an optional `seoDescription?: string` to `BlogPostMeta` rather than cutting
  the on-page excerpt, which is a deliberate deck.
- **Guard it:** add a test that loads every page's head config (or every
  `BlogPostMeta`) and fails if a title is over 60 characters or a description is over
  160. This is the qdnco "31 titles over 60" lesson: a limit nobody tests drifts.

### 2.5 `feat: a self-contained "What is Vyostra AI?" block on the homepage`

- **File:** `LandingPage.tsx`, near the top, below the hero.
- **Content:** a 134–167-word block that starts "Vyostra AI is…". Cover what it does,
  the channels (chat, voice, WhatsApp), the built-in CRM, automated follow-up, the
  pricing floor ($49/mo), and the markets (India, UAE). Use plain facts only, no
  superlatives. This is the passage an AI engine should lift for "what is Vyostra".

### 2.6 `feat: group help FAQs under question headings`

- **File:** `frontend/src/pages/Help.tsx`.
- **Change:** group the 13 questions under 3–4 topical H2s (setup, WhatsApp, billing,
  account). Keep the answers in the raw HTML. All 13 already are; do not break that with
  a collapsed-by-default render that drops them from SSR.

---

## Phase 3 — Authority and schema

All of this lives in `frontend/src/lib/structured-data.ts`. Keep one builder per node
type, and extend `structured-data.test.ts` in the same commit as each change.

### 3.1 `feat: person authors with bylines and dateModified on posts` — **INPUT NEEDED (A)**

- **Types:** add an `authors` registry, `src/content/blog/authors.ts`, with fields
  `{ id, name, role, url?, sameAs: string[] }`. In `BlogPostMeta`, add `authorId: string`
  and `updatedAt?: string`.
- **Schema:** in `blogPostingSchema`, set `author` to a `Person` node with an `@id`,
  plus `dateModified: updatedAt ?? publishedAt`.
- **UI:** show a visible byline with the name, the role line, and a
  "Updated <date>" label when `updatedAt` is set, in `PostMetaLine`
  (`components/blog/BlogChrome.tsx`).
  Schema that names an author the page doesn't show is the same spam-policy problem
  the `faq` comment in `types/blog.ts` warns about.
- **Sitemap:** in `getCrawlFiles()` (`prerender-entry.tsx`), pass
  `updatedAt ?? publishedAt` into `lastModified`.

### 3.2 `feat: entity links for the organization and founders` — **INPUT NEEDED (B, C)**

- In `organizationSchema()`:
  - extend `sameAs` with every live profile from input C
  - give each founder `Person` a `sameAs` and `jobTitle`
  - add `contactPoint: { contactType: 'customer support', email: 'support@vyostra.com', areaServed: ['IN', 'AE'] }`
- Only add profiles that exist today. Add the rest as they launch.

### 3.3 `feat: breadcrumb and page schema on feature and blog pages`

- **Add** `breadcrumbSchema(items: readonly { name: string; path: string }[]): JsonLd`.
- **Feature pages** (`src/pages/features/*.tsx`, `Features.tsx`) currently have **no
  JSON-LD**. Emit `WebPage` with `about: { '@id': '<site>/#software' }`, plus a
  breadcrumb.
- **Blog posts:** add the Home → Blog → Post breadcrumb to the existing graph.
- Paths must be the **served** trailing-slash form (`absoluteUrl('/features/crm/')`).
  A breadcrumb pointing at a 301 is the same mistake the canonicals avoid.

### 3.4 `feat: identify the software node and list its INR offers` — **INPUT NEEDED (E)**

- In `softwareApplicationSchema`, add `'@id': absoluteUrl('/#software')` and
  `featureList`.
- Add an INR `Offer` beside each USD one, using the exact Razorpay amounts.
- **Do not** add `aggregateRating` until real, verifiable reviews exist.

### 3.5 `feat: per-post share images`

- Add an optional `ogImage?: string` to `BlogPostMeta`. When set, it feeds both the
  `og:image` tag and `BlogPosting.image`. Otherwise keep the `og-image.png` fallback.
- Create a 1200×630 image for each post. This can be the diagram from 3.6, cropped.

### 3.6 `feat: a diagram in each post`

Right now there are zero images across all 15 pages.

- **WhatsApp post:** a qualification-flow diagram, plus a 24-hour-window timeline.
- **Pilgrimage post:** the payback chart as an image, alongside the existing table.
- Use WebP. Every image needs `width`, `height`, `alt`, and `loading="lazy"`, except
  above-the-fold images. Those are the qdnco image-hygiene rules, applied from day one
  instead of retrofitted.

---

## Phase 4 — Measurement (prompt-analytics.md §1 and §4)

Without this, nothing in Phases 1–3 can be shown to have worked.

### 4.1 `feat: fire generate_lead on confirmed contact success`

- **File:** `frontend/src/pages/Contact.tsx`, in `handleSubmit`. Call it right after
  `if (!response.success) {...}` returns and before `setStatus('success')`.
- `trackEvent('generate_lead', { form: 'contact' })`. Send **no** name, email, or
  message: no PII in event params.
- **Check the honeypot first:** if the backend answers a honeypot hit with
  `success: true` (silent reject), then bots will count as leads. Either make the
  honeypot response distinguishable, for example `{ success: true, accepted: false }`,
  or accept and document the inflation. Do not silently ship an inflated metric.
- **Test:** mock `submitContactMessage`. `trackEvent` must fire once on success and zero
  times on `success: false` or a thrown error.
- **After deploy:** in GA4, go to Admin → Events → mark `generate_lead` as a **key
  event** the same day. Marking it is not retroactive.

### 4.2 `sign_up`, `begin_checkout`, `purchase`

These go in separate commits, following the same pattern. Read the currency trap in
prompt-analytics.md §1 before `purchase`. Out of scope for this plan if time is short.

### 4.3 CloudFront access logs (AWS console/CLI, no commit)

- `scripts/deploy.sh` only creates invalidations. Nothing in `scripts/`, `deploy/` or
  `.github/` calls `update-distribution`, so enabling logging by hand **will not be
  overwritten**. Still, run
  `grep -rn update-distribution scripts deploy .github` again before doing it.
- Turn on standard logging to a new S3 bucket (`vyostra-cf-logs`, ap-south-1) with a
  90-day lifecycle rule.
- **Parsing:** use an Athena table over the bucket, plus one saved query that counts
  hits per day by user-agent for `GPTBot`, `OAI-SearchBot`, `ChatGPT-User`,
  `ClaudeBot`, `Claude-SearchBot`, `PerplexityBot`, `Googlebot`, `bingbot`, filtered
  to `/blog/%`. Do not build a pipeline.
- Record the bucket name and query in memory or docs so the next session finds them.

---

## Phase 5 — Split the marketing bundle from the app (medium, review separately)

### 5.1 `perf: lazy-load app routes so marketing pages stop shipping the dashboard`

- **File:** `frontend/App.tsx`. Today only `BlogIndex` and `BlogPost` are `lazy()`, so
  the main chunk is **1,069 KB / 283 KB gzip** on every marketing page.
- **Change:** make every dashboard, admin, auth, journey, voice, form, and test page a
  `lazy()` import behind a `<Suspense>`. Import `LoginPage` and `SignupPage` lazily too.
- **Keep the prerendered marketing pages eager:** home, `/features/*`, about, help,
  contact, careers, privacy, terms. `main.tsx` uses `createRoot().render()`, not
  `hydrateRoot`, so a lazy marketing page would replace its prerendered HTML with the
  Suspense fallback on boot. That is a visible flash and an LCP regression.
- **Watch for:** providers and hooks imported by `App.tsx` itself that pull in dashboard
  code. Check the chunk list in the build output, not just the route imports.
- **Target:** the main chunk under ~350 KB raw. Confirm the homepage no longer requests
  dashboard chunks (DevTools Network tab, fresh load of `/`).
- **Verify nothing broke:** log in, open the dashboard, the journey builder, a voice
  agent, and the admin console. Run `npm test` and `npm run build`.

---

## Phase 6 — Optional

### 6.1 `feat: generate llms.txt alongside robots and sitemap`

- Google says this has no Search effect, so it is last on the list.
- Add `buildLlmsTxt(origin, posts)` to `src/lib/crawl-files.ts` and return
  `'llms.txt'` from `getCrawlFiles()`. That way it is generated from the same route
  list and cannot drift.
- **Contents:** a one-line definition (reuse the 2.5 block's first sentence), the plans,
  channels, markets, the support email, and one line per prerendered page and post.
- **Test** it in `crawl-files.test.ts`: every sitemap URL must appear in `llms.txt`.

### 6.2 The pilgrimage post's topical fit (a decision, not a code change)

The post is a hospitality feasibility study on an AI-chatbot domain. Either add a
framing section tying it to developer lead capture, or accept that it earns nothing
for chatbot queries. This is the founders' call.

---

## Suggested order and PR shape

| PR | Contains | Why grouped |
|---|---|---|
| 1 | 1.1–1.4, 2.3, 2.4 | Mechanical, low risk, no inputs needed |
| 2 | 2.1, 2.5, 2.6, 3.3 | Content and schema that needs no founder input |
| 3 | 4.1 (+ GA4 key-event step), 4.3 | Measurement. Ship before judging anything else. |
| 4 | 2.2, 3.1, 3.2, 3.4 | Blocked on inputs A–E |
| 5 | 3.5, 3.6 | Needs design assets |
| 6 | 5.1 | Build-pipeline change, reviewed on its own |
| 7 | 6.1 | Optional |

---

## Verifying on production (after each merge)

Do not trust the green check alone.

```bash
gh run list --branch main --limit 1
curl -s https://vyostra.com/ | grep -c 'href="/help"'                       # >0 after PR 1
curl -s https://vyostra.com/features/crm/ | grep -c 'application/ld+json'  # 1 after PR 2
curl -s https://vyostra.com/blog/whatsapp-chatbot-for-real-estate-india/ \
  | grep -oE '"author":\{[^}]+\}'                                          # Person after PR 4
curl -s https://vyostra.com/ | grep -oE '/assets/index-[^"]+\.js' \
  | xargs -I{} curl -s -o /dev/null -w '%{size_download}\n' https://vyostra.com{}   # smaller after PR 6
curl -s -o /dev/null -w '%{http_code}\n' https://vyostra.com/llms.txt       # 200 after PR 7
```

Then run the pages through Google's Rich Results Test and the Schema.org validator.
In GA4 Realtime, submit the contact form in an incognito window and watch
`generate_lead` arrive.

**Re-audit** at about 30 days. Rebuild, run the local audit script, and compare against
the 63/100 baseline in `GEO-ANALYSIS.md`. Pull the CloudFront AI-crawler counts and the
Search Console query report for the blog URLs.
