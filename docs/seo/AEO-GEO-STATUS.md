# AEO / GEO Status — vyostra.com

**The one file to read first.** What has shipped for search and answer-engine visibility, what is left, and who has to do it. Last updated: 2026-10-06. Next steps: `HANDOFF-2026-10-05.md` and, for the global market move, `GLOBAL-MARKET-HANDOFF.md`.

How to keep it current: when something ships, move its row from "To do" to "Implemented" with the date. Do not record plans here; plans live in the documents listed at the bottom.

Framing: Google's own guidance is that optimizing for AI search is ordinary SEO. A page must be indexed and snippet-eligible in Google Search before it can appear in AI Overviews or AI Mode. `llms.txt` and schema added "for AI" are not Google levers.

---

## Where things stand

| Measure | Value | Date | Note |
|---|---|---|---|
| GEO readiness (estimate) | 71 / 100 | 2026-10-02 | From `GEO-ANALYSIS-2026-10-02.md`, before the feature-page rebuild. Baseline was 63 on 2026-09-19. |
| Indexed in Google | Unknown | — | Search Console is not verified. This is the top blocker. |
| Public pages in the sitemap | 30 | 2026-10-05 | All dated. The two posts published late on 2026-10-05 were the 29th and 30th. |
| Blog posts | 9 | 2026-10-05 | Four published 2026-10-05: Meta lead ads auto-reply, click-to-WhatsApp vs lead forms, real estate chatbot qualification questions, and what a CRM chatbot is. |
| Mobile LCP (lab) | about 1.7 s | 2026-10-02 | Was 2.3 s on the homepage and 3.25 s on a post. No field data yet. |
| Lighthouse accessibility | 100 | 2026-10-02 | On every public page audited. |
| Real referring domains | 0 known | 2026-10-02 | Not in the Common Crawl graph; all six competitors checked are. |
| Brand presence off-site | LinkedIn, X and GitHub | 2026-10-06 | X account `x.com/vyostra_ai` added. Nothing on YouTube, Reddit or Wikipedia. |

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
| App shell title (`index.html`, shown on login, signup and the dashboard) matches the homepage title; it still said "AI Chatbot with Native CRM" | 2026-10-05 |
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
| Real estate industry page | `WebPage`, `FAQPage`, `BreadcrumbList` | 2026-10-05 |
| Contact | `ContactPage`, `BreadcrumbList` | 2026-10-04 |
| Careers, privacy policy, terms of service | `WebPage`, `BreadcrumbList` | 2026-10-04 |
| WhatsApp link generator | `WebPage`, `FAQPage`, `BreadcrumbList` | 2026-10-02 |
| Help | `FAQPage` | 2026-09-19 |

Rule held throughout: schema only for text the page shows. No ratings, no reviews.

### Content and citability

| What | Shipped |
|---|---|
| Developer docs at `/docs/`: seven prerendered pages (quickstart, API keys, REST reference, errors and rate limits, widget embeds, lead sync, building with Claude/ChatGPT/Cursor). Each opens with a 40 to 70 word answer, uses question headings, and publishes `TechArticle` + `FAQPage`. Listed in the sitemap and under "Developers" in `llms.txt`. A page is a directory under `frontend/src/content/docs/pages/`. Target query: "chatbot api" (about 260 searches a month in India, difficulty 12, measured 2026-10-05) | 2026-10-05 |
| "What is Vyostra AI?" definition block on the homepage | 2026-09-19, restyled 2026-10-02 |
| `/pricing/`, `/faq/`, `/features/voice-agent/` | 2026-10-02 |
| Chat agent, WhatsApp, CRM and forms pages rebuilt: definition in the first paragraph, question H2s, five visible FAQ answers each | 2026-10-02 |
| Free tool: `/whatsapp-link-generator/` | 2026-10-02 |
| Zoho CRM integration page: `/features/zoho-crm/` | 2026-10-03 |
| Meta Lead Ads integration page: `/integrations/meta-lead-ads/`, with an index at `/integrations/`. Every claim rechecked against the backend on 2026-10-05 | 2026-10-03 |
| WhatsApp and Zoho CRM have no page under `/integrations/` on purpose: the index links each to its feature page, so two pages do not compete for one search | 2026-10-03 |
| Author byline, "Updated" date and four fixed categories on posts | 2026-10-02 |
| Question H2s in posts; Meta and WhatsApp primary sources cited in the WhatsApp post | 2026-09-19 |
| Question sub-headings in the two long sections of the WhatsApp post. The pilgrimage post needed none: its long block is a data table and its sections already carry sub-headings | 2026-10-04 |
| Footer links the company's LinkedIn and X profiles on every public page; the Organization `sameAs` reads the same list, and every page carries `twitter:site` | 2026-10-06 |
| Internal links: help in the footer, feature pages to related posts, latest posts on the homepage, related posts on each post | 2026-09-19 |
| The WhatsApp real estate post links the two ad-lead posts from its lead-source table | 2026-10-05 |
| Two posts chosen from keyword data (OpenSEO, India): `/blog/real-estate-chatbot-lead-qualification-questions/` for "real estate chatbot" (about 480 searches a month) and `/blog/what-is-a-crm-chatbot/` for "crm chatbot" (about 90) | 2026-10-05 |
| Real estate industry page: `/industries/real-estate/`, linked from the footer. Written against the prebuilt real estate journey and its WhatsApp templates | 2026-10-05 |
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

### Global market (USD only)

The owner's decision on 2026-10-06: Vyostra AI sells globally and quotes US dollars only. This goes further than `GLOBAL-MARKET-HANDOFF.md`, which kept a rupee option for India; where the two disagree, this section is what shipped.

| Item | Shipped |
|---|---|
| Prices in USD only. The India (₹) toggle, the timezone region guess, the rupee line under each plan on `/pricing/` and the "cost in India" FAQ are gone. Checkout sends no currency | 2026-10-06 |
| `POST /api/billing/subscribe` creates USD subscriptions only. A request that still names INR (a tab opened before the change) is refused with a 400 rather than charged in dollars. A checkout abandoned on an INR plan is released, not resumed | 2026-10-06 |
| Shared pages read as global: footer, homepage "What is Vyostra AI", About (title, description and body), `llms.txt` summaries, Careers. Bangalore stays as the headquarters fact | 2026-10-06 |
| `Organization` schema has `areaServed: Worldwide`; `WebSite` and `BlogPosting` use `inLanguage: en` (was `en-IN`). No hreflang, on purpose: one English site | 2026-10-06 |
| Homepage walkthrough and feature-page mockups use a dollar budget, bedrooms and numbers from several countries instead of crore, BHK, NEET and +91 | 2026-10-06 |
| Every blog post declares a `market` (`global`, `us`, `uk`, `ca`, `au`, `ae`, `in`). The registry refuses a post without one. The label is printed beside the category, the index filters by it, and a market post publishes `spatialCoverage`. Six posts are `in`; three are `global` (the Facebook lead ads post lost "in India" from its title) | 2026-10-06 |
| WhatsApp link generator: the format answer names the country code for each market, and the picker leads with the US, UAE, UK, Australia, India and Canada | 2026-10-06 |
| Zoho CRM connects accounts in any Zoho data centre (US, EU, India, Australia, Japan, Saudi Arabia, Canada): the callback's `accounts-server` decides where the code is redeemed, and the data centre is stored with the tokens. **Not yet proven against a live non-India account**, so `/features/zoho-crm/` still says India only (owner task 26) | 2026-10-06 |
| Terms section 4 says prices are in USD (was INR). The rest of the sentence, and the Privacy page, are unchanged pending legal review (owner task 25) | 2026-10-06 |

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
| `app-shell-title.test.ts` | The title in `index.html` differs from the homepage title, or the shell gains a second title |
| `industries.test.tsx` | Two industries share an opening answer, an industry page drops its questions, flow or limits, links an unpublished post, or publishes FAQ schema for hidden text |
| `crawl-files.test.ts` | A sitemap URL has no route, no date, or no CloudFront prefix |
| `hydration-contract.test.ts` | The prerender and the browser stop rendering the same tree |

---

## To do

### Owner tasks (cannot be done from the repo)

| # | Task | Why it matters |
|---|---|---|
| 0a | **Publish the CloudFront function after the docs merge**: `./scripts/deploy-cloudfront-function.sh` | Until it runs, `/docs/...` is answered with the empty app shell. People see the page; crawlers and AI engines see nothing. CI does not ship the function. |
| 0b | A stable API hostname such as `api.vyostra.com` | The API is served from a Lambda Function URL, so the docs print no host and send developers to Settings for it. With a stable host the examples can be copy-paste complete. |
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

| 25 | Legal review of Terms and Privacy for international customers | Terms now says "Prices in USD, inclusive of applicable taxes"; only the currency was changed. Privacy states data is held in `ap-south-1` (Mumbai), which needs a lawful transfer basis for EU/UK customers and a check against UAE data protection law. |
| 26 | Enable multi-data-centre on the Zoho OAuth client (Zoho API Console), then connect one zoho.com or zoho.eu account and sync one lead | The code is in place but unproven outside India. When enabling it, choose the same client ID and secret for every data centre: the code sends one secret to all of them. Once a non-India account syncs, the India-only sentence on `/features/zoho-crm/` can go and global content may mention Zoho. |
| 27 | Remove `RAZORPAY_PLAN_ID_STARTER_INR`, `_GROWTH_INR` and `_AGENCY_INR` from the three Lambdas, and archive the three INR plans in Razorpay | Nothing reads them any more. Removing them also frees room under the Lambda's 4 KB environment ceiling. |
| 28 | A USD ad-spend figure for the Head of Sales bio on `/about-us/` | The "₹10L+ a month" figure was removed rather than converted. The bio now says "Has managed monthly ad spend for developers." |
| 29 | Confirm the "Real Estate Developer, Bengaluru" testimonial is real and approved | Left as it is. It is the one India-specific line still on the homepage. |
| 30 | Decide on a per-account default country for phone numbers | `frontend/src/lib/phone.ts` still assumes a bare 10-digit number is Indian, so a US lead typed without +1 gets a wrong WhatsApp link. No single constant is right; it needs an account setting. |
| 31 | Test the chat and voice agents in Arabic, including right-to-left rendering in the widget | "arabic chatbot" has about 2,400 searches a month in the UAE. No Arabic claim may be published until this passes. |
| 32 | Decide telephony priority | "AI receptionist" is the largest query in the set (about 49,500 a month in the US) and means phone answering. Content must not call Vyostra AI an AI receptionist until phone answering is live. |

### Claude tasks, ready now

| # | Task | Note |
|---|---|---|
| 12 | Further industry pages (clinics, coaching institutes, home services and others) | The template and real estate shipped 2026-10-05. Each further industry needs copy from the owner: a content file in `frontend/src/content/industries/`, with nothing generated. |
| 13 | A top-level URL that matches no route (for example `/no-such-page`) returns 200 with the app shell, which then shows "not found" in the browser | A soft 404. Fixing it means teaching the CloudFront function which top-level paths the app really has. Low priority: nothing links to such URLs. |
| 14 | Embed the walkthrough video once it exists, with `VideoObject` | Depends on 5. |
| 15 | A diagram in each post, with `image` on `BlogPosting` | Needs design assets or a decision to draw them in SVG. |
| 16 | A built-in QR code for the link generator | Needs a small library. |
| 17 | The twelve posts in `GLOBAL-MARKET-HANDOFF.md` section B3, starting with the global pillars (WhatsApp CRM, real estate chatbot, speed to lead) | None written yet. Each needs its keyword data re-pulled and every market rule cited from a primary source. Prices in USD; the handoff's "INR available in India" lines are superseded. |
| 17a | Make `/industries/real-estate/` global with market sections | Waits for the market posts it would link to: no market section without three real posts behind it. The compliance line already names RERA and Trakheesi as examples. |

### Blocked

| # | Task | Blocked on |
|---|---|---|
| 18 | Comparison pages | Owner task 7. |
| 19 | Outside sources and first-hand evidence for the two voice posts that cite none | Real measurements or transcripts from the owner. |
| 20 | Sources for the pilgrimage post's figures | The owner's source list. |
| 21 | Change "Gupshup" wording in `/faq/`, `/help/`, `/features/whatsapp/` and `llms.txt` | Accurate today. Change all four together when the Meta direct route opens to clients, after WhatsApp App Review. |
| 22 | `purchase` event | A first real charge. Charges are in USD only since 2026-10-06, so the INR currency trap in `prompt-analytics.md` no longer applies to new payments. |
| 23 | Striking-distance work and the weekly scoreboard | Search Console data (owner task 1). |
| 24 | Three posts a week from the clusters | Keyword validation, which needs Search Console or a keyword tool. |

---

## Related documents

| File | What it is |
|---|---|
| `docs/seo/GEO-ANALYSIS-2026-10-02.md` | Latest scored analysis, with per-crawler access and passage-level detail |
| `docs/seo/GEO-AUDIT-2026-09-19.md` | The baseline audit (63/100) and its commit record |
| `docs/seo/GEO-FIX-PLAN.md` | The original fix plan and its progress log |
| `docs/seo/GLOBAL-MARKET-HANDOFF.md` | The global market handoff: markets, keyword data and the first twelve posts. Its INR guidance is superseded by the USD-only decision above |
| `docs/SEO_AEO_HANDOFF.md` | The handoff this round of work started from, with a status section |
| `docs/SEO_GROWTH_PLAN.md` | The 6-month growth plan: clusters, programmatic pages, authority |
| `docs/seo/drafts/compare-pages.md` | Comparison page drafts, unpublished |
| `docs/seo/CONTENT-STRATEGY.md`, `docs/seo/research/` | Content markets and keyword clusters |
| `prompt-analytics.md` | Analytics rules and traps |
