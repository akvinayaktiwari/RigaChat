# Vyostra AI — SEO Growth Plan

Adapted from the MrRaoAI "SEO Growth Playbook" (500 → 200k impressions / 50k clicks) to where vyostra.com actually stands on 2026-10-02. Read alongside `docs/SEO_AEO_HANDOFF.md` and `claude/analytics-handoff.md`.

---

## 1. Honest targets

The playbook's 50k clicks assumes heavy branded and bottom-funnel traffic in positions 1-3. Vyostra today has **0 real referring domains**, no Search Console data, and about 10 indexable content pages, in a competitive national B2B SaaS niche. The playbook itself says such niches take 6-12 months.

Working targets (revise once GSC has 4 weeks of data):

| By | Impressions / month | Clicks / month | Indexed pages | Real referring domains |
|---|---|---|---|---|
| Week 4 | first data in GSC | — | 25 | 5 |
| Week 12 | 15k–30k | 500–1,500 | 60 | 20 |
| Month 6 | 80k+ | 4k+ | 120 | 50 |

These are planning targets, not forecasts. The click target matters more than impressions: clicks come from commercial and comparison pages, plus branded search.

## 2. The three levers, applied

- **Coverage:** go from about 10 content pages to 60 in 12 weeks, through clusters and programmatic pages.
- **Position:** striking-distance work needs GSC data. That is blocked until Search Console is verified.
- **Click capture:** titles under 60 characters, FAQ schema (already live), and brand queries ("Vyostra AI pricing", "Vyostra AI reviews").

---

## 3. Phase 0 — Foundation (Week 1)

| Item | Status 2026-10-02 | Owner / action |
|---|---|---|
| Google Search Console | **NOT VERIFIED — top blocker** | Owner: verify `vyostra.com` as a Domain property via DNS TXT at Hostinger. Submit the sitemap. Link it to GA4 (see analytics handoff §4). |
| Bing Webmaster Tools | Not set up | Owner: import from GSC (one click). Bing also feeds ChatGPT search. |
| Sitemap complete | `/pricing/`, `/faq/`, `/features/voice-agent/` missing from the live sitemap | Claude Code: fix sitemap generation and use real `lastmod` dates. |
| Indexing check | Unknown | After GSC: check the Pages report for "Discovered / Crawled – not indexed". Request indexing for the new pages. |
| robots / noindex / canonical | Pass | — |
| HTTPS, one canonical host | Pass (vyostra.com) | Confirm `www.vyostra.com` 301-redirects to the apex. |
| Core Web Vitals | Unknown | Owner: run PageSpeed Insights on `/`, `/pricing/` and one blog post. Target LCP < 2.5s, CLS < 0.1. |
| Internal links (3 clicks) | Mostly fine | Every new page gets linked from its pillar and from the blog index. |
| GA4 conversions | Missing `generate_lead` / `sign_up`; UTMs stripped | Claude Code: analytics handoff §1 and trap 4. |

## 4. Phase 1 — Quick wins (Weeks 1-4)

1. **Striking distance (positions 8-20):** possible only once GSC has about 2 weeks of data. Then, for each query: put the exact query in the title and H1, expand the matching section, add FAQs, refresh the date, add 3 internal links with the query as anchor, and re-request indexing.
2. **Titles and metas for CTR:** rewrite every page that ranks 3-15. Keyword first, then a year or number, then a benefit. Keep titles under 60 characters. Do the homepage title now; it is about 61 characters.
3. **Branded queries:** make sure these all rank and resolve:
   - `Vyostra AI` → homepage
   - `Vyostra AI pricing` → `/pricing/` (live)
   - `Vyostra AI reviews` → needs real G2/Capterra listings (see Phase 3). Never fabricate reviews.
   - `Vyostra AI login`, `Vyostra AI WhatsApp`, `Vyostra AI vs <competitor>`

## 5. Phase 2 — Cluster engine (Weeks 2-12)

Cadence: **3 posts a week = 36 pages in 12 weeks**, plus programmatic pages. Mix: about 40% commercial/comparison, 60% informational. Every candidate below is a hypothesis. Validate wording with Google autocomplete, People Also Ask, AlsoAsked and Keyword Planner before writing. Do not invent search volumes.

### Cluster A — WhatsApp lead automation (pillar: `/features/whatsapp/`)
Existing: `whatsapp-chatbot-for-real-estate-india`.
Candidates: WhatsApp Business API vs WhatsApp Business app for lead follow-up · the WhatsApp 24-hour window explained · WhatsApp template messages for lead follow-up (with examples) · how to send Meta lead ad leads to WhatsApp instantly · click-to-WhatsApp ads: lead qualification flow · WhatsApp CRM for small businesses in India · WhatsApp opt-in rules for Indian businesses.

### Cluster B — AI chatbot for lead generation (pillar: `/features/chatbot/`)
Candidates: AI chatbot for website lead generation (India guide) · how to train a chatbot on your website content · chatbot vs contact form: which converts better · AI chatbot pricing in India (links to `/pricing/`) · questions a lead-qualification chatbot should ask · stopping a chatbot from making things up (grounded answers).

### Cluster C — Voice AI (pillar: `/features/voice-agent/`)
Existing: 3 posts. Candidates: voice agent latency, explained for buyers · Hindi/Hinglish voice AI: what works today · voice agent for clinics / coaching institutes.

### Cluster D — Lead CRM and follow-up (pillar: `/features/crm/`)
Candidates: lead response time: why 5 minutes matters · lead follow-up sequence templates for Indian SMBs · Zoho CRM + AI chatbot integration guide · how to track lead source from Meta ads to a closed deal.

### Comparison and commercial (highest click value; build first once facts are verified)
`/compare/vyostra-vs-wati/`, `-vs-interakt/`, `-vs-gallabox/`, `-vs-aisensy/`, `-vs-tidio/`, plus "best WhatsApp CRM for real estate in India", "best AI chatbot for Indian SMBs". Rule: every competitor claim is cited and dated. No unverifiable claims.

### Programmatic pages (Hack 13)
Templates with genuinely different content per page, never thin duplicates:
- `/industries/<industry>/`: real estate, clinics, coaching institutes, home services, automobile dealers, interior designers. Each page carries industry-specific qualifying questions, a sample flow and FAQs.
- `/integrations/<tool>/`: Zoho CRM, Meta Lead Ads, WhatsApp. Add HubSpot or Salesforce **only if the integration actually ships**.
- Skip city pages unless there is real local-service content. Vyostra is a SaaS product, not a local business.

### Page standard (Hack 7)
Answer in the first 2 sentences · question-style H2s · tables and lists · FAQ section with FAQPage schema · one piece of original material per page (a screenshot, flow diagram, template or anonymised platform data) · author byline · 3-5 internal links out and 3-5 in.

## 6. Phase 3 — Authority (Weeks 4-16)

Current state: domain score 8, 9 referring domains, **all spam and nofollow**. Do not disavow; do not buy PBN or Fiverr links (the playbook agrees).

1. **Listings:** Zoho Marketplace, G2, Capterra/GetApp, SaaSworthy, AlternativeTo, Product Hunt launch, There's An AI For That, Startup India.
2. **Client links:** Drsyeta and Wonderise case studies, plus a branded "Powered by Vyostra AI" link in the widget (`rel="nofollow"`, with client consent).
3. **Data PR:** a "State of lead response in Indian real estate" report from anonymised platform data. Pitch it to YourStory, Inc42 and real-estate trade media.
4. **Free tools:** a WhatsApp click-to-chat link generator and a lead response time ROI calculator.
5. **Journalist queries:** Qwoted, Featured, Help a B2B Writer.
6. **Competitor gap:** who links to Wati, Interakt and Gallabox → pitch the same listicles.
7. **Unlinked mentions:** search "Vyostra AI" monthly and ask those sites for a link.
8. **Paid placements (GetReach shortlist):** a few at most, disclosed as `rel="sponsored"`.
9. **Google Business Profile** (Bangalore): low priority, but helps branded search.
10. **Repurposing (Hack 10):** each post → a LinkedIn post from Vinayak or Adarsh, a YouTube/Shorts walkthrough, and an email. This drives branded search.

## 7. Phase 4 — Compound (ongoing)

- **Refresh loop** every 4-6 weeks: update stats and dates, add sub-questions surfaced in GSC, improve internal links, re-request indexing.
- **Internal linking:** strongest pages (homepage, `/pricing/`, pillars) point to the pages you most want to rank. Use descriptive anchors.
- **SERP features:** FAQ and Breadcrumb schema are live. Add HowTo where a post is a real step-by-step. Give images descriptive filenames and alt text.

## 8. Weekly GSC scoreboard (every Monday)

Track: total impressions and clicks · average CTR · query count in positions 1-3 / 4-10 / 11-20 · indexed pages · top 5 gaining and losing pages · new referring domains (from the GSC Links report) · leads with `source_post` from GA4.

Once GSC is verified, this can run as a scheduled Claude task each Monday.

## 9. Tasks for Claude Code (repo work)

Work on a branch. Follow CLAUDE.md: no `any`, functions under 40 lines, run `npm run build`, commit in chunks, never push to `main`.

1. Add `/pricing/`, `/faq/` and `/features/voice-agent/` to sitemap generation, using real `lastmod` dates.
2. Trim the homepage `<title>` to 60 characters or fewer, plus the matching OG title.
3. Build the `/industries/<slug>/` template from a typed data file. One file per industry, with distinct copy fields. Render FAQPage and BreadcrumbList. Add each page to prerender and the sitemap. Ship real estate first.
4. Build the `/integrations/<slug>/` template the same way, only for shipped integrations.
5. Build the `/compare/<slug>/` template with a cited-claims field per row. Keep these pages out of the sitemap until the owner marks them verified.
6. Make the blog template enforce: an answer-first intro, an FAQ block with schema, and a related-posts block of 3-5 same-cluster links.
7. Build a free tool: a WhatsApp click-to-chat link generator page (client-side only, no PII leaving the browser).
8. Analytics: `generate_lead`, `sign_up` and the UTM allowlist from the analytics handoff.

## 10. Owner tasks (cannot be done in code)

- Verify Search Console and Bing Webmaster Tools. **Do this first.**
- Run PageSpeed Insights and share the results.
- Set up directory and marketplace listings, and ask Drsyeta and Wonderise for case studies.
- Approve the publishing calendar: 3 posts a week from the clusters above.
- Verify competitor facts before the compare pages go live.
