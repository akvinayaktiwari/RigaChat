# Free tools: handoff for Claude Code (v2, low-competition only)

Written 2026-10-06; v2 the same day. Read `docs/seo/GLOBAL-MARKET-HANDOFF.md` first: the site is global (US, UK, Canada, Australia, UAE, India).

## The rule for v2: only very low-competition keywords

The owner's instruction: **target only keywords we can realistically win.** Every tool below targets a primary keyword with **keyword difficulty (KD) 0–10** (OpenSEO / DataForSEO, pulled 2026-10-06; KD runs 0–100). v1 ideas with KD above 10 were dropped or demoted to secondary keywords: WhatsApp button generator (KD 21–50), template builder as a main target (KD 11–17), FAQ generator, UTM builder (KD 64).

Before building each tool, re-check its keyword in the target country and confirm KD is still 10 or lower. If it has risen, move the tool down the list.

**Never build "fake chat / fake message / fake screenshot" generators**, even though many show KD 0. They're used for scams and fake testimonials, and they'd attach the brand to that.

## Shortlist (primary keyword KD ≤ 10)

Monthly volume · KD. Market codes: US, IN = India, AE = UAE.

| Order | Tool | Route | Primary keyword(s) | Secondary keywords |
|---|---|---|---|---|
| 0 | `/tools/` hub | `/tools/` | — | "free whatsapp tools", "free real estate agent tools" (verify) |
| 1 | WhatsApp QR code generator | `/tools/whatsapp-qr-code-generator/` | whatsapp qr code generator: IN **1,300 · 1**, US 260 · 1, AE 110 · 4 | …free: US 30 · 0; whatsapp web qr code generator 10 · 4 |
| 2 | WhatsApp text formatter | `/tools/whatsapp-text-formatter/` | whatsapp text formatter: IN **880 · 0**, US **720 · 0** | whatsapp bold text: IN 1,300 · 4; whatsapp text generator 40 · 0 |
| 3 | WhatsApp fonts | `/tools/whatsapp-fonts/` | whatsapp fonts: IN **5,400 · 5** | whatsapp font generator 40 · 0 |
| 4 | Real estate commission calculator | `/tools/real-estate-commission-calculator/` | US **6,600 · 0** | — |
| 5 | Open house sign-in sheet | `/tools/open-house-sign-in-sheet/` | US **4,400 · 0** | — |
| 6 | UAE mortgage calculator | `/tools/uae-mortgage-calculator/` | mortgage calculator uae: AE **3,600 · 3** | — |
| 7 | WhatsApp message generator (in-browser AI) | `/tools/whatsapp-message-generator/` | whatsapp message generator: US 50 · 3 | whatsapp business message templates: IN 1,300 · 11 (secondary only) |
| 8 | Real estate script and text generator (in-browser AI) | `/tools/real-estate-scripts/` | real estate scripts: US 170 · **0** | real estate text message templates 40 · 0 |
| 9 | Voicemail greeting generator (in-browser AI) | `/tools/voicemail-greeting-generator/` | free voicemail greeting generator: US 140 · 4 | — |
| 10 | Cost per lead calculator | `/tools/cost-per-lead-calculator/` | US 140 · 8 | lead conversion rate calculator 40 · 0 |
| 11 | Rental yield calculator | `/tools/rental-yield-calculator/` | rental yield calculator: AE 90 · 10 | — |
| 12–15 | Jev-powered checkers (lead quality, template category, spam risk, enquiry router) | `/tools/<slug>/` | **KD not yet verified** (credits ran out) | see notes |

Tools 1–6 carry most of the volume (about 23,000 searches a month combined across their primary keywords), all at KD 5 or below.

Two notes on the data:

- Before writing each tool's title, check the exact country-level wording in Google autocomplete for the target market.
- Fresh pulls for UK/AU/CA real estate tool ideas weren't possible (OpenSEO credits ran out on 2026-10-06). When credits are topped up, pull "property commission calculator uk", "stamp duty calculator" (likely too competitive), "auction bidding calculator au" and similar, and add any with KD ≤ 10.

## Build rules (every tool)

- Copy the pattern of `pages/tools/WhatsAppLinkGenerator.tsx` + `lib/whatsapp-link.ts`: logic in a pure, tested `lib/` module; the page uses `MarketingPageShell`, `PageMeta`, `StructuredData` and `FaqList`.
- **Runs in the browser only** (except tools 12–15; see their rules). Nothing the visitor types goes to a server. No analytics event carries user input; track only `tool_used` (tool name) and `tool_cta_click`.
- Page: H1 = primary keyword; a 40–70-word answer-first intro ("Vyostra AI's free …"); the tool above the fold; question H2s; 5+ FAQs (visible and in FAQPage schema from one array); one honest CTA to the matching feature page.
- Schema: `WebApplication` (`applicationCategory: BusinessApplication`, free offer, `isAccessibleForFree`), `BreadcrumbList`, `FAQPage`. The hub uses `CollectionPage` + `ItemList`.
- Register each route in prerender, `PRERENDERED_PREFIXES` (`deploy/cloudfront/viewer-request.js`), `crawl-files.ts` (sitemap + llms.txt), the footer Tools column and the hub.
- Global: phone examples for +1, +44, +61, +971, +91; a currency selector wherever money appears (USD default; AED, GBP, AUD, CAD, INR).
- No invented numbers. Every rule, rate or limit cites a primary source with the date checked, and lives in one constants file with a test.
- Small dependencies only; note the gzipped size in the PR; lazy-load per route.
- One branch per tool (`tools/<slug>`), `npm run build && npm test` before each commit, never push to `main`.

## Tool notes

**1. WhatsApp QR code generator.** Reuse `buildWhatsAppLink` from `lib/whatsapp-link.ts`. Number + message → QR preview → download PNG and SVG; options for size, colour, error correction and margin; a "scan it before you print" tip. **Fix the existing link generator:** `WhatsAppLinkGenerator.tsx:71` tells people to "Paste the link into any QR code generator", which sends them away. Replace it with a "Get QR code" button that opens tool 1 prefilled via query params (read client-side, never logged).

**2. Text formatter.** Buttons for WhatsApp's native formatting (bold, italic, strikethrough, monospace, inline code, lists, quotes), a live preview styled like a chat bubble, and a copy button. Verify the syntax against WhatsApp's Help Center "How to format your messages" and link to it.

**3. WhatsApp fonts.** A separate page from the formatter, because the search intent differs. Converts text to Unicode styles (bold serif, script, double-struck…) with copy buttons, and states plainly that screen readers read these badly and some phones show boxes. Cross-link with tool 2.

**4. Commission calculator.** Sale price, commission % or flat fee, listing/buyer-side split, brokerage/agent split, optional referral fee, and tax on commission as a user-entered %. Show an itemised table and a copy-summary button. **Show no "standard" rates**: rates are negotiable and vary by market and law. Worked examples use round, clearly hypothetical numbers.

**5. Open house sign-in sheet.** Agent name, brokerage, address, date, optional logo (stays in the browser), and a choice of fields. Prints via print CSS (`window.print()`, no PDF library), with a QR code from tool 1's module that opens the agent's WhatsApp. Neutral consent text plus "check your local rules" (TCPA in the US, Spam Act in Australia, PECR in the UK). CTA: digital sign-ins that land in a CRM → `/features/crm/`.

**6. UAE mortgage calculator (accuracy-critical).** Standard amortisation, plus an LTV check against the UAE Central Bank's mortgage caps, cited with the date checked. Upfront costs (DLD transfer fee, registration, broker fee) are user-editable inputs with cited defaults. Disclaimer: an estimate, not financial advice. If the caps can't be verified from primary sources, ship a generic mortgage calculator instead, without UAE-specific rules.

**7–9. In-browser AI tools (no server, no API cost).**

- **Engine:** Chrome's built-in AI (Gemini Nano on the device, via the Prompt API and the Writer/Rewriter APIs), with **feature detection**. Where it's unavailable (other browsers, phones, low-spec machines), the tool falls back to a **template engine** (fill-in-the-blank templates the visitor customises). So every visitor gets a working tool and nobody sees an error.
- Check the current Chrome documentation for which of these APIs are stable vs origin-trial in October 2026, and note it in the PR. If an origin-trial token is needed, add it only for the `/tools/*` routes.
- The model downloads once and is cached by Chrome. Show a clear "preparing on-device AI" state and never block the template fallback while it downloads.
- Nothing typed leaves the device. Say so on the page; this is a selling point.
- **7. WhatsApp message generator:** pick a purpose (lead follow-up, appointment reminder, price-list reply, re-engagement after 24 hours, review request) and a tone, then get 3 variants plus formatting from tool 2. Explain when a message must be an approved template (outside the 24-hour window); cite Meta's docs. CTA: Vyostra sends these automatically. Only claim this after checking `journey-plan.ts` and the backend.
- **8. Real estate scripts and texts:** situation (new portal lead, open-house follow-up, expired listing, price reduction, no-show) plus market (US/UK/AU/UAE/India, adjusting vocabulary only) gives a call script and a text version. The fallback is a curated library of 20+ scripts. No legal or compliance claims.
- **9. Voicemail greeting generator:** business type, name, hours and a callback promise give 3 greeting scripts, plus a **preview read aloud** with the browser's speech synthesis (`speechSynthesis`; preview only, no audio download). CTA: "Want calls answered instead of sent to voicemail?" Only link the voice agent with accurate wording: the voice agent is on-page, not phone answering. Don't imply phone answering until telephony ships.

**10. Cost per lead calculator.** Ad spend, leads, leads contacted within 5 minutes / 1 hour / later, and closed deals, all entered by the visitor. Outputs cost per lead, cost per contacted lead and cost per deal. No made-up conversion multipliers; cite primary research if quoted.

**11. Rental yield calculator.** Gross and net yield from price, rent, service charges, maintenance, vacancy and fees the visitor enters, with the currency selector. A short UAE note links to the DLD service charge index (cited), with no hard-coded values.

**12–15. Jev-powered checker tools (classification, server-side).**

[Jev](https://en.wikipedia.org/wiki/Jev_(AI_model)) (TypeSafe, released 2026-09-15) is a **non-generative classifier**: you give it text plus a fixed answer schema, and it returns a typed choice, a score or a yes/no with a probability. It can't write text. Access is via API (Vercel AI Gateway; reported price $42 per billion input tokens, output free). Verify current access, pricing and SDK in TypeSafe's/Vercel's docs before building. Because a few hundred tokens per check costs almost nothing, these tools are cheap to give away.

| # | Tool | What it classifies | Answer schema | Why it fits |
|---|---|---|---|---|
| 12 | **Lead quality checker** | A pasted enquiry (form, WhatsApp, email) | Intent: buy / rent / sell / invest / just browsing; Urgency: now / 3 months / later / unclear; Has budget: yes/no; Score: hot / warm / cold | The exact job Vyostra's agent does. Best demo-to-signup bridge |
| 13 | **WhatsApp template category checker** | A pasted template body | Marketing / Utility / Authentication, with confidence | Meta prices categories differently and can re-categorise templates. Label it clearly as a **prediction**: Meta decides. Cite Meta's category definitions |
| 14 | **Message spam-risk checker** | A WhatsApp/SMS message before sending | Promotional pressure, missing opt-out, misleading urgency: each yes/no, plus an overall low/medium/high | Helps people avoid blocks and reports. Pairs with tools 2 and 7 |
| 15 | **Real estate enquiry router** | A batch of up to 20 pasted enquiries | Buyer / seller / tenant / landlord / investor / spam | Shows teams how routing would work; CTA to the CRM |

Rules for these four:

- **Server-side by necessity**, unlike tools 1–11, so the "nothing leaves your browser" promise doesn't apply. Say plainly on the page: "Your text is sent to our server and an AI classifier to check it. We don't store it." Then actually don't: no logging of request bodies and no analytics on content.
- Add a backend endpoint (e.g. `POST /api/tools/classify`) that holds the API key in env, accepts only the 4 fixed schemas (never a schema from the client), caps input length (e.g. 2,000 chars; 20 items for tool 15), and is rate-limited per IP (e.g. 20/hour) behind a bot check (Cloudflare Turnstile or equivalent). Set a hard monthly spend cap with the provider and an alert.
- Show the probability with every answer, and explain that results are estimates.
- **Keywords: verify before building.** OpenSEO credits ran out before these could be checked. Candidates: "lead quality checker", "lead scoring tool free", "whatsapp template category", "whatsapp message spam checker", "sms spam checker". Build only those with KD ≤ 10 in at least one target market. Tool 12 is worth building even at low volume, as a product demo linked from the homepage and the CRM page.
- **Product note for the owner:** the same classifier could score and route leads inside Vyostra (hot/warm/cold, intent, urgency) at very low cost. Consider it for the CRM roadmap, separately from these tools.

## Dropped from v1 (KD too high for now)

- WhatsApp button for website: KD 21–27 (IN 590), "whatsapp button generator" KD 50.
- Template builder as a standalone primary: KD 11–17. It's folded into tool 7 as a secondary keyword.
- FAQ generator (owner's call) and UTM builder (KD 64).
- Fake chat/message generators: never (see above).

## After each tool ships

Add it to the hub, footer, `crawl-files.ts` and `AEO-GEO-STATUS.md`; link it from 2–3 related posts and its feature page; request indexing in Search Console. Then Cowork submits it to tool directories and "free WhatsApp tools" / "free real estate agent tools" roundups (tracked in `claude/backlink-execution-kit.md`).

## Engines, decided

- **Tools 1–6, 10, 11:** plain browser code, no AI.
- **Tools 7–9 (writing):** Chrome's built-in on-device model, with a template fallback. Jev can't write text, so it isn't used here.
- **Tools 12–15 (checking):** Jev via a rate-limited backend endpoint.
