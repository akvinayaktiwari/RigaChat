# Vyostra AI — SEO + GEO Audit

**Site:** https://vyostra.com · **Audited:** 2026-09-15 · **Mode:** audit only, no code changed
**Supporting research:** [`research/keyword-clusters.md`](research/keyword-clusters.md) · [`research/brand-and-competitors.md`](research/brand-and-competitors.md)

**How the evidence was gathered**
- Raw HTML was fetched with `curl`. This is what non-JS crawlers (GPTBot, ClaudeBot, PerplexityBot, most link scrapers) see.
- Rendered HTML came from headless Chromium via the repo's own Playwright (`e2e/node_modules`).
  - The gstack `browse` daemon had no active page, and fixing it needs a `--force-restart` that drops its tabs, so it was not used.
  - The claude-seo runtime is not set up (`/seo setup`), so its `render_page.py` could not run.
- The CloudFront distribution `E2ZWB77M7V8J9X` and its viewer-request function were read with the AWS CLI (read-only).
- Keyword and competitor research used web search. That search index is US-located, returns about 6–10 results per query, and shows no AI Overviews or ChatGPT/Perplexity answers. Any claim about AI citations is **inferred** from rankings, listicle mentions and page structure. It was not observed directly.
- No search-volume, difficulty, traffic or CrUX data was available. **No such number appears in this report.** Every score below is a judgement and is marked estimated.

> **Outside SEO scope, but found during this audit:** `github.com/akvinayaktiwari/RigaChat` is **public** (`gh repo view` → `visibility: PUBLIC`; it returns 200 when fetched anonymously). It is the only indexed page linking "VyostraAI" to the product. It exposes the full source, internal docs and CLAUDE.md, including AWS account and resource identifiers. Decide deliberately whether it should stay public. This audit did not check its contents for secrets.

---

## 1. Scores (estimated)

| Score | Value | One-line reason |
|---|---|---|
| **Google SEO** | **27 / 100** (estimated) | Google can render the SPA, but there is no robots.txt, sitemap or schema, unknown URLs return soft 404s, key pages have no meta description or canonical, and the site has almost no indexable content. |
| **AI visibility (GEO)** | **6 / 100** (estimated) | AI crawlers that don't run JS get an empty `<div id="root">` on the homepage and every product page. `site:vyostra.com` returned no pages, and there are no third-party mentions or listings except a LinkedIn page. |

Weighted breakdown behind the Google score. The weights are claude-seo's; each category score is a judgement.

| Category | Weight | Score | Basis |
|---|---|---|---|
| Technical SEO | 22% | 25 | HTTPS, www→apex 301 and TTFB (about 0.24s) are good. Missing robots/sitemap, soft 404s and a client-rendered shell pull it down. |
| Content quality | 23% | 25 | Product pages have 275–330 words each. The only blog post is about budget hotels in pilgrimage towns, off-topic for a chatbot SaaS. Trust claims can't be verified (see issue 7). |
| On-page | 20% | 30 | Titles and descriptions exist only on `/features/*` and `/careers`, and only after JS runs. There is no canonical on any SPA page and no og:image anywhere. |
| Schema | 10% | 0 | No JSON-LD on any page. |
| Performance | 10% | 70 | Lab test on a Moto G4 profile (4× CPU, ~1.6 Mbps): FCP/LCP 2,204 ms, CLS 0.001. This is lab data, not field data. The main JS bundle is 1.06 MB raw. |
| AI search readiness | 10% | 5 | No prerendered product content, no llms.txt, no answer-shaped passages, no entity signals. |
| Images | 5% | 50 | The marketing pages have no `<img>` at all, so there are no alt-text failures, and no og:image, so shared links show no preview image. |

---

## 2. What crawlers actually see (Step 3 checks)

### 2.1 Raw HTML vs rendered HTML

Every SPA route returns the same **1,600-byte** shell (`frontend/dist/index.html`):

```html
<title>VyostraAI — AI Chatbot with Native CRM</title>
... fonts, one JS module, one CSS file ...
<body><div id="root"></div></body>
```

No meta description, no canonical, no OG/Twitter tags, no headings, no body text.

| Route | Raw (no JS): status · bytes | Raw title | Rendered title | Rendered description | Canonical | H1 (rendered) | Words (rendered) |
|---|---|---|---|---|---|---|---|
| `/` | 200 · 1,600 | generic | generic | **none** | none | "Deploy AI agents your customers love to talk to." | 1,164 |
| `/features` | 200 · 1,600 | generic | Features — VyostraAI Lead Generation | yes | none | "Everything you need to never miss a lead" | 275 |
| `/features/chatbot` | 200 · 1,600 | generic | AI Agent for Lead Generation — VyostraAI | yes | none | "Your 24/7 AI sales assistant" | 327 |
| `/features/whatsapp` | 200 · 1,600 | generic | WhatsApp Lead Notifications — VyostraAI | yes | none | "Never miss a lead — get notified instantly" | 331 |
| `/features/crm` | 200 · 1,600 | generic | Built-in Lead CRM — VyostraAI | yes | none | "Every lead, organized automatically" | 302 |
| `/features/forms` | 200 · 1,600 | generic | Smart Form Builder — VyostraAI | yes | none | "Beautiful forms that capture leads" | 293 |
| `/about-us` | 200 · 1,600 | generic | generic | **none** | none | "Built to help modern businesses never miss a single lead" | 293 |
| `/help` | 200 · 1,600 | generic | generic | **none** | none | "Help Center & Knowledge Base" | 510 |
| `/contact` | 200 · 1,600 | generic | generic | **none** | none | "Get in touch" | 105 |
| `/careers` | 200 · 1,600 | generic | Careers at VyostraAI — Work Remotely | yes | none | "Build the future of lead generation — remotely" | 348 |
| `/blog/` | 200 · 18,884 | **prerendered** | Blog — VyostraAI | yes | `/blog` → **302** | "Research from the edge of the market" | 155 |
| `/blog/branded-budget-…/` | 200 · 96,712 | **prerendered** | full meta + article tags | yes | no trailing slash → **302** | — | — |
| `/privacy-policy/`, `/terms-of-service/` | 200 · 38,756 / 27,772 | **prerendered** | yes | yes | no trailing slash → **302** | — | — |

**Why.** `frontend/scripts/prerender.mjs` renders only the routes returned by `getRoutes()` in `frontend/prerender-entry.tsx:110-112`: `/blog`, the blog slugs, `/privacy-policy` and `/terms-of-service`. The homepage and product pages are never prerendered.

Google renders JS on a second, deferred pass, so it probably sees the rendered column eventually (estimated). GPTBot, ClaudeBot, PerplexityBot and OAI-SearchBot generally do not run JS, so they see only the raw column: a title and nothing else.

### 2.2 robots.txt, sitemap.xml, llms.txt

| URL | Result |
|---|---|
| `/robots.txt` | **404** (HTML body) |
| `/sitemap.xml` | **404** (HTML body) |
| `/llms.txt` | **404** |

A missing robots.txt means **all bots are allowed by default**. GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot and Google-Extended are therefore not blocked, but none of them is explicitly allowed, and no sitemap is advertised. `frontend/public/` contains neither file.

### 2.3 Soft 404s (CloudFront)

The viewer-request function `vyostra-www-to-apex-redirect` rewrites **every extensionless path** outside `/blog`, `/privacy-policy` and `/terms-of-service` to `/index.html`. The distribution has no `CustomErrorResponses`. As a result:

- `/pricing` returns 200 and renders a blank page (0 words, no H1).
- `/nonexistent-xyz` returns 200 with the same blank page.
- Paths with an extension (`/robots.txt`) get a real 404, which is correct.

Every mistyped or retired URL becomes an indexable blank 200.

⚠️ **The function source is not in this repo.** It lives only in AWS, so no repo file controls it. The fix needs the function source brought into the repo first (for example `deploy/cloudfront/viewer-request.js`).

### 2.4 Canonicals and trailing slashes

Every prerendered page declares a canonical **without** a trailing slash:
- `frontend/src/pages/BlogIndex.tsx:104`
- `frontend/src/pages/BlogPost.tsx:80`
- `frontend/src/pages/Privacy.tsx:469`
- `frontend/src/pages/Terms.tsx:289`

The S3 website origin answers each of those URLs with a **302** to the trailing-slash version. The canonical therefore points at a temporary redirect, and the page that actually serves content isn't declared canonical. The fix is to canonicalise to the trailing-slash URL, which is the cheap option, or to 301 the slash form away in the CloudFront function.

### 2.5 Open Graph and social

- `/` and all `/features/*` pages have no OG tags at all.
- `/blog/` has og:type, og:title, og:description and og:url, but **no og:image**.
- No page on the site has og:image, so shared links on WhatsApp, LinkedIn and X show no preview image. That matters for a product sold over WhatsApp.

### 2.6 Schema

**None.** Rendered HTML has zero `application/ld+json` blocks on every route checked, including the Organization, SoftwareApplication and FAQPage types this audit looked for.

Real data already in the repo that can back schema:
- **SoftwareApplication with INR offers:** the pricing tiers in `frontend/src/lib/pricingTiers.ts` (Starter ₹1,999/mo, Growth ₹5,499/mo, Agency ₹14,999/mo, 14-day free trial, as rendered on `/`).
- **FAQPage:** 13 real Q&As in `frontend/src/pages/Help.tsx`, for example "How do I embed the chat widget on my website?" and "Is there a free trial?".
- **Organization:** legal entity "Aashirwad Trading Enterprises" (footer), Bangalore (`/about-us`), founders Vinayak Tiwari and Adarsh Jee Pandey (`frontend/src/pages/About.tsx`), LinkedIn `linkedin.com/company/vyostra-ai`.

### 2.7 Brand and entity presence

From `research/brand-and-competitors.md`. G2, Capterra and Crunchbase returned 403 to automated fetches; confirm those manually in a browser.

| Platform | Status |
|---|---|
| Google `site:vyostra.com` | **0 pages** returned |
| LinkedIn | Found: `linkedin.com/company/vyostra-ai` (spelled "Vyostra AI") |
| GitHub | Found: public repo (see note at top) |
| G2 · Capterra · Crunchbase · GetApp · SaaSworthy | Could not verify (403); no search results |
| Product Hunt | Not found (404) |
| Wikidata · YouTube · X · Reddit | Not found |

**Name collisions.** Vyomastra Technologies is a drone company in Mysore, and the search engine's summary already mislabelled vyostra.com as a drone company. Others are Vystra (vystra.com, Vystra Mobile, Vystra Capital), Vystara, VyStar CU, and Vynta AI, which is also a lead-qualification AI.

**Inconsistent spelling.** The site uses "VyostraAI" everywhere (titles, footer, chat widget). LinkedIn uses "Vyostra AI". Entity resolution needs one consistent spelling.

### 2.8 Competitor gap: what earns them citations

Summary; full URLs are in the research file.

| Competitor | Sitemap URLs | What earns visibility that Vyostra lacks |
|---|---|---|
| **Chatbase** | 861 | About 15 `/blog/*-alternatives` pages, `/compare/*`, "best chatbot for website" and "best chatbots for lead generation" posts, `/blog/crm-chatbot` (**3rd** for "AI chatbot with CRM"), 438 docs pages, `llms.txt` and `/llm-info` |
| **Wonderchat** | 729 | `/blog/ai-chatbot-tools-lead-capture` ranked **1st** for the CRM/lead-capture query, with comparison table, 6 FAQs, named author and a "Last update" date. Also `/chatbase-alternative` plus 85 vs/alternative URLs, `/ai-agent-for-real-estate`, `/ai-chatbot-for-whatsapp`, glossary, free tools and the largest llms.txt (14 KB) |
| **Tidio** | 1,167 | `/vs/*` pages, about 98 alternatives posts, "15 Best AI Chatbots", `/blog/real-estate-chatbots`, `/blog/whatsapp-chatbot`, an ROI calculator. G2 seller page title reads "Read 1880 Reviews on G2" |
| **CustomGPT** | 1,317 | `/customgpt-vs-chatbase/` plus 73 other vs/alternatives pages, RAG explainers, a lead-capture topic cluster, `/make-a-real-estate-chatbot/`, free tools |

**Open ground.** None of the four ranked for "AI chatbot for website India" or "WhatsApp chatbot for real estate", and none has a sitemap URL containing "india". Small Indian vendors hold those results: telecrm.in, chatbotbuilder.in, aichatbotindia.com, wacto.in. This is the estimated best opening for Vyostra.

---

## 3. Top 10 issues, ranked by impact × effort

Impact: H/M/L on Google + AI visibility. Effort: S (<½ day), M (1–3 days), L (a week or more).

| # | Issue | Impact | Effort | Evidence | Files to change |
|---|---|---|---|---|---|
| 1 | **robots.txt and sitemap.xml missing** | H | S | `curl /robots.txt` and `/sitemap.xml` both return 404 | Add `frontend/public/robots.txt` (explicitly allow GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot and Google-Extended; disallow `/dashboard`, `/admin`, `/l/`, `/*-test`; add a `Sitemap:` line). Generate `dist/sitemap.xml` from the route list in `frontend/scripts/prerender.mjs`. |
| 2 | **Homepage and product pages not prerendered; AI crawlers see an empty shell** | H | M | `/`, `/features/*`, `/about-us`, `/help` and `/contact` are identical 1,600-byte files with `<div id="root"></div>` | `frontend/prerender-entry.tsx` (mount `LandingPage`, `Features`, `features/*`, `About`, `Help`, `Contact`, `Careers`; widen `getRoutes()`), `frontend/scripts/prerender.mjs`, plus the CloudFront function's `PRERENDERED_PREFIXES`, which is not in the repo. The landing components touch `window` (motion, `useInView`, `AuroraCanvas`) and must be SSR-safe. |
| 3 | **No meta description, canonical or OG tags on `/`, `/about-us`, `/help`, `/contact`** | H | S | Rendered description is `null` on those four. No SPA page has a canonical, and no page has og:image. | `frontend/src/pages/LandingPage.tsx`, `About.tsx`, `Help.tsx`, `Contact.tsx` (add `<Helmet>`). Add canonical and OG tags to `Features.tsx` and `features/*.tsx`. Add a default description to `frontend/index.html`. Add an OG image asset in `frontend/public/`. |
| 4 | **Soft 404s: unknown paths return a blank 200** | M | S–M | `/pricing` and `/nonexistent-xyz` return 200 with 0 words | CloudFront function `vyostra-www-to-apex-redirect`, not in the repo (see 2.3): bring it in, allowlist real SPA routes, send the rest to a real 404. Also add a catch-all `<Route path="*">` with `noindex` in `frontend/App.tsx`. |
| 5 | **Broken internal link `/features/agent`** | M | S | Linked from 4 pages; the route is `/features/chatbot`, so the link renders a blank 200 | `frontend/src/pages/Features.tsx:21`, `features/Forms.tsx:73`, `features/WhatsApp.tsx:82`, `features/Crm.tsx:99`. The comment at `Features.tsx:14` is stale too. |
| 6 | **Zero structured data** | M | S | 0 JSON-LD blocks on every route | `LandingPage.tsx` (Organization + WebSite + SoftwareApplication with `Offer`s in INR from `src/lib/pricingTiers.ts`), `Help.tsx` (FAQPage from its 13 Q&As), `BlogPost.tsx` (Article/BlogPosting with author). Schema only helps AI and non-JS crawlers once issue 2 is fixed. |
| 7 | **Trust claims that can't be verified, and counters that render as 0** | M | S | See the breakdown under this table | `src/components/landing/StatsBar.tsx:15-20`, `HeroSection.tsx:122`, `CTASection.tsx:43`, `TestimonialsSection.tsx`, `pages/LoginPage.tsx:74`, `pages/VerifyEmailPage.tsx:122`, `components/landing/FeaturesSection.tsx:74` |
| 8 | **Canonicals point at 302 redirects** | L–M | S | `/blog` canonical → 302 → `/blog/`; same for the post and both legal pages | `frontend/src/pages/BlogIndex.tsx:104`, `BlogPost.tsx:80`, `Privacy.tsx:469`, `Terms.tsx:289` |
| 9 | **Weak brand entity: inconsistent spelling, name collisions, no off-site profiles** | H | M | `site:vyostra.com` returns 0 pages; the search summary mislabels the domain as a drone company; only LinkedIn is found | Copy: every `— VyostraAI` title suffix in `src/pages/**`, `Footer.tsx`, `Navbar.tsx`, `DemoChat.tsx`. Mostly off-site work: G2, Capterra (capterra.in), Product Hunt, Crunchbase, Wikidata. |
| 10 | **No commercial or India-intent content; the only blog post is off-topic** | H | L | 1 blog post (pilgrimage-town budget hotels). No comparison, alternatives, pricing-explainer or industry page, while competitors run 700–1,300-URL sitemaps. | New pages under `frontend/src/pages/` and posts under `frontend/src/content/blog/posts/<slug>/`, each added to `getRoutes()`. See section 5. |

**Issue 7 evidence:**
- `StatsBar.tsx` hardcodes "50,000+ leads captured", "94% resolution rate" and "500+ businesses live". The same "500+" appears in the hero, the CTA and the login screen.
- The testimonials are initial-only ("Rahul M.", "Priya S.", "Dr. Ankit V.").
- The counters start at 0 and animate on scroll, so any prerender or non-JS read shows "0+ Leads captured".
- "Multi-language widget" appears in `FeaturesSection.tsx:74`, but CLAUDE.md lists multi-language as Phase 2.

This audit could not verify any of these claims. If they are real, keep them and cite where they come from (the memory notes say no analytics exist). If they are not, remove them: AI engines and reviewers treat unsupported numbers as a trust penalty. After prerendering, give the counters their final value in the SSR output.

**Also noted, below the top 10:**
- The main bundle `index-*.js` is 1,061,519 bytes raw (about 283 KB gzip). `App.tsx` has 59 imports and only 2 `lazy()` routes, so dashboard code ships to marketing visitors.
- No HSTS or other security headers on HTML responses.
- Footer links "Changelog" and "Security" point to `#` (`Footer.tsx:11,28`).
- No `llms.txt`. It is low priority: optional, and ignored by Google.

---

## 4. Plan

### Quick wins (this week)

| Track | Actions |
|---|---|
| **Technical** | robots.txt with explicit AI-bot allows and a Sitemap line (#1). Build-time sitemap.xml (#1). Fix `/features/agent` links (#5). Trailing-slash canonicals (#8). Catch-all `noindex` 404 route in `App.tsx` (#4, SPA half). |
| **Content** | Helmet title, description, canonical and OG on `/`, `/about-us`, `/help`, `/contact` (#3). One default og:image. Decide on the unverified stats and testimonials, then keep or remove them (#7). |
| **Schema** | Organization + WebSite + SoftwareApplication (INR offers) on `/`. FAQPage on `/help` (#6). |
| **Off-site/brand** | Pick one spelling ("Vyostra AI"). Update the LinkedIn page's about/website fields. Claim Product Hunt, Crunchbase, G2 and Capterra profiles. Register vyostra.com in Google Search Console and Bing Webmaster Tools and submit the sitemap. |

### 30 days

| Track | Actions |
|---|---|
| **Technical** | Prerender `/`, `/features`, `/features/*`, `/about-us`, `/help`, `/contact`, `/careers` (#2). Bring the CloudFront function into the repo and return real 404s for unknown paths (#4). Split the dashboard into lazy chunks so marketing pages don't load it. Add `llms.txt`. |
| **Content** | Ship the 3 highest-priority pages from section 5: WhatsApp chatbot for real estate India, AI chatbot for website India guide, Chatbase alternatives India. Replace the off-topic post as the blog's only entry. Add answer-shaped intros (40–60-word direct answers) to each feature page. |
| **Schema** | BlogPosting with a `Person` author on posts. `sameAs` on Organization pointing at every claimed profile. `BreadcrumbList` on feature and blog pages. |
| **Off-site/brand** | First 5–10 real customer reviews on G2 or Capterra (India). Publish one launch on Product Hunt. Pitch inclusion in Indian "best AI chatbot" listicles that already rank (haptik.ai, acemindtech.com, aichatbotindia.com; see `research/keyword-clusters.md`). |

### 90 days

| Track | Actions |
|---|---|
| **Technical** | Keep measuring CWV with field data once PSI/CrUX access works (section 6). Add a CI check that fails the build if a public route prerenders to an empty root or lacks a canonical. Consider `hreflang` only if the International ($) plans get their own URLs. |
| **Content** | Complete both hub-and-spoke clusters (section 5): vs pages, INR pricing guide, CRM chatbot explainer, industry pages. Real case studies with named, consenting customers. A lead-qualification question library. |
| **Schema** | Review/AggregateRating only after real third-party reviews exist; never self-authored. `HowTo`-style step content on setup guides (as content, since HowTo rich results are deprecated). |
| **Off-site/brand** | Wikidata item once there are 2 or more independent sources. Comparison-site listings (alternativeto.net, SaaSworthy, Techjockey). Founder-bylined posts on LinkedIn linking back to the pillar pages. Monitor AI answers for the seed queries monthly. This needs a tool (section 6). |

---

## 5. Content plan: 10 pages mapped to keyword clusters

Clusters come from `research/keyword-clusters.md`. Priority is estimated; there is no volume data. 🤖 marks pages built to be quoted in AI answers.

| Priority (est.) | Page / article | Cluster | Target intent | AI-answer target | Suggested URL |
|---|---|---|---|---|---|
| 1 | WhatsApp chatbot for real estate in India (pillar) | D: WhatsApp + real estate India | Commercial | 🤖 "best X in India" + FAQ | `/whatsapp-chatbot-for-real-estate-india` |
| 2 | AI chatbot for website in India: buyer's guide (pillar) | A: AI chatbot for website India | Commercial | 🤖 "best X in India" + FAQ | `/ai-chatbot-for-website-india` |
| 3 | Best Chatbase alternatives for Indian businesses (INR billing, GST invoices, WhatsApp, Hinglish) | E: Alternatives | Comparison | 🤖 comparison table + "best X in India" | `/blog/chatbase-alternatives-india` |
| 4 | AI chatbot pricing in India: SaaS plans vs custom build, in ₹ | B: Pricing INR | Commercial research | 🤖 FAQ, cost-range answer | `/blog/ai-chatbot-price-india` |
| 5 | How to auto-reply on WhatsApp to Facebook Lead Ads | D | Informational / how-to | 🤖 step-by-step answer | `/blog/facebook-lead-ads-whatsapp-auto-reply` |
| 6 | Vyostra AI vs Chatbase vs BotPenguin vs Tidio | E | Comparison | 🤖 comparison table | `/compare/chatbase-botpenguin-tidio` |
| 7 | AI chatbot with built-in lead CRM for Indian SMBs. Frame the CRM as a lead queue, not a full CRM, because the product deliberately is not one. | C1: CRM chatbot | Commercial | 🤖 "best X in India" | `/features/crm` (expand) or `/ai-chatbot-with-crm` |
| 8 | Lead qualification questions for chatbots, by industry (real estate, clinics, edtech) | C2: Lead capture | Informational | 🤖 FAQ / list answer | `/blog/chatbot-lead-qualification-questions` |
| 9 | AI voice agent for real estate in India | D | Commercial | 🤖 FAQ | `/features/voice` or `/ai-voice-agent-real-estate-india` |
| 10 | What is a CRM chatbot? | C1 | Informational / definition | 🤖 definition + FAQ | `/blog/what-is-a-crm-chatbot` |

**Internal linking.** Every spoke links to its pillar and back. The two pillars link to each other, and so do spokes within a cluster.

**Pages to merge.** "Chatbot for small business India" goes into pillar 2. The two pricing queries share one page, as do the Chatbase alternatives India and global queries.

**Every page needs:**
- Prerendering: add it to `getRoutes()`, or it is invisible to AI crawlers.
- A named author.
- A "last updated" date.
- A 40–60-word direct answer under the H1.
- A comparison table where relevant.
- FAQPage schema.
- Real numbers only.

---

## 6. What stayed unchecked, and what would unlock it

| Missing access | What stayed unchecked | What it unlocks |
|---|---|---|
| **PageSpeed Insights API key.** The shared anonymous quota returned `429 Quota exceeded`. | Lighthouse scores and CrUX field Core Web Vitals (LCP/INP/CLS at p75). Only an estimated lab run was done. | Real CWV per URL, and INP, which lab data cannot measure. |
| **Google Search Console** (OAuth / service account on the vyostra.com property) | Whether the site is verified at all, indexed vs excluded pages, how Google renders the SPA, queries and impressions, sitemap status | Ground truth for issues 1–4, and baseline clicks and impressions to measure every fix against |
| **GA4** property access | Organic traffic and landing-page performance. Memory notes say no analytics are installed, so the fix may be installing GA4 first. | Traffic trends and conversion by landing page |
| **DataForSEO** (MCP / API credentials) | India-located (google.co.in) SERPs, search volume, keyword difficulty, AI Overview presence, ChatGPT/LLM mention checks | Real priorities for section 5, replacing the estimates, plus direct AI-citation tracking for Vyostra and competitors |
| **Ahrefs** (the plugin is installed but not authenticated), or **Moz / Bing Webmaster** keys | Backlink profile, referring domains, competitor link gaps | Off-site plan grounded in data, and which listicles and directories link to competitors |
| **Similarweb** (plugin installed, not authenticated) | Competitor traffic estimates and channel mix | Sizing the competitor gap in section 2.8 |
| **claude-seo runtime** (`/seo setup`) | Its `render_page.py`, drift baseline and PDF report generator | Repeatable audits and the PDF report. Rendering was covered here with Playwright instead. |
| **Manual browser check** (bot-blocked with 403) | G2, Capterra, Crunchbase, GetApp and SaaSworthy listings | Confirming the brand table in 2.7 |
