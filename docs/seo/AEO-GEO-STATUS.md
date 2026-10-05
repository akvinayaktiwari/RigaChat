# AEO / GEO Status — vyostra.com

**The one file to read first.** What has shipped for search and answer-engine visibility, what is left, and who has to do it. Last updated: 2026-10-05.

How to keep it current: when something ships, move its row from "To do" to "Implemented" with the date. Do not record plans here; plans live in the documents listed at the bottom.

Framing: Google's own guidance is that optimizing for AI search is ordinary SEO. A page must be indexed and snippet-eligible in Google Search before it can appear in AI Overviews or AI Mode. `llms.txt` and schema added "for AI" are not Google levers.

---

## Where things stand

| Measure | Value | Date | Note |
|---|---|---|---|
| GEO readiness (estimate) | 71 / 100 | 2026-10-02 | From `GEO-ANALYSIS-2026-10-02.md`, before the feature-page rebuild. Baseline was 63 on 2026-09-19. |
| Indexed in Google | Unknown | — | Search Console is not verified. This is the top blocker. |
| Public pages in the sitemap | 25 | 2026-10-05 | All dated. Counted on the live file; `/integrations/` and `/integrations/meta-lead-ads/` were the 24th and 25th. |
| Blog posts | 5 | 2026-10-02 | 4 published in the last three weeks. |
| Mobile LCP (lab) | about 1.7 s | 2026-10-02 | Was 2.3 s on the homepage and 3.25 s on a post. No field data yet. |
| Lighthouse accessibility | 100 | 2026-10-02 | On every public page audited. |
| Real referring domains | 0 known | 2026-10-02 | Not in the Common Crawl graph; all six competitors checked are. |
| Brand presence off-site | LinkedIn and GitHub only | 2026-10-02 | Nothing on YouTube, Reddit or Wikipedia. |

---

## Implemented

### Crawling and rendering

| What | Shipped |
|---|---|
| Every marketing page prerendered to static HTML; nothing depends on JavaScript | 2026-09 |
| `robots.txt` allows `Googlebot`, `OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`, and the training crawlers; app and API paths disallowed | 2026-09 |
| `sitemap.xml` generated from one page list, real `lastmod` on all 22 URLs, blog index and homepage dated from the newest post | 2026-10-02 |
| `llms.txt`, generated from the same list as the sitemap | 2026-10-02 |
| CloudFront function: bare URLs 301 to the trailing-slash form; `www` 301s to the apex | 2026-10-02 |
| Titles at 60 characters or fewer, descriptions within limits, with a guard test | 2026-09-19 |
| A missing file or a missing URL under a prerendered path returns 404 with the site's own not-found page (`noindex`), not the homepage | 2026-10-02 |

### Structured data

| Page | Schema | Shipped |
|---|---|---|
| Homepage | `Organization`, `WebSite`, `SoftwareApplication` with three `Offer`s from the pricing constants, founders as `Person` with LinkedIn `sameAs` | 2026-10-02 |
| Blog posts | `BlogPosting` with `Person` author, `datePublished`, `dateModified`; `FAQPage`; `BreadcrumbList` | 2026-10-02 |
| Blog index | `Blog` with an `ItemList` of every post | 2026-10-02 |
| About | `AboutPage`, `Organization`, both founders | 2026-10-02 |
| Pricing, FAQ | `WebPage`, `FAQPage`, `BreadcrumbList` (pricing also `SoftwareApplication`) | 2026-10-02 |
| Five feature pages | `WebPage`, `FAQPage`, `BreadcrumbList` | 2026-10-02 |
| Zoho CRM integration page | `WebPage`, `FAQPage`, `BreadcrumbList` | 2026-10-03 |
| Meta Lead Ads integration page | `WebPage`, `FAQPage`, `BreadcrumbList` | 2026-10-03 |
| Integrations index | `WebPage`, `BreadcrumbList` | 2026-10-03 |
| WhatsApp link generator | `WebPage`, `FAQPage`, `BreadcrumbList` | 2026-10-02 |
| Help | `FAQPage` | 2026-09-19 |

Rule held throughout: schema only for text the page shows. No ratings, no reviews.

### Content and citability

| What | Shipped |
|---|---|
| "What is Vyostra AI?" definition block on the homepage | 2026-09-19, restyled 2026-10-02 |
| `/pricing/`, `/faq/`, `/features/voice-agent/` | 2026-10-02 |
| Chat agent, WhatsApp, CRM and forms pages rebuilt: definition in the first paragraph, question H2s, five visible FAQ answers each | 2026-10-02 |
| Free tool: `/whatsapp-link-generator/` | 2026-10-02 |
| Zoho CRM integration page: `/features/zoho-crm/` | 2026-10-03 |
| Meta Lead Ads integration page: `/integrations/meta-lead-ads/`, with an index at `/integrations/`. Every claim rechecked against the backend on 2026-10-05 | 2026-10-03 |
| WhatsApp and Zoho CRM have no page under `/integrations/` on purpose: the index links each to its feature page, so two pages do not compete for one search | 2026-10-03 |
| Author byline, "Updated" date and four fixed categories on posts | 2026-10-02 |
| Question H2s in posts; Meta and WhatsApp primary sources cited in the WhatsApp post | 2026-09-19 |
| Internal links: help in the footer, feature pages to related posts, latest posts on the homepage, related posts on each post | 2026-09-19 |
| Help FAQs grouped under question headings | 2026-09-19 |

### Accuracy (claims removed or corrected)

| Claim | Fixed |
|---|---|
| "50,000+ leads", "94% resolution", "500+ businesses", review stars and avatars | 2026-09-20 |
| Leads can be filtered "by bot" | 2026-10-02 |
| "Average delivery time under 4 seconds" | 2026-10-02 |
| "Drag and drop" form builder | 2026-10-02 |
| Answers are "always accurate" | 2026-10-02 |
| Weekly WhatsApp report covers conversations and top agent | 2026-10-02 |
| "Every new lead" syncs to Zoho (only form and Meta lead ad leads do; chat and voice do not), and Zoho receives a "bot name" | 2026-10-03 |
| Homepage: a chat lead "Syncs to Zoho.", the voice agent has the "same CRM sync", and the Zoho card offers "Activity logging" and "Custom field mapping" (neither exists); Help: leads sync to "other tools" besides Zoho | 2026-10-03 |
| WhatsApp page named chat and form leads as the only ones that send an alert (Meta lead ad leads do too), and "any of your agents" read as including the voice agent, which alerts only on a handoff | 2026-10-05 |

### Performance and accessibility

| What | Shipped |
|---|---|
| Dashboard code split from the marketing bundle | 2026-09-21 |
| Animation engine loaded as its own chunk | 2026-10-01 |
| Prerendered pages hydrate instead of rendering twice | 2026-10-02 |
| Fonts loaded from one request | 2026-10-02 |
| Contrast, heading order, labels and tap targets fixed across public pages and the dashboard | 2026-10-02 |
| Back/forward cache enabled for prerendered pages | 2026-10-02 |

### Measurement

| What | Shipped |
|---|---|
| GA4 on the marketing site only, never the dashboard | 2026-09 |
| Events: `generate_lead`, `sign_up`, `demo_chat_message`, blog view, read progress and CTA click, `whatsapp_link_copy` | 2026-09-20 to 2026-10-02 |
| `generate_lead` and `sign_up` marked as key events in GA4 | 2026-09-20 |
| CloudFront access logs for AI-crawler hits, read with `scripts/ai-crawler-hits.sh` | 2026-09-20 |

### Tests that hold this in place

| Test | Fails when |
|---|---|
| `page-accessibility.test.tsx` | A public page skips a heading level or has an unlabelled dropdown |
| `page-schema.test.tsx` | The about page or blog index loses its schema, or names something the page does not show |
| `feature-pages.test.tsx` | A feature page stops opening with an answer, drops its question headings, publishes FAQ schema for hidden text, or gives its schema a URL other than the one it is served on |
| `zoho-claims.test.ts` | Marketing copy, a published FAQ answer or an `llms.txt` line says leads reach Zoho without naming forms and Meta lead ads, or names chat, voice or WhatsApp as a source that syncs |
| `integrations.test.tsx` | An integration page stops opening with an answer, drops its limits, publishes FAQ schema for hidden text, or a second Zoho page appears under `/integrations/` |
| `crawl-files.test.ts` | A sitemap URL has no route, no date, or no CloudFront prefix |
| `hydration-contract.test.ts` | The prerender and the browser stop rendering the same tree |

---

## To do

### Owner tasks (cannot be done from the repo)

| # | Task | Why it matters |
|---|---|---|
| 1 | **Verify `vyostra.com` in Google Search Console** (Domain property, DNS TXT), submit the sitemap, request indexing for the new pages | Everything below assumes the site is indexed. A web search for the brand returned the GitHub repos, not the site. |
| 2 | Import the property into Bing Webmaster Tools | Bing feeds ChatGPT Search and Copilot. |
| 3 | Create the Google API key and service account described in the setup notes | Lets Claude check index status per URL, real-user Core Web Vitals and search queries. |
| 4 | Rewrite the two public GitHub repo descriptions to match the site, or make the interview repo private | They rank first for the brand and say "solo founder" and "for Indian SMBs". |
| 5 | Record one product walkthrough for YouTube | No page has a video or an image; YouTube is the strongest measured correlate of AI visibility. |
| 6 | Directory listings: G2, Capterra, AlternativeTo, Product Hunt, Zoho Marketplace | First real referring domains. |
| 7 | Verify competitor facts for the comparison pages | Draft at `drafts/compare-pages.md`; every competitor cell is `TODO: verify`. |
| 8 | Register `message_index` as a GA4 custom metric | Collected but unreportable until then. |
| 9 | A client case study with real numbers | Needs a client's approval. |
| 10 | Run the Rich Results Test on the homepage and one post | Not run yet. |
| 10a | Check the Priya S. testimonial on the homepage | It says leads "from the AI agent" sync to Zoho. Chat leads do not sync; only form and Meta lead ad leads do. It is a customer's own quote, so it was left unchanged: confirm with her how leads reach her Zoho, then reword with her approval or drop the sentence. |

### Claude tasks, ready now

| # | Task | Note |
|---|---|---|
| 12 | Industries template, real estate first | Three existing posts supply verified material. Other industries need input from the owner. |
| 13 | A top-level URL that matches no route (for example `/no-such-page`) returns 200 with the app shell, which then shows "not found" in the browser | A soft 404. Fixing it means teaching the CloudFront function which top-level paths the app really has. Low priority: nothing links to such URLs. |
| 13a | Schema on `/contact/`, `/careers/` and the legal pages | They carry none. Low value. |
| 14 | Embed the walkthrough video once it exists, with `VideoObject` | Depends on 5. |
| 15 | A diagram in each post, with `image` on `BlogPosting` | Needs design assets or a decision to draw them in SVG. |
| 16 | A built-in QR code for the link generator | Needs a small library. |
| 17 | Sub-headings in the long sections of the WhatsApp and pilgrimage posts | Sections run 300 to 600 words under one heading. |

### Blocked

| # | Task | Blocked on |
|---|---|---|
| 18 | Comparison pages | Owner task 7. |
| 19 | Outside sources and first-hand evidence for the two voice posts that cite none | Real measurements or transcripts from the owner. |
| 20 | Sources for the pilgrimage post's figures | The owner's source list. |
| 21 | Change "Gupshup" wording in `/faq/`, `/help/`, `/features/whatsapp/` and `llms.txt` | Accurate today. Change all four together when the Meta direct route opens to clients, after WhatsApp App Review. |
| 22 | `purchase` event | Real INR charge amounts (the currency trap in `prompt-analytics.md`). |
| 23 | Striking-distance work and the weekly scoreboard | Search Console data (owner task 1). |
| 24 | Three posts a week from the clusters | Keyword validation, which needs Search Console or a keyword tool. |

---

## Related documents

| File | What it is |
|---|---|
| `docs/seo/GEO-ANALYSIS-2026-10-02.md` | Latest scored analysis, with per-crawler access and passage-level detail |
| `docs/seo/GEO-AUDIT-2026-09-19.md` | The baseline audit (63/100) and its commit record |
| `docs/seo/GEO-FIX-PLAN.md` | The original fix plan and its progress log |
| `docs/SEO_AEO_HANDOFF.md` | The handoff this round of work started from, with a status section |
| `docs/SEO_GROWTH_PLAN.md` | The 6-month growth plan: clusters, programmatic pages, authority |
| `docs/seo/drafts/compare-pages.md` | Comparison page drafts, unpublished |
| `docs/seo/CONTENT-STRATEGY.md`, `docs/seo/research/` | Content markets and keyword clusters |
| `prompt-analytics.md` | Analytics rules and traps |
