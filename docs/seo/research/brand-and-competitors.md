# Vyostra AI: brand presence and competitor citation research

Date: 2026-09-15. Method: WebSearch tool (a US web index, NOT Google, so "ranks" below means "appeared in this tool's top results", not a Google position), WebFetch, and curl for status codes and raw HTML. No Google AI Overview, ChatGPT or Perplexity answer was directly observed; every citation claim below is inferred from organic appearance, listicle inclusion, or page structure, and is labelled as such.

---

## Part A: Vyostra brand/entity presence

### A1. Search results for the brand

| Query | Result |
|---|---|
| `"Vyostra AI"` | No match. Engine returned Vyra AI, Vyro AI, VYRA, Vynta instead. |
| `"VyostraAI"` | One real hit: the public GitHub repo https://github.com/akvinayaktiwari/RigaChat (engine summary quoted its description and named "solo founder Vinayak Tiwari"). Nothing from vyostra.com itself. |
| `vyostra.com` | No vyostra.com result. Engine summary wrongly described a "Vyostra Technologies" drone company; the links were actually for **Vyomastra** Technologies (Mysore). This is a live entity-confusion risk: the search layer is already conflating the two names. |
| `site:vyostra.com` | Zero vyostra.com pages returned (returned vystra.com and unrelated Wikipedia pages). |
| `Vyostra` | No match; Vystra (Instagram coach), Vystra Mobile (alarm app), VyStar CU. |
| `Vyostra chatbot CRM WhatsApp Bangalore` | No Vyostra result; WACTO, Botsense, WhatsCRM, YCloud listicle. |
| `"vyostra" reddit OR youtube OR twitter` | No mentions. |

### A2. Is vyostra.com indexable? (observed directly, curl, 2026-09-15)

- `https://vyostra.com/` returns 200, 1600 bytes, a bare SPA shell: `<title>VyostraAI — AI Chatbot with Native CRM</title>`, **no meta description, no canonical, no OG tags, empty `<div id="root"></div>`**. Same 1600-byte shell for /pricing, /features, /about, /contact, /privacy, /terms, /login, /signup (all 200, identical title). A non-JS crawler and most AI crawlers (GPTBot, ClaudeBot, PerplexityBot do not execute JS) see no product content at all.
- `/robots.txt` -> 404. `/sitemap.xml` -> 404. `/llms.txt` -> 404. (All three 404s are served as text/html.)
- `/blog` -> 302 to `/blog/`. `/blog/` IS prerendered (title "Blog — VyostraAI", meta description, OG, canonical `https://vyostra.com/blog`). Canonical points at the redirecting URL (minor mismatch). One post linked: `/blog/branded-budget-residences-pilgrimage-towns`.
- Repo confirms why: `frontend/scripts/prerender.mjs` prerenders blog routes only; the landing page and product pages are client-rendered.
- Hosting: S3 + CloudFront; an unknown path returns 200 with the shell (soft-404 risk) for SPA routes.

Conclusion: vyostra.com appears effectively unindexed in this engine, and the homepage gives crawlers nothing to index.

### A3. Platform presence

| Platform | Status | Evidence |
|---|---|---|
| G2 | Not found (could not verify directly) | g2.com returns 403 to fetches; site-scoped search for Vyostra returned no G2 product. |
| Capterra | Not found (could not verify directly) | 403 on search page; no search result. |
| Product Hunt | Not found | /products/vyostra and /products/vyostraai return 404; search page is client-rendered (no result list visible). |
| LinkedIn company page | **Found** | https://www.linkedin.com/company/vyostra-ai (title "Vyostra AI \| LinkedIn"; description "AI agents + native CRM for Indian SMBs — one platform, no Zapier glue..."; links to vyostra.com). Follower count not visible logged-out. Not surfaced by `site:linkedin.com Vyostra` search, so weakly indexed. /company/vyostra and /company/vyostraai are 404. |
| Crunchbase | Not found (could not verify directly) | 403; search shows only Vyomastra, Vyosa, Vyopta. |
| GetApp | Could not verify | 403. No search result. |
| SaaSworthy | Could not verify | 403. No search result. |
| Techjockey | Not found (low confidence) | Search page 200, zero "vyostra" strings, but results may be client-rendered. |
| Wikidata | Not found | wbsearchentities API for "vyostra" returned an empty list. |
| YouTube | Not found | @vyostra and @vyostraai return 404; no search result. |
| X/Twitter | Not found | x.com/vyostra and x.com/vyostraai return 404 (X can 404 logged-out; moderate confidence). |
| Reddit | Not found (could not verify API) | reddit search API 403; no web-search mentions. |
| GitHub | Found (unintended) | https://github.com/akvinayaktiwari/RigaChat is **public** (`visibility: public` via GitHub API). It is currently the only indexed page tying "VyostraAI" to the product. Flag for the owner: this exposes the full source and internal docs; decide deliberately whether that is intended. |
| Site footer social links | None | Homepage JS bundle contains only a generic `https://www.facebook.com` string; no LinkedIn/X/YouTube links, so no `sameAs` signal. |

### A4. Name collisions

- **Vyomastra Technologies** (Mysore, drone/anti-drone, Crunchbase + LinkedIn + Inc42 profiles, vyomastra.in). Closest collision; search engine already merged it with "vyostra.com" in a summary. Same state (Karnataka), which worsens the confusion.
- **Vystra**: vystra.com; Vystra Mobile (Google Play, alarm-centre app); Vystra Capital (Indian MSME buyout, LinkedIn); @varhoonvystra Instagram coach.
- **Vystara** (India/US GTM and finance services, LinkedIn).
- **VyStar Credit Union** (US; dominant for "vy-st" queries).
- **Vyra AI / Vyro AI / VYRA / Vynta** (AI products the engine offers as "did you mean" for "Vyostra AI"). Vynta is also a lead-qualification AI, i.e. same category.
- Internal: the brand is written both "Vyostra AI" (LinkedIn) and "VyostraAI" (site title). Pick one for entity consistency.

---

## Part B: Competitor visibility (Chatbase, Wonderchat, Tidio, CustomGPT)

### B1. What the target queries returned (this engine, top ~8-10)

| Query | Did any of the 4 own a result? | Notes |
|---|---|---|
| best AI chatbot for website | No first-party page. Chatbase named in results summary; Tidio is #4 on wpbeginner list. | Results: knock-ai, wpbeginner, vendasta, dapta, zapier, chatimize, igmguru, techradar. Zapier's list names none of the four. |
| AI chatbot for website India | **None of the four.** | cyfuture, haptik (lists its own enterprise case studies, none of the four), botsify India page, aichatbotindia.com, acemindtech. Weak, locally-fragmented SERP. |
| Chatbase alternatives | None of the four first-party in top 10 (Wonderchat's /chatbase-alternative did not appear). | wotnot, chatnode, bolddesk, eesel, chatimize, helply, lindy, irisagent, alternativeto. Tidio and Chatbase named inside these. |
| AI chatbot with built-in CRM / lead capture | **Wonderchat #1** (blog/ai-chatbot-tools-lead-capture), **Chatbase #3** (blog/crm-chatbot) | Others: chatling use-case page, bitcot, nutshell, noupe. |
| WhatsApp chatbot for real estate (India) | None of the four. | verloop, telecrm.in, brainguru, leasable360, chatbotbuilder.in, wacto.in, G2 opZynic discussion. |
| lead capture chatbot for small business | Wonderchat (#4, same listicle). Tidio named repeatedly in summaries. | jotform, lindy, kommunicate, vellum, eesel, nextiva, featurebase, knobot. |
| how to train a chatbot on my website | Not in plain query. With brand terms: wonderchat.io/blog/how-to-train-chatgpt-on-your-own-data, chatbase.co/blog/how-to-train-chatgpt-with-your-data, wonderchat.io/uses/train-custom-gpt, chatbase.co/blog/how-to-add-custom-gpts-to-your-website | Plain query: chatbot.com help doc, socialintents, spurnow, yourgpt, tidereply, oscarchat, easy-peasy. |
| AI chatbot for real estate website lead capture | Tidio named (free tier for agents) in summary. | fastbots, elfsight, chatbot.com, crescendo, spurnow, emitrr. |

Inference (not observed): the India and WhatsApp-real-estate SERPs are the least contested by these four global players and are held by small Indian vendors with thin pages. That is where Vyostra can realistically win citations first.

### B2. Chatbase (chatbase.co)

Sitemap: 861 URLs (438 docs, 299 blog, 96 changelog). llms.txt present (5,534 bytes). Also `/llm-info` page (an AI-crawler-facing fact page).
- Alternatives pages (competitor-name pages, ~15 seen): /blog/tidio-alternatives, /blog/intercom-alternative, /blog/zendesk-alternatives, /blog/fin-ai-alternatives, /blog/botpress-alternatives, /blog/botsonic-alternatives, /blog/drift-alternatives, /blog/livechat-alternatives, /blog/gorgias-alternatives, /blog/ada-alternatives, /blog/decagon-alternatives, /blog/sierra-ai-alternatives, /blog/front-alternatives. Surfaced by site: search.
- Compare: /compare/decagon, /agents-vs-chatbots, /blog/chatbase-vs-custom-chatbot, /blog/ai-chatbot-vs-ai-agent.
- "Best X" listicles: /blog/best-chatbot-for-website, /blog/best-ai-chatbots, /blog/best-ai-chatbot-for-business, /blog/best-ai-agents-for-small-business, /blog/the-5-best-chatbots-for-lead-generation, /blog/best-sales-chatbot, /blog/best-white-label-ai-chatbots, /blog/best-ai-chatbots-for-wix-websites.
- Topic pages matching Vyostra's pitch: /blog/crm-chatbot (ranked #3 for CRM query), /blog/whatsapp-chatbot, /blog/whatsapp-chatbots, /blog/ai-lead-generation, /blog/ai-chatbots-lead-generation, /blog/faq-chatbot, /blog/ai-tools-commercial-real-estate, /blog/how-to-train-chatgpt-with-your-data.
- Pricing: /pricing. Docs: /docs (438 pages, separate sitemap). Industry: /industry/retail, /travel, /tech, /financial-services. Experts marketplace: /experts.
- No India page, no glossary, no free tools found in sitemap.
- Third-party: Trustpilot https://www.trustpilot.com/review/chatbase.co displays TrustScore 3.9, 63 reviews (fetched). G2 (https://www.g2.com/products/chatbase/reviews) blocked; a search summary claimed 4.8/5 on 29 reviews, UNVERIFIED. Product Hunt /products/chatbase/reviews displayed 0 reviews, 18 followers (possibly a stub listing; low confidence). Named in: Wonderchat's lead-capture listicle (#7), sitegpt.ai/blog/chatbase-review, chatbotscape.com review, myaskai guide, max-productive.ai chatbase-vs-tidio, chitika, checkthat.ai, G2 compare pages (botpress-vs-chatbase, chatbase-vs-tidio, chatbase-vs-fin).

### B3. Wonderchat (wonderchat.io)

Sitemap: 729 URLs (485 blog, 67 feature, 35 uses, 17 chatbot, 14 industry, 8 glossary, 3 tools). llms.txt present (14,448 bytes, the largest of the four).
- Alternatives/landing: /chatbase-alternative, /botsonic-alternative, /chatsonic-alternative, /myaskai-alternative; blog: /blog/tidio-alternatives, /blog/top-7-best-tidio-alternatives-for-businesses, /blog/tidio-alternatives-transparent-pricing, /blog/top-10-chatbot-alternatives-to-customgpt-ai, /blog/best-chatbase-replacements-for-documentation, /blog/chatbase-wonderchat-features-analysis, /blog/compare-myaskai-chatbase-wonderchat, /blog/ai-customer-support-solutions ("10 Best Wonderchat Alternatives", i.e. owning its own alternatives SERP). 85 URLs match alternative/vs/compare.
- Competitor-pricing pages: /blog/tidio-pricing, /blog/intercom-fin-pricing (captures "X pricing" queries).
- Best-X listicles: /blog/ai-chatbot-tools-lead-capture (ranked #1 for CRM+lead-capture query; places Wonderchat #1; has comparison table, 6-item FAQ, named author, "Last update Aug 25, 2026"), /blog/best-ai-chatbots-knowledge-management, /blog/best-employee-knowledge-base-tools.
- Original data: /blog/b2b-website-conversion-report-2026 (benchmark report, a citation magnet).
- Vertical/use-case landings: /ai-agent-for-real-estate, /ai-agent-for-lead-generation, /ai-chatbot-for-whatsapp, /integrations/whatsapp, /blog/whatsapp-chatbot-templates, /chatbot/lead-qualification-workflow, /chatbot/sync-chatbot-leads-hubspot, /uses/train-custom-gpt, /uses/crawled-website-chatbot, /uses/ai-chatbot-for-clinic-intake-forms, /industry/ecommerce etc. (note: /industry/*/copy duplicates are live in its sitemap).
- Glossary: /glossary/api, /domain, /hosting, /keyword, etc. (8, generic web terms). Free tools: /tools/sitemap-exporter, /tools/ai-model-picker. Templates: /templates. Pricing: /pricing.
- Third-party: Product Hunt /products/wonderchat/reviews displayed 5.0, 2 reviews, 144 followers. Capterra listing exists (https://www.capterra.com/p/10021393/Wonderchat/alternatives/). G2: search sources (myaskai) say minimal reviews; not verified. Named in scribehow "7 Best Wonderchat Alternatives", coldiq, checkthat.ai, myaskai guide.

### B4. Tidio (tidio.com)

Sitemap: 1,167 URLs (545 blog, ~513 translated es/fr/it/pl/de/pt). llms.txt present (13,124 bytes). Oldest and strongest third-party footprint of the four.
- /vs/ pages: /vs/intercom, /vs/zendesk, /vs/gorgias, /vs/live-chat; hub /resources/comparisons/.
- Blog alternatives/vs (98 URLs match): /blog/intercom-alternatives, /blog/livechat-alternatives, /blog/freshdesk-alternatives, /blog/gorgias-alternatives, /blog/best-tawk-to-alternatives, /blog/hubspot-alternatives, /blog/tidio-alternatives (owns its own), /blog/chatbot-alternatives, /blog/lyro-vs-ada, /blog/lyro-vs-zowie, /blog/zendesk-vs-intercom, plus Shopify-vs-X ecommerce pages.
- Best-X listicles: /blog/ai-chatbot/ ("15 Best AI Chatbots for 2026"), /blog/chatbot-software/, /blog/chatbot-builder/, /blog/best-chatbot-platforms/, /blog/chatbot-examples/, /blog/best-ai-agent-for-ecommerce/. Note: some titles render "[wcyear]" literally in the index (template bug on their side).
- Topic pages overlapping Vyostra: /blog/real-estate-chatbots/, /blog/whatsapp-chatbot/, /blog/whatsapp-automation/, /blog/ai-lead-generation/, /blog/live-chat-lead-generation/, /blog/free-crm-software/, /blog/crm-vs-ticketing-system/, /blog/chatbot-pricing/, /blog/faq-chatbot/, /blog/chatbot-template/, /blog/lyro-ai-training/.
- Resources: /resources/calculators/tidio-roi/ (calculator), /resources/ebooks/*, /resources/case-studies/, webinars, podcasts. Reviews hub: /reviews/. Industry: /industry/ecommerce/, /services/, /travel/.
- Third-party (quoted): G2 seller page title "Tidio Products | Read 1880 Reviews on G2" (https://www.g2.com/sellers/tidio, from search index title). Tidio's own https://www.tidio.com/reviews/ displays G2 4.6/5, Capterra 4.7/5, Shopify 4.7/5, WordPress 4.7/5, GetApp 4.7/5, "1,879+" reviews, "300,000+ businesses". Gartner Peer Insights listing exists. Listicles: wpbeginner "14 Best AI Chatbot Software" ranks Tidio #4; Wonderchat lead-capture list #5; chatimize review; named in kommunicate/jotform small-business lists and real-estate chatbot results. Product Hunt /products/tidio/reviews showed 1 review, 1 follower (clearly not their main PH presence; low confidence).

### B5. CustomGPT (customgpt.ai)

Sitemap: 1,317 URLs, mostly flat root-level posts. llms.txt present (4,252 bytes).
- Vs pages: /customgpt-vs-chatbase/, /customgpt-vs-wonderchat/, /customgpt-vs-pinecone/, /customgpt-vs-algolia/, /customgpt-vs-ragie/, /customgpt-vs-ask-einstein/, /enterprise-ai-chatbot-platform-comparison/, /top-10-compared-custom-chatbot-builders/, /glean-alternatives/. 73 URLs match.
- Explainer "X vs Y" (AI-answer friendly): /rag-vs-fine-tuning-safety-enterprise-data/, /training-vs-grounding-ai-model-with-rag/, /ai-chatbot-vs-live-chat/, /chatbot-vs-ai-agent-vs-private-rag/, /ai-overviews-vs-seo/, /aeo-optimization-50-word-answer-faq-schema/ (they publish on AEO itself).
- Lead-capture cluster: /chatbot-lead-capture/, /lead-generation-with-ai-chatbot/, /best-way-capture-email-leads-ai-chat-conversation/, /website-not-generating-leads/, /use-case-lead-generation/, /introducing-customgpt-ai-lead-capture-agent/.
- Real estate: /make-a-real-estate-chatbot/, /real-estate-expert-ai-assistant/.
- Pricing explainers: /customgpt-pricing-explained/, /ai-chatbot-pricing-structure/. Free tools hub: /free-tools/. Industries: /industries/ (deep membership-organizations cluster). Templates: /chatgpt-custom-instructions-template/.
- Third-party (quoted, fetched): Product Hunt https://www.producthunt.com/products/customgpt/reviews displayed 3.6/5, 5 reviews, 1.5K followers. Trustpilot https://www.trustpilot.com/review/customgpt.ai displayed TrustScore 4.4, 13 reviews. G2 https://www.g2.com/products/customgpt/reviews blocked; a search summary said no reviews yet, UNVERIFIED. Capterra/G2/Product Hunt all host "CustomGPT alternatives" pages (capterra.com/p/10004844/CustomGPT-ai/alternatives/, g2.com/products/customgpt/competitors/alternatives, producthunt.com/products/customgpt/alternatives), SelectHub, SoftwareAdvice AU. Named in voiceflow, sitegpt, pondero, futurepedia, pickaxe, heeya, yourgpt reviews/comparisons.

### B6. Cross-cutting patterns

1. All four publish llms.txt; Vyostra 404s it.
2. All four have competitor-name alternatives/vs pages (15 to 98 URLs each). Wonderchat and Tidio even rank for their OWN "alternatives" query.
3. The listicles that actually won the CRM/lead-capture queries are first-party "best X" posts with a comparison table, FAQ block, named author and a visible "last updated" date (Wonderchat #1).
4. Third-party review presence (G2/Capterra/Product Hunt/Trustpilot) produces a second layer of "X alternatives" pages hosted by the review sites, which list the vendor for free.
5. None of the four has an India page, INR pricing, or India/WhatsApp-real-estate content (0 sitemap URLs containing "india"). Those SERPs are held by small Indian vendors (wacto.in, telecrm.in, chatbotbuilder.in, aichatbotindia.com, botsense).

---

## Highest-leverage gaps for Vyostra

1. **Crawlable site**: homepage and product pages are an empty SPA shell with no meta description; no robots.txt, sitemap.xml or llms.txt. Nothing else matters until prerendering covers /, /pricing, /features and robots/sitemap/llms.txt exist. (Observed.)
2. **Entity disambiguation**: no G2/Capterra/Product Hunt/Crunchbase/Wikidata/X/YouTube; only LinkedIn (weakly indexed) and a public GitHub repo. Search is already confusing Vyostra with Vyomastra. Needs Organization schema with `sameAs`, one canonical brand spelling, and the free listings.
3. **Alternatives/vs pages** targeting Chatbase, Tidio, Wonderchat, Interakt/WATI-style Indian tools, built on the one axis none of them claims: native CRM + WhatsApp follow-up for Indian SMBs.
4. **India + vertical pages** (AI chatbot for website India, WhatsApp chatbot for real estate India, INR pricing): the least contested queries in this sample; none of the four global players compete there.
5. **One owned "best AI chatbot with built-in CRM / lead capture" listicle** in Wonderchat's winning format (comparison table, FAQ, named author, updated date), plus a "how to train a chatbot on your website" guide.
