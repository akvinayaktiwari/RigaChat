# Vyostra AI: global market handoff (platform + content)

Written 2026-10-06 for Claude Code, working in the RigaChat repo. **This supersedes every "Indian SMB" audience line** in `docs/SEO_GROWTH_PLAN.md`, `docs/SEO_AEO_HANDOFF.md`, `docs/seo/HANDOFF-2026-10-05.md` and the blog authoring notes.

## The decision

Vyostra AI sells **globally**. India is one market among several, not the default.

| Priority | Market | Why |
|---|---|---|
| 1 | United States | Largest demand for every core term (see keyword data) |
| 1 | United Arab Emirates (Dubai first), then wider GCC | WhatsApp-first buyers, active real estate market, very low keyword difficulty |
| 2 | United Kingdom | Heavy WhatsApp use; strong "AI receptionist" and "WhatsApp CRM" demand |
| 2 | Australia | Strong "AI receptionist" and real estate CRM demand |
| 2 | India | Largest WhatsApp search demand; existing content cluster |
| 3 | Canada | Follows US patterns; add once the US cluster exists |

What this means:

- The **site default voice is global English** (US spelling). Nothing on a shared page (home, pricing, features, footer, about) should assume the visitor is Indian.
- **Market-specific content is welcome**, as long as it is clearly labelled: a post for Dubai brokers, a post for Australian agencies, a post for Indian developers. Each states its market in the title and first paragraph.
- **Existing India posts stay.** They are the India cluster. Do not rename their slugs (that would throw away whatever signals they have earned). Tag them with a market instead (task A9).

---

## Priority update (2026-10-06): comparison pages and original research move up

After reviewing a current tactic ranking (comparison pages, brand mentions and original research scored highest for rankings and AI visibility; thin programmatic SEO lowest), the owner agreed to move two items from "later" to **next**, alongside Phase 1 of `docs/seo/FREE-TOOLS-HANDOFF.md`:

### P-1. Comparison pages (this week: fact-check; next: publish)

The structure, rules and table already exist in `docs/seo/drafts/compare-pages.md` (Kommo, Spur, Wati). Update it for the global market:

1. **Competitor set by market.** Keep **Kommo** (global: US, LatAm, UAE) and **Wati** (India, UAE, SEA) as the first two pages. Add one US-first competitor as the third: **Tidio** (website chat + AI, US/EU SMBs). Spur stays as the India-specific fourth. Don't add more until these ship.
2. **Table rows.** Replace "Pay in INR by UPI" with "Billing currencies and payment methods". Add "Markets and languages supported" and "Phone (telephony) voice agent". Vyostra's honest answer to the last row is "No (on-page voice only)". **Update the Vyostra column**: the WhatsApp row currently says "via Gupshup"; confirm current wording with the owner (see the earlier Gupshup vs Meta question). Zoho sync is India data centre only (global handoff A4).
3. **Fact-check (Cowork / owner, this week).** For each competitor, fill every `TODO: verify` from the competitor's own pricing and docs pages, with the URL and date read. No review-site summaries. Cut any row that can't be sourced. Write "When is <competitor> the better choice?" first and honestly.
4. **Build (Claude Code, after the table is complete).** Follow the "Before publishing a page" steps in the drafts file. Add `market` context in the opening answer only where the competitor is market-specific (Spur → India). Keep the existing rule: no page ships with a `TODO`.
5. **Refresh.** Comparison pages go stale fastest. Re-verify every competitor cell every 60 days and update `dateModified`.

### P-2. Original research (start now, publish within 6 weeks)

One small, honest data report from Vyostra's own platform data. It earns press links and AI citations because nobody else has the numbers.

- **Working title:** "When do leads enquire? Enquiries by hour, day and channel" (global, with a per-market split only where the sample is large enough).
- **Data (backend, anonymised, aggregate only):** lead creation timestamps in the lead's local timezone (or the account's), channel (website chat, voice, WhatsApp, form, Meta lead ad), and time to first reply. **No PII, no customer names, no per-account figures.** Get every client's consent if the terms don't already cover aggregate statistics; check with the owner.
- **Minimum sample:** publish only if there are enough leads for the split to mean something (set a floor, e.g. 1,000 leads overall and 200 per market shown). Otherwise publish overall numbers only, or wait.
- **Methodology section:** date range, number of accounts and leads, how timezones were handled, what was excluded. State the limits plainly (e.g. "mostly real estate accounts").
- **Format:** a blog post at `/blog/<slug>/` with charts (accessible, with data tables), a downloadable CSV of the aggregates, `Dataset` schema, and an embeddable chart with a credit link.
- **Distribution (Cowork):** pitch it to the market press lists in `claude/backlink-plan.md` section 2a, plus journalist requests on Qwoted / Featured.
- **Claude Code task:** write the aggregation query/script in `backend/scripts/research/` that outputs only aggregates. Review it with the owner before running it on production data.

### Unchanged

Schema is already live (no more investment needed). Raw AI-generated content is still banned: every post needs real sources or real data. Programmatic SEO stays limited to genuinely useful pages (tools, verified comparison pages), never city-name-swapped templates.

---

## Part A: platform changes (code)

Rules from CLAUDE.md still apply: work on a branch (e.g. `feat/global-market`), TypeScript strict, no `any`, functions under 40 lines, `npm run build && npm test` before each commit, stage files by name, **never push to main**. One logical change per commit, with its test.

The line numbers below are from `main` at `acfd784` and may drift.

### A1. Global default copy (P0)

| File | Now | Change to |
|---|---|---|
| `components/landing/Footer.tsx:83` | "Conversational AI agents with native CRM for Indian businesses." | "AI chat, voice and WhatsApp agents with a built-in lead CRM." |
| `components/landing/WhatIsVyostra.tsx:21` | "…built in Bangalore, India." | "…built by a team in Bangalore, India, for businesses worldwide." |
| `pages/About.tsx:283-284` | Title/description "Built in Bangalore" | Lead with what it does; keep Bangalore as the HQ fact, not the headline |
| `pages/About.tsx:91,183,186` | Bangalore-first framing | Keep the true HQ facts and add "serving customers worldwide". Keep the founders' bios truthful |
| `pages/About.tsx:45` | "₹10L+ a month in ad spend" | Ask the owner for the figure in USD (or keep INR with a USD equivalent). **Do not convert it yourself without confirmation** |
| `lib/crawl-files.ts:94,139` | llms.txt summaries mention INR / Bangalore | "billing in USD (INR available in India)"; About: "the founders and the company" |
| `lib/structured-data.ts` | Organization address Bangalore | Keep the address (it's true). Add `areaServed: "Worldwide"` (or a list of countries) to Organization |

Add a test that fails if any shared marketing page (home, pricing, features/*, footer, about) contains "Indian businesses" or "Indian SMB".

### A2. Pricing presentation (P0)

- USD is the default for every visitor. INR stays as an option for India (UPI, netbanking and RuPay are real reasons it exists).
- `pages/Pricing.tsx:29` prints "/month in India" under every tier for every visitor. Show it only when the India toggle is selected, or move it into one secondary line: "Paying from India? Prices in ₹ with UPI."
- `lib/pricing-copy.ts:37` FAQ "How much does an AI chatbot for a website cost in India?". Add a global first FAQ ("How much does Vyostra AI cost?" in USD) and keep the India one second.
- `PricingSection.tsx:47`: keep the 🇮🇳 India (₹) toggle, with USD selected by default.
- `pages/Terms.tsx:67` says "Prices in INR, inclusive of applicable taxes." **That is now wrong for USD customers.** Draft: "Prices are shown and charged in US dollars, or in Indian rupees for customers paying from India. Taxes are applied as required in your country." **Flag this for the owner and legal review before merging; don't ship legal text unreviewed.**
- Do not add AED/GBP/AUD price lists. Checkout is Razorpay with USD (international cards) and INR plans; new currencies need new plans. Show USD.

### A3. Demo and testimonial content (P1)

- `walkthrough/walkthrough-content.ts:54,60` uses "1.5 to 1.8 crore / ₹1.5–1.8 Cr". Make the walkthrough market-neutral: use USD (e.g. a "$450k to $500k" budget) **or** make the sample conversation data-driven with one variant per market. The simplest acceptable version is USD.
- `TestimonialsSection.tsx:11` "Real Estate Developer, Bengaluru". Leave it only if the testimonial is real and approved (this was flagged earlier as unverified). Do not invent testimonials from other countries.

### A4. Zoho CRM: multi data centre (P0 blocker for global Zoho claims)

`ZOHO_ACCOUNTS_URL = 'https://accounts.zoho.in'` hard-codes Zoho's **India** data centre. Customers in the US, EU, UK, Australia, UAE/Saudi Arabia, Canada and Japan sign in on other data centres (zoho.com, zoho.eu, zoho.com.au, zoho.sa, zohocloud.ca, zoho.jp). Zoho's OAuth flow returns the user's `accounts-server` and `api_domain`; store them per connection and use them for token refresh and API calls.

- Until this ships, `/features/zoho-crm` must keep saying India data centre only (it does, at line 44), and **no global content may promise Zoho sync**.
- Test: token refresh and lead push use the stored domain, not a constant.

### A5. WhatsApp link generator examples (P2)

`pages/tools/WhatsAppLinkGenerator.tsx:53` explains the format with an Indian number only. Give examples for the US/Canada (1), UK (44), Australia (61), UAE (971) and India (91), and keep the "no plus sign, no leading zero" rule.

### A6. Data residency (owner/legal, not code)

`Privacy.tsx:298` says data is in `ap-south-1 (Mumbai, India)`. That's fine to state, but EU/UK customers need a lawful transfer basis under GDPR/UK GDPR, and UAE customers fall under UAE data protection law. **Owner to-do:** get the privacy policy reviewed for international customers. Don't edit legal text without that review.

### A7. Language check (P1, before any Arabic content)

"arabic chatbot" has 2,400 monthly searches in the UAE at difficulty 0. Before writing for it, test whether the chat agent and the on-page voice agent answer correctly in Arabic (and right-to-left rendering in the widget). Record the result in `docs/seo/AEO-GEO-STATUS.md`. Only publish Arabic-capability claims that pass.

### A8. Phone voice agent = the biggest global gap (product decision)

"AI receptionist" gets 49,500 searches a month in the US (difficulty 25), 1,300 in the UK (13), 880 in Australia (23) plus "ai receptionist australia" at 390 (difficulty 0), and 1,000 in India. Those searchers want **phone answering**. Vyostra's live voice agent is **on-page web voice**, not telephony (see project doc `claude/voice-calling-cost-and-pricing-plan.md`).

- Content may compare the two honestly (task B3, post 1). It must not call Vyostra an AI receptionist or imply phone answering until telephony ships.
- Flag this to the owner as the highest-demand roadmap item.

### A9. Blog market tagging (P1)

- Add `market: 'global' | 'us' | 'uk' | 'ca' | 'au' | 'ae' | 'in'` to the blog `meta.ts` type. It is required, and the build fails if it's missing.
- Backfill: existing India-titled posts → `in`; `what-is-a-crm-chatbot` and `real-estate-chatbot-lead-qualification-questions` → `global` (check their copy for India-only assumptions first and generalise where needed); `branded-budget-residences-pilgrimage-towns` → `in`.
- Render a small market label on the post and allow filtering the blog index by market.
- Use `inLanguage: "en"` in BlogPosting schema. Where a post targets one country, add `spatialCoverage` / `about` with the Place. **No hreflang**: it's one English site, not localized copies.
- Every market post links to its global pillar, and each pillar links to its market posts.

### A10. Copy sweep (P1)

Run the grep below and fix every **shared** page hit. Leave market-tagged posts alone, and leave legal pages for the owner (A2/A6):

```
grep -rniE "india|indian|₹|INR|rupee|bangalore|bengaluru|RERA|lakh|crore|hinglish|smb" frontend/src --include=*.ts --include=*.tsx --include=*.mdx | grep -v test
```

Dashboard pages (`BotsPage`, `BillingPage`, `KnowledgeBasePage`, etc.) also had hits. Review them for user-facing India assumptions (phone formats, currency, examples) and generalise.

---

## Part B: content generation guide

### B1. Keyword data (OpenSEO / DataForSEO, pulled 2026-10-06)

Monthly volume · KD (difficulty 0–100). Re-pull before writing; these move.

| Keyword | US | UK | AU | UAE | IN |
|---|---|---|---|---|---|
| ai receptionist | 49,500 · 25 | 1,300 · 13 | 880 · 23 | 70 | 1,000 · 22 |
| ai voice agent | 22,200 · 38 | 390 · 32 | 210 · 28 | 70 | 2,900 · 48 |
| real estate crm | 4,400 · 36 | 170 · 26 | 390 · 20 | 260 · 28 | 2,400 · 27 |
| whatsapp business api | 2,900 · 66 | 1,000 · 63 | 390 · 63 | 720 · 50 | 18,100 · 68 |
| ai sales agent | 1,300 · 15 | 210 · 11 | 90 · 0 | — | — |
| speed to lead | 880 · 33 | 70 · 22 | 50 · 19 | — | — |
| ai chatbot for website | 880 · 55 | 170 · 54 | 90 · 0 | — | 590 · 59 |
| whatsapp chatbot | 720 · 40 | 320 · 29 | 70 · 27 | 210 · 21 | 4,400 · 34 |
| real estate chatbot | 590 · **7** | 50 · 0 | 30 · 2 | 20 | 480 · **9** |
| lead management software | 590 · 22 | 110 · 29 | 50 · 25 | 10 | 590 · 26 |
| whatsapp crm | 320 · **7** | 140 · **8** | 20 · 40 | 140 · 15 | 1,900 · 18 |
| whatsapp automation | 260 · 14 | — | — | 170 · 17 | 3,600 · **11** |
| ai assistant for real estate agents | 170 · 10 | — | — | — | — |
| click to whatsapp ads | 110 · 12 | — | — | — | 480 · **0** |
| crm chatbot | 110 · 28 | — | — | — | — |
| ai chatbot for small business | 90 · 11 | 10 | 10 | — | 30 |

Market-only terms:

- **UAE:** arabic chatbot 2,400 · 0 · trakheesi permit 390 · 8 · real estate crm dubai 140 · **4** · crm dubai 110 · 21 · whatsapp marketing dubai 50 · 20.
- **AU:** ai receptionist australia 390 · **0**.
- **UK:** ai receptionist uk 320 · 0 · estate agent crm 210 · 40.
- **IN:** crm for real estate india 170 · 48.

**What the data says:** the low-difficulty, on-product wins are **real estate chatbot** (US/IN), **WhatsApp CRM** (US/UK), **WhatsApp automation** (IN), **real estate CRM Dubai**, **Trakheesi permit** and **click to WhatsApp ads** (IN). The giants (AI receptionist, AI voice agent) need the phone product or an honest comparison angle.

### B2. Market facts for writers (verify each at writing time and cite the primary source with the date checked)

| Market | Lead channels | Property portals | Messaging / ads rules to respect | Words buyers use | Currency |
|---|---|---|---|---|---|
| US | Web forms, SMS, phone, web chat; WhatsApp is secondary | Zillow, Realtor.com | TCPA: prior express written consent for automated marketing texts/calls; check current FCC rules | real estate agent, realtor, brokerage, listing | USD |
| UK | WhatsApp widely used, phone, email | Rightmove, Zoopla, OnTheMarket | UK GDPR + PECR for electronic marketing | estate agent, lettings, viewing | GBP |
| Canada | Like the US | realtor.ca | CASL consent for commercial electronic messages | realtor, brokerage | CAD |
| Australia | Phone, SMS, email; WhatsApp growing | realestate.com.au, Domain | Spam Act 2003: consent, sender identification, working unsubscribe | real estate agent, agency, inspection | AUD |
| UAE | **WhatsApp dominant**, phone | Property Finder, Bayut, Dubizzle | Dubai property ads need a Trakheesi permit (Dubai Land Department / RERA Dubai); UAE data protection law | broker, agency, off-plan, viewing | AED |
| India | **WhatsApp dominant**, phone | 99acres, MagicBricks, Housing.com | RERA registration on project ads; DPDP Act 2023 | builder, developer, channel partner, site visit | INR |

WhatsApp rules (24-hour customer service window, approved templates outside it, opt-in, click-to-WhatsApp entry window) are **global Meta rules**. Write them once in a global pillar and link to it from market posts.

### B3. First 12 posts, in order

| # | Market | Working title (seoTitle ≤ 46 chars) | Primary keyword | Notes |
|---|---|---|---|---|
| 1 | Global | AI Receptionist vs Website Voice Agent | ai receptionist / ai voice agent | Honest comparison: phone answering vs on-page voice. State plainly that Vyostra's voice agent is on-page. Captures the giant query without overclaiming |
| 2 | Global | What Is a WhatsApp CRM? | whatsapp crm | US KD 7, UK KD 8, IN 1,900. Global pillar; links to market posts |
| 3 | Global | Real Estate Chatbot: A Practical Guide | real estate chatbot | US KD 7, IN KD 9. Global pillar; the existing qualification-questions post becomes its child |
| 4 | Global | Speed to Lead: Why the First Reply Wins | speed to lead | Cite the primary research on response time; no invented stats |
| 5 | UAE | Real Estate CRM for Dubai Brokers | real estate crm dubai | KD 4. Property Finder/Bayut lead flow into a CRM, WhatsApp-first |
| 6 | UAE | Trakheesi Permit for Property Ads in Dubai | trakheesi permit | KD 8, link-earning. Accuracy is critical: cite DLD. Practical, not legal advice |
| 7 | US | AI Assistant for Real Estate Agents | ai assistant for real estate agents | KD 10. Zillow/Realtor.com lead follow-up, TCPA consent note |
| 8 | UK | WhatsApp CRM for UK Estate Agents | whatsapp crm (UK) | KD 8. Rightmove/Zoopla enquiries to WhatsApp, PECR note |
| 9 | India | WhatsApp Automation for Small Business | whatsapp automation | IN 3,600, KD 11 |
| 10 | Australia | Real Estate CRM for Australian Agencies | real estate crm (AU) | KD 20. REA/Domain enquiries, Spam Act note |
| 11 | Global | AI Sales Agent: What It Can and Can't Do | ai sales agent | US 1,300, KD 15 |
| 12 | UAE | Arabic Chatbot for Business | arabic chatbot | **Only if A7 passes.** 2,400 · KD 0 |

Already written, on branch `content/whatsapp-lead-ads-posts` (unmerged): `facebook-lead-ads-whatsapp-auto-reply` (title says "in India"). Before merging, **make it global** (Meta rules are global; drop "in India" from the title, tag it `global`). Also on that branch: `click-to-whatsapp-ads-vs-lead-forms-real-estate-india` (tag `in`; "click to whatsapp ads" IN 480, KD 0).

### B4. Writing rules (every post)

- **Answer first:** a 40–70-word opening that answers the title's question.
- Question-style H2s, an FAQ block (visible and in FAQPage schema from the same array), and an author byline.
- **Market posts:** name the market in the title and first paragraph; use that market's currency, portals and buyer vocabulary (B2); cite local rules with a primary source and the date checked; link to the global pillar.
- **Global posts:** no country-specific assumptions. When an example needs a currency, use USD. Show 2–3 markets side by side when rules differ.
- **No invented numbers, customers, testimonials or rankings.** Product claims must match the live site. Zoho sync is not claimed outside India until A4 ships; phone answering is not claimed until telephony ships; Arabic is not claimed until A7 passes.
- US spelling on global pages. Market posts may use local terms (estate agent, lettings) but keep US spelling unless the owner decides otherwise.
- Existing test limits: document title (seoTitle + " — Vyostra AI") ≤ 60 chars, so seoTitle ≤ 46; description ≤ 160.
- Before writing, check autocomplete and People Also Ask **for the target country** (use the country's Google, or set location in the SEO tool).

### B5. Pages beyond the blog (P2, after posts 1–6)

- `/industries/real-estate/`: make it global, with market sections (US, UK, UAE, Australia, India) linking to the market posts. Its RERA line (`content/industries/real-estate.ts:54`) becomes "local advertising rules (for example RERA registration in India, Trakheesi permits in Dubai)".
- **No thin city or country landing pages.** A market page only exists once it has 3+ genuine market posts behind it.
- `/compare/*` pages: competitors differ by market (US: Podium, Drift, Intercom, Tidio; UAE/IN: Wati, Interakt, AiSensy, Gallabox; UK/AU: respond.io, Trengo). Same rule as before: cited, dated, hidden until verified.

---

## Part C: verify

```
grep -rniE "indian businesses|indian smb" frontend/src --include=*.tsx --include=*.ts   # expect no shared-page hits
npm run build && npm test
```

After deploy, check that the homepage, /pricing/, /about-us/ and /llms.txt read as global, with USD first. In Google Search Console, watch **Performance → Countries** monthly for US/UK/AE/AU/IN impressions.

## Owner decisions needed

0. **This week:** fact-check the comparison tables (P-1) and confirm client consent and terms for aggregate research data (P-2).

1. Terms and Privacy wording for international customers (A2, A6): legal review.
2. "₹10L+ ad spend" on the About page: give a USD figure or keep INR (A3).
3. Testimonial: is it real and approved? (A3)
4. Zoho multi-data-centre: build now or later? (A4) It blocks Zoho claims in all non-India content.
5. Telephony priority, given "AI receptionist" demand (A8).
6. Arabic support test (A7).
