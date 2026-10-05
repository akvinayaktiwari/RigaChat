# SEO + AEO — Handoff for Claude Code (v2)

v1 was written 2026-10-01. v2 was updated 2026-10-02 after a live re-scan of https://vyostra.com and merged with `docs/SEO_GROWTH_PLAN.md`, which adapts the MrRaoAI SEO Growth Playbook. That doc holds the strategy and the reasons behind it. **This doc is the build list.**

Read `docs/SEO_GROWTH_PLAN.md` and `claude/analytics-handoff.md` (the analytics traps) before starting. Never add a tag to `frontend/index.html`, and never track `/dashboard`.

---

## Status as of 2026-10-02

Checked against the live site on 2026-10-02. The sections below this one are the original handoff, left as written; three of its "MISSING" claims were already wrong on the day (see Corrections).

### Done and live

| Handoff item | State |
|---|---|
| §1 Locate prerendering | Done. Schema is rendered per route through React Helmet at prerender time; nothing is in the shared `index.html`. |
| §2 Homepage JSON-LD | Already existed: `Organization`, `WebSite`, `SoftwareApplication` with three `Offer`s built from the pricing constants. Founders added as `Person` nodes with LinkedIn `sameAs`. |
| §3 Blog schema and byline | Done. `BlogPosting` with `author` (`Person`), `datePublished`, `dateModified`, `publisher`; visible byline and "Updated" line. Author is Vinayak Tiwari. |
| §4 `llms.txt` | Done. `200`, `text/plain`, generated from the same list as the sitemap. |
| §5 `/pricing` | Done. Prerendered, in the sitemap, opens with a direct answer, visible FAQ with `FAQPage`. |
| §5 `/faq` | Done. Questions shown on the page are the only ones marked up. |
| §5 `/features/voice-agent` | Done. Linked from `/features/` and from all three voice posts. |
| §6 Sitemap `lastmod` | Done from real dates for all 21 URLs, including the homepage. |
| §6 Blog categories | Done: WhatsApp, Voice AI, Real Estate, Comparison. |
| Verify commands | All four pass on the live site. |
| Core Web Vitals (was an owner task) | Done. Mobile LCP about 1.7 s on the homepage and posts (was 2.3 s and 3.25 s), Lighthouse performance 99. Lab data only; no field data exists yet. |
| CloudFront logs for AI crawlers (was an owner task) | Done on 2026-09-20. |

Not in the handoff, shipped alongside it: prerendered pages hydrate instead of re-rendering, fonts load from one request, accessibility scores 100 on every public page, and a test fails the build on a skipped heading level or an unlabelled dropdown.

### Corrections to the original handoff

- **"JSON-LD: none found on the homepage"** was wrong. It was there on 2026-10-01.
- **"Title about 70 chars"** was wrong. The title is exactly 60 characters, so §6's trim was not needed and was not done.
- **`claude/analytics-handoff.md`** does not exist at that path; the analytics traps are in `prompt-analytics.md`.

### Remaining

| Item | Who | Note |
|---|---|---|
| Search Console: verify, submit sitemap, request indexing for the three new pages | Owner | Most important open item. A web search for "Vyostra AI" on 2026-10-02 returned the GitHub repos, not vyostra.com. |
| Rich Results Test and Schema.org validator on `/` and one post | Owner or Claude | Not run yet. |
| §5 Comparison pages (`/compare/vyostra-vs-kommo`, `-spur`, `-wati`) | Owner, then Claude | Draft at `docs/seo/drafts/compare-pages.md`. Every competitor cell is `TODO: verify`; nothing is routed. Blocked on sourced facts. |
| §2 `FAQPage` on the homepage | Decision | Not added: the homepage has no FAQ section, and the handoff forbids schema for text that is not visible. The FAQ lives at `/faq/`. |
| GA4 key events and UTM allowlist | Owner | Three conversion events ship; `message_index` is still not registered as a custom dimension. |
| Case study with real client numbers | Owner | Needs a client's approval. |
| Gupshup wording in `/faq/`, `/help/` and `llms.txt` | Claude, later | Accurate today. Change all three together once the Meta direct route opens to clients. |

### Next, from the 2026-10-02 GEO analysis

Full detail in `docs/seo/GEO-ANALYSIS-2026-10-02.md` (score 71/100, estimate). In order of value:

1. Search Console verification (above).
2. Make the two public GitHub repos describe the same product as the site. They are the top results for the brand name and say "solo founder" and "for Indian SMBs".
3. One product walkthrough video on YouTube, embedded on the site. No page has an image or a video.
4. Done and live 2026-10-02: `/features/chatbot/`, `/whatsapp/`, `/crm/` and `/forms/` now open with a definition, use question H2s and carry a visible FAQ (459 to 746 words each).
5. Done and live 2026-10-02: `/about-us/` emits `AboutPage` and `/blog/` emits `Blog` with its post list.
6. Add first-hand evidence and outside sources to the two voice posts that cite none.

Five claims the product did not back were corrected in the same release: a "filter by bot" option, an "under 4 seconds" delivery time, "drag and drop" forms, "always accurate" answers, and the contents of the weekly WhatsApp report.

---

## Rules (from CLAUDE.md, not negotiable)

- TypeScript strict, no `any`. Typed inputs and outputs on every function.
- Functions under 40 lines. kebab-case filenames, camelCase functions.
- **`npm test` does not typecheck. Run `npm run build`** (it runs `tsc`).
- One logical change per commit, source and its regression test in the same commit, staged by name. Never `git add .`.
- **Pushing to `main` deploys to production.** Work on a branch. Do not push to `main`.
- Do not rename legacy identifiers (RigaChat, BeepBoop, beepboop.drsyeta.in). Product name in all copy is **Vyostra AI**.

---

## Status — what is already live (VERIFIED 2026-10-02 via a headless browser)

Do not rebuild these. Read the code that produces them and reuse its patterns.

```
DONE
  JSON-LD on every page checked, one @graph per page:
    /                        Organization (2 founders, LinkedIn), WebSite, SoftwareApplication (3 USD offers)
    /blog/<slug>/            Organization, BlogPosting (author, datePublished, dateModified), BreadcrumbList, FAQPage
    /pricing/                SoftwareApplication, WebPage, BreadcrumbList, FAQPage (7 Q), USD + INR prices
    /faq/                    WebPage, BreadcrumbList, FAQPage (12 Q)
    /features/voice-agent/   WebPage, BreadcrumbList, FAQPage (5 Q), links to the 3 voice posts
  visible author byline on blog posts ("By Vinayak Tiwari, Co-Founder & Builder")
  answer-first intros and question-style H2s on the new pages
  robots.txt allows all AI crawlers; canonicals correct; all checked pages return 200

PARTIAL / UNCONFIRMED
  /llms.txt        one fetcher saw text/plain, another saw 404. Confirm with curl -sI.
  sitemap.xml      the live file still lists the OLD 18 URLs: /pricing/, /faq/, /features/voice-agent/ are MISSING
  homepage title   "Vyostra AI — AI Chatbot with Lead CRM and WhatsApp Follow-up" is about 61 chars (target 60 or fewer)

NOT DONE
  /compare/* pages
  /industries/* and /integrations/* pages
  GA4 key events + UTM allowlist (analytics handoff §1, trap 4)
  free tools (link-earning assets)
```

Content bug to fix: `/faq/` says lead alerts need "a Gupshup account". The project docs say WhatsApp moved to Meta's direct API. **Ask the owner which is true before changing the copy.**

---

## The work, in order

Branch first, e.g. `seo/growth-v2`. One numbered task = one or more commits. Run `npm run build` and `npm test` before each commit.

### 1. Sitemap: include every prerendered marketing route (P0)

Find where `sitemap.xml` is generated (**UNVERIFIED** location; search `scripts/`, `frontend/scripts/`, `prerender.mjs`). Derive sitemap entries **from the same route list prerender uses**, so a new page cannot be prerendered without also appearing in the sitemap. Exclude everything in robots.txt's disallow list.

`lastmod` comes from real content dates: front-matter for posts, and a `lastModified` field in each page's data file for static pages. Never use `new Date()` at build time, which would mark every page modified on every deploy.

Test: unit test that every prerendered public route is in the generated sitemap, and that no `/dashboard`, `/admin`, `/auth/`, `/l/` or `/api/` route is.

Verify after deploy: `curl -s https://vyostra.com/sitemap.xml | grep -c '<loc>'` should be at least 21.

### 2. Homepage title 60 characters or fewer (P0)

Suggested: "Vyostra AI: AI Chatbot, Voice & WhatsApp Lead CRM" (49). Update `og:title` to match. Check that no prerender snapshot or test pins the old string.

### 3. Confirm `/llms.txt` (P0)

`curl -sI https://vyostra.com/llms.txt` must return 200 with `text/plain`. If it is a 404, or CloudFront rewrites it to `index.html`, fix the public-dir copy step and `deploy.sh` upload. Content: a one-paragraph description, then link lists for Product (pillars), Pricing, FAQ and Blog, each with a one-line description.

### 4. Blog post template standard (P1)

Make the blog template **enforce** what the growth plan requires, so every future post gets it automatically:

- Typed front-matter, required at build: `title` (60 chars or fewer, fail the build if longer), `description` (160 or fewer), `datePublished`, `dateModified`, `cluster` (one of `whatsapp | chatbot | voice | crm | comparison`), `faqs[]`.
- FAQ block rendered visibly **and** as FAQPage JSON-LD from the same `faqs[]` array, so schema can never drift from visible text.
- A "Related" block of 3-5 posts from the same `cluster`, plus a link to the cluster's pillar page. The pillar map is: whatsapp → `/features/whatsapp/`, chatbot → `/features/chatbot/`, voice → `/features/voice-agent/`, crm → `/features/crm/`.
- A visible "Updated <date>" line whenever `dateModified` is later than `datePublished`.

Read `docs/BLOG_AUTHORING.md` first and update it to document these fields. Do not break the 5 existing posts: backfill their front-matter in the same commit.

### 5. `/industries/<slug>/` template (P1, programmatic)

Data-driven pages, one typed data file per industry. Each page **must** have distinct fields, enforced by the type: `headline`, `answerFirstIntro`, `qualifyingQuestions[]` (what the agent asks this industry's leads), `sampleFlow[]`, `faqs[]`, `relatedPosts[]`, `lastModified`. Render WebPage, BreadcrumbList and FAQPage JSON-LD. Add the pages to the prerender route list (and so to the sitemap via task 1).

Ship **real estate only** in this task, because it has existing posts to link. The owner writes copy for further industries (clinics, coaching institutes, home services, auto dealers, interior designers). Do not generate filler copy for them: thin duplicate pages hurt more than they help. Add a test that fails if two industry files share the same `answerFirstIntro`.

### 6. `/integrations/<slug>/` template (P1)

Same pattern as task 5. **Only for integrations that ship today**: verify in the codebase that Zoho CRM sync, Meta Lead Ads and WhatsApp exist and work. Do not create HubSpot or Salesforce pages unless the code exists.

### 7. `/compare/<slug>/` template (P2, gated)

Typed rows: `{ feature, vyostra, competitor, sourceUrl, checkedOn }`. The build **fails** if any competitor cell lacks `sourceUrl` and `checkedOn`. Pages carry `verified: boolean`. Pages with `verified: false` are excluded from prerender, the sitemap and navigation. Scaffold `wati`, `interakt`, `gallabox`, `aisensy` and `tidio` with all competitor cells `TODO` and `verified: false`. The owner fills them in and verifies them.

### 8. Free tool: WhatsApp click-to-chat link generator (P2, link-earning asset)

Page `/tools/whatsapp-link-generator/`. It builds a `wa.me` link and a QR code from a phone number and a prefilled message. **Entirely client-side: nothing is sent to any server, no analytics event carries the number or message.** Give it an answer-first intro, a FAQ, and a CTA to `/features/whatsapp/`. Use WebApplication JSON-LD. If a QR library is needed, choose a small, maintained one and note the bundle impact.

### 9. Analytics events (P1, cross-reference)

Implement `claude/analytics-handoff.md` §1 (`generate_lead`, `sign_up`) and trap 4 (the UTM allowlist). The weekly SEO scoreboard ties clicks to leads only once these exist. Follow that doc exactly; do not duplicate its spec here.

### 10. IndexNow (P3, optional)

Bing feeds ChatGPT search. On deploy, ping IndexNow with the changed URLs. Host the key file in the public dir. Only do this if `deploy.sh` has a clean post-deploy hook. Skip it if it complicates CI.

---

## Do not do

- No JSON-LD in the shared `frontend/index.html`.
- No schema for content that is not visible on the page.
- No invented authors, social URLs, ratings, `aggregateRating`, reviews, testimonials or customer logos.
- No unverified competitor claims live (task 7 gates this).
- No thin programmatic pages: city pages, or industries without owner-written copy.
- No keyword-stuffed anchor text in the widget or footer. Internal links use descriptive anchors, not exact-match spam.
- Do not touch `/dashboard` tracking or `UNTRACKED_PREFIXES`.
- Do not push to `main`.

---

## Verify (the live HTML is the truth, not the green check)

```
curl -s https://vyostra.com/sitemap.xml | grep -c '<loc>'
curl -s https://vyostra.com/ | grep -o '<title>[^<]*'
curl -sI https://vyostra.com/llms.txt
curl -s https://vyostra.com/industries/real-estate/ | grep -c 'FAQPage'
curl -s https://vyostra.com/tools/whatsapp-link-generator/ | grep -c 'WebApplication'
```

Then run the new pages through Google's Rich Results Test and the Schema.org validator.

---

## Owner tasks (not code; do these in parallel)

1. **Verify `vyostra.com` in Google Search Console** (Domain property, DNS TXT at Hostinger). Submit the sitemap. Link it to GA4. Every growth step depends on this.
2. Import the site into Bing Webmaster Tools from GSC.
3. Run PageSpeed Insights on `/`, `/pricing/` and one blog post. Share LCP, INP and CLS.
4. Confirm the Gupshup vs Meta lead-alert wording on `/faq/`.
5. Write copy for the next industries, and verify the competitor tables for task 7.
6. Backlinks: directory listings (Zoho Marketplace, G2, Capterra, SaaSworthy, Product Hunt), client case studies (Drsyeta, Wonderise), data-PR report. See the growth plan §6.
7. Publishing: 3 posts a week from the growth plan's clusters. Check each topic against autocomplete and People Also Ask first.

## Success looks like

Sitemap lists every public page with real dates. Homepage title at 60 characters or fewer. `/llms.txt` returns 200. The blog template enforces FAQ schema and related links. `/industries/real-estate/`, the `/integrations/*` pages and the link-generator tool are live and prerendered. Compare pages are scaffolded but hidden until verified. No regressions in `npm run build` or `npm test`. Re-scan once GSC has 4 weeks of data and start the weekly scoreboard.
