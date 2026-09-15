# Vyostra AI: SERP-Overlap Topic Cluster Plan

Date: 2026-09-15. Site: https://vyostra.com. Research only; no repo files changed.

## 0. Method and hard limitations (read first)

- **No keyword-volume or difficulty API was available.** No search volumes, KD, or CPC numbers appear anywhere in this document. Priority is qualitative only (High / Medium / Low, labelled "estimated").
- **SERP source:** the WebSearch tool, which is **US-located** and returns roughly 6-10 results per query, not a full google.co.in top 10. Real Indian SERPs will differ (more .in domains, IndiaMART/JustDial, YouTube, Reddit/Quora). Treat every overlap count as a **lower bound from a truncated, non-India SERP**.
- **AI Overview presence was not observed directly** (the tool does not show SERP features). "AI answer likely" is an inference from query shape (definitions, cost ranges, "best X", how-to) plus the answer-style summaries the tool itself produced.
- 33 queries searched. Overlap = count of identical URLs (not domains) between two result lists.
- Thresholds applied: 7-10 same post, 4-6 same cluster, 2-3 interlink, 0-1 separate. Because SERPs are truncated, no pair reached 7; I group 2-3 overlap queries into one cluster only where page type AND intent also match, and flag it.

## 1. Queries searched and intent

| # | Query | Intent | Dominant page type seen |
|---|---|---|---|
| 1 | AI chatbot for website India (seed) | Commercial | Vendor/agency product pages + India listicles |
| 2 | best AI chatbot for website in India 2026 | Commercial (best-X) | "Top 10 in India" listicles (vendor + agency blogs) |
| 3 | chatbot for small business India | Commercial | India SMB listicles |
| 4 | free AI chatbot for website India | Commercial/Transactional | Global free-tool listicles + vendor pages; polluted by consumer "AI chat" apps |
| 5 | Hindi Hinglish AI chatbot for website | Mixed (mostly consumer) | Consumer Hindi chat apps, GitHub repos; only Kommunicate/AmplifyReach are B2B |
| 6 | website chatbot price in India | Commercial-investigational | Agency "development cost in India" guides |
| 7 | AI chatbot trained on website content India pricing INR | Commercial-investigational | Same cost guides + SaaS pricing pages |
| 8 | Chatbase pricing in INR | Commercial-investigational | Third-party Chatbase pricing reviews (USD only) |
| 9 | AI chatbot with CRM (seed) | Commercial (best-X) + Informational | Global listicles/guides (Chatbase ranks its own blog) |
| 10 | chatbot with built-in CRM for small business | Commercial | Listicles + CRM vendor product pages |
| 11 | chatbot CRM integration India | Informational | How-to integration guides |
| 12 | what is a CRM chatbot | Informational | Definition/explainer posts, glossary |
| 13 | AI chatbot lead management software India | Commercial | Indian lead-management/CRM listicles |
| 14 | WhatsApp CRM for small business India | Commercial | Indian WhatsApp-CRM vendor listicles |
| 15 | lead capture chatbot for small business (seed) | Commercial (best-X) | Global "best lead gen chatbot" listicles |
| 16 | best chatbot for lead generation 2026 | Commercial (best-X) | Global listicles |
| 17 | reddit best AI chatbot for small business website lead capture | Commercial | Same global listicles (Reddit threads not returned as URLs) |
| 18 | lead generation chatbot for small business India WhatsApp website | Commercial | Indian agency/blog guides |
| 19 | chatbot for lead qualification questions examples | Informational | How-to / question-list posts |
| 20 | how to add AI chatbot to website trained on your content | Informational (how-to) | Vendor how-to tutorials |
| 21 | WhatsApp chatbot for real estate (seed) | Informational/Commercial | Vendor "use cases" blogs (global) |
| 22 | WhatsApp chatbot for real estate India | Commercial | Indian vendor blogs + landing pages |
| 23 | real estate chatbot for website India | Commercial | Indian proptech vendor blogs/landing pages |
| 24 | WhatsApp automation for real estate agents India | Commercial | Indian WhatsApp tool landing pages + guides |
| 25 | real estate lead follow up automation WhatsApp | Informational | WhatsApp API vendor guides |
| 26 | best CRM for real estate India with WhatsApp | Commercial (best-X) | Real-estate CRM vendor listicles |
| 27 | AI chatbot for real estate lead generation | Commercial (best-X) | US-centric listicles (ChatBot.com, HousingWire, Ylopo) |
| 28 | instant WhatsApp reply to Facebook lead ads India | Informational (how-to) | CRM/integration vendor how-tos |
| 29 | AI voice agent for real estate India | Commercial | Voice-AI vendor blogs (one vendor holds 3 of 6 slots) |
| 30 | Chatbase alternative India (seed) | Comparison | Review aggregators (Capterra.in, G2, AlternativeTo) + vendor listicles |
| 31 | Chatbase alternatives | Comparison | Vendor listicles + competitor-owned "vs" pages |
| 32 | Chatbase vs Tidio vs BotPenguin | Comparison | Vendor-owned vs pages, StackShare, Capterra |
| 33 | BotPenguin alternatives | Comparison | Aggregators (SourceForge, SoftwareSuggest, AlternativeTo) + competitor pages |
| 34 | Indian alternative to Chatbase custom GPT chatbot website | Comparison | Capterra.in, competitor vs pages, GitHub |
| 35 | Wati alternatives India | Comparison | Indian WhatsApp BSP vendor listicles |

Navigational: none of the expanded queries was purely navigational; "Chatbase pricing in INR" is brand-adjacent but investigational, kept.

## 2. SERP overlap matrix (URL-level, observed pairs with any overlap or notable zero)

| Pair | Shared URLs | Shared | Verdict |
|---|---|---|---|
| website chatbot price in India x AI chatbot ... pricing INR | tringlabs.ai/chatbot-in, codingclave.com/blog/ai-chatbot-development-cost-india-2026, finzarc.com/cost/ai-chatbot-development-cost-india, wowinfotech.com/blog/ai-chatbot-development-cost-india | 4 | Same cluster (near same-post given truncation) |
| lead capture chatbot for small business x best chatbot for lead generation 2026 | lindy.ai/blog/ai-lead-generation-chatbot, eesel.ai/blog/best-chatbot-for-lead-generation, nextiva.com/blog/best-chatbots-for-lead-generation.html, featurebase.app/blog/chatbot-lead-generation | 4 | Same cluster (treat as one page) |
| lead capture chatbot for small business x reddit best AI chatbot ... lead capture | lindy, wonderchat.io/blog/ai-chatbot-tools-lead-capture, nextiva, featurebase | 4 | Same cluster |
| best chatbot for lead generation 2026 x reddit query | lindy, nextiva, featurebase | 3 | Interlink (same page given above) |
| AI chatbot with CRM x chatbot with built-in CRM for small business | chatbase.co/blog/crm-chatbot, jotform.com/ai/agents/chatbot-integration-with-crm, noupe.com/blog/best-chatbot-builders-with-crm-integration | 3 | Interlink / likely same post (truncated) |
| Chatbase alternative India x Chatbase alternatives | chatimize.com/chatbase-alternatives, lindy.ai/blog/chatbase-alternatives, alternativeto.net/software/chatbase/?p=3 | 3 | Interlink / likely same post |
| AI chatbot with CRM x chatbot CRM integration India | chatbase.co/blog/crm-chatbot, beconversive.com/... | 2 | Interlink |
| chatbot CRM integration India x what is a CRM chatbot | chatbase.co/blog/crm-chatbot, gptbots.ai/blog/chatbot-integration-with-crm | 2 | Interlink |
| AI chatbot for website India x best AI chatbot for website in India 2026 | haptik.ai/blog/10-best-ai-chatbots-in-india, acemindtech.com/ai-chatbots-for-indian-businesses-2026-... | 2 | Interlink (grouped on intent, flagged) |
| AI chatbot for website India x chatbot for small business India | aichatbotindia.com, acemindtech.com/... | 2 | Interlink (grouped on intent, flagged) |
| WhatsApp chatbot for real estate India x real estate chatbot for website India | chatbotbuilder.in/chatbot-for-real-estate-india, wacto.in/conversational-ai-chatbot-for-real-estate-india | 2 | Interlink |
| AI chatbot with CRM x what is a CRM chatbot | chatbase.co/blog/crm-chatbot | 1 | Separate |
| Chatbase alternative India x Chatbase vs Tidio vs BotPenguin | chatimize.com/chatbase-alternatives | 1 | Separate |
| Chatbase alternative India x Indian alternative to Chatbase | capterra.in/alternatives/1053300/chatbase | 1 | Separate |
| WhatsApp automation RE agents India x best CRM RE India WhatsApp | blog.kraya-ai.com/whatsapp-crm-real-estate-india | 1 | Separate |
| WhatsApp automation RE agents India x WhatsApp chatbot RE India | leasable360.com/blog/ai-whatsapp-real-estate-india | 1 | Separate |
| AI chatbot lead mgmt software India x lead gen chatbot SMB India WhatsApp website | circuitwave.in/blog/ai-chatbot-lead-generation-india | 1 | Separate |
| AI chatbot lead mgmt software India x best chatbot for lead gen 2026 | tailortalk.ai/blogs/8-best-website-lead-generation-chatbots-in-2026-... | 1 | Separate |
| WhatsApp chatbot for real estate x WhatsApp chatbot for real estate India | none | 0 | Separate (adding "India" fully reshuffles the SERP) |
| AI chatbot for real estate lead generation x any India RE query | none | 0 | Separate (US SERP) |
| real estate lead follow up automation WhatsApp x other RE queries | none | 0 | Separate |
| instant WhatsApp reply to FB lead ads India x others | none | 0 | Separate |
| AI voice agent for real estate India x others | none | 0 | Separate |
| Wati alternatives India x Chatbase alternative queries | none | 0 | Separate |

Domain-level (not URL) recurrence worth noting: acemindtech.com appears in 5 India chatbot SERPs (#1,2,3,7,18); groweon.com in #13 and #14 (2 URLs); kraya-ai in #14, #24, #26; vomyra.com holds 3 of 6 in #29; botpenguin.com appears in #4, #16, #32, #33.

Key reading: the **India real-estate/WhatsApp SERPs are highly fragmented** (0-2 overlap, small vendors, no aggregator dominance). That means each query needs its own page, and ranking is comparatively open (estimated). The **global chatbot/CRM/lead-gen SERPs are consolidated** around a few strong listicles (Lindy, eesel, Featurebase, Jotform, Chatbase's own blog), which is harder to break into without an India angle.

## 3. Clusters

### Cluster A: "AI chatbot for website in India" (commercial, best-X) - PILLAR cluster
- Members: AI chatbot for website India; best AI chatbot for website in India 2026; chatbot for small business India; free AI chatbot for website India; how to add AI chatbot to website trained on your content (informational section); Hindi Hinglish AI chatbot for website (section only, SERP is consumer-polluted).
- Overlap evidence: 2 per pair (flagged: grouped by shared intent and page type, not by the 4+ threshold).
- Dominant SERP type: India "Top 10 AI chatbots in India" listicles written by vendors/agencies, plus agency service pages.
- Example URLs: https://www.haptik.ai/blog/10-best-ai-chatbots-in-india, https://acemindtech.com/ai-chatbots-for-indian-businesses-2026-whatsapp-website-instagram/, https://aichatbotindia.com/, https://botsify.com/chatbot-service-in-india, https://cyfuture.com/chatbot.html, https://www.sutraforge.com/blog/best-ai-chatbot-solutions-small-businesses-india, https://yorava.site/best-ai-chatbot-for-small-business-in-india/, https://botpenguin.com/platform/chatbot-for-website, https://denser.ai/blog/free-chatbot-for-website/
- AI answer likely: yes ("best X in India" list answers; Hindi/Hinglish and setup-time facts were surfaced as answer snippets).
- Priority (estimated): High. Closest fit to the product.

### Cluster B: Chatbot pricing in India / INR (commercial-investigational)
- Members: website chatbot price in India; AI chatbot trained on website content India pricing INR; Chatbase pricing in INR.
- Overlap: 4 (queries 6 x 7) -> same cluster; arguably the same post.
- Dominant SERP type: Indian dev-agency "AI chatbot development cost in India" guides (custom-build framing, Rs 30k to Rs 5L+), a few SaaS pricing pages.
- Example URLs: https://codingclave.com/blog/ai-chatbot-development-cost-india-2026, https://www.finzarc.com/cost/ai-chatbot-development-cost-india, https://www.wowinfotech.com/blog/ai-chatbot-development-cost-india, https://tringlabs.ai/chatbot-in/, https://aichatbot.com.in/blog/ai-chatbot-pricing-guide-2026, https://hyperleap.ai/blog/whatsapp-chatbot-pricing-india-2026, https://chatarmin.com/en/blog/chatbase-pricing
- Gap: SERP is dominated by custom-build agencies; few pages compare SaaS monthly INR plans vs build cost. Chatbase pricing pages note USD billing with forex markup (chatarmin), which an INR-billed product can answer directly.
- AI answer likely: very (numeric cost ranges are classic AI Overview material).
- Priority (estimated): High.

### Cluster C: Chatbot with CRM and lead capture (commercial + informational)
Two sub-groups that interlink:
- C1 CRM chatbot: AI chatbot with CRM; chatbot with built-in CRM for small business; chatbot CRM integration India; what is a CRM chatbot. Overlap 1-3.
  - Dominant: global listicles and explainers; Chatbase's own blog ranks in 4 of these SERPs.
  - URLs: https://www.chatbase.co/blog/crm-chatbot, https://www.jotform.com/ai/agents/chatbot-integration-with-crm/, https://www.noupe.com/blog/best-chatbot-builders-with-crm-integration/, https://www.gptbots.ai/blog/chatbot-integration-with-crm, https://www.leadsquared.com/learn/process-automation/chatbot-and-crm-integration/, https://hyperleap.ai/blog/chatbot-crm-integration-guide, https://irisagent.com/blog/chatbot-crm/
- C2 Lead-capture chatbot: lead capture chatbot for small business; best chatbot for lead generation 2026; reddit query; chatbot for lead qualification questions examples (informational); AI chatbot lead management software India; lead generation chatbot for small business India WhatsApp website. Overlap 4 among the first three -> one page.
  - Dominant: global "best lead gen chatbot" listicles; India variants go to Indian CRM/agency blogs.
  - URLs: https://www.lindy.ai/blog/ai-lead-generation-chatbot, https://www.eesel.ai/blog/best-chatbot-for-lead-generation, https://www.featurebase.app/blog/chatbot-lead-generation, https://wonderchat.io/blog/ai-chatbot-tools-lead-capture, https://botpenguin.com/blogs/best-chatbot-for-lead-generation, https://circuitwave.in/blog/ai-chatbot-lead-generation-india, https://www.groweon.com/blog/top-10-lead-management-software-in-india-2026-guide/, https://liveassist.io/blog/lead-qualification-chatbot-questions
- Reddit: the reddit-modified query returned the same listicles plus paraphrased Reddit sentiment (Tidio free plan recommended; HubSpot chatbot pricing complaints), not Reddit URLs. On a live Google India SERP expect Reddit threads; unverified.
- Positioning caution: Vyostra's "CRM" is a lead queue with four statuses, not a full CRM. Target "chatbot with built-in lead inbox/CRM" and "lead capture" language rather than competing on "best CRM" terms (HubSpot/Zoho/Salesforce own those).
- Priority (estimated): Medium-High (C2 India variants), Medium (C1 global).

### Cluster D: WhatsApp + real estate lead automation, India (vertical hub)
- Members: WhatsApp chatbot for real estate India; WhatsApp chatbot for real estate; real estate chatbot for website India; WhatsApp automation for real estate agents India; real estate lead follow up automation WhatsApp; instant WhatsApp reply to Facebook lead ads India; AI voice agent for real estate India; best CRM for real estate India with WhatsApp (adjacent); AI chatbot for real estate lead generation (US SERP, low fit); WhatsApp CRM for small business India (adjacent).
- Overlap: 0-2 across all pairs -> separate SERPs; one spoke per query group, heavy interlinking.
- Dominant SERP type: small Indian vendor blogs and landing pages (no aggregator dominance); "best real estate CRM India" is vendor listicles.
- Example URLs: https://www.verloop.io/blog/whatsapp-chatbot-for-real-estate/, https://telecrm.in/blog/whatsapp-chatbot-real-estate/, https://chatbotbuilder.in/chatbot-for-real-estate-india/, https://www.opzynic.com/blog/ai-chatbot-real-estate-lead-generation-2026, https://landbot.io/blog/whatsapp-real-estate-chatbot, https://chatmitra.com/industries/whatsapp-for-real-estate/, https://leadluence.com/whatsapp-real-estate, https://www.privyr.com/blog/how-to-automatically-whatsapp-facebook-leads/, https://telecrm.in/blog/facebook-lead-ads-to-whatsapp/, https://realatic.com/blog/best-crm-real-estate-india/, https://vomyra.com/blogs/ai-voice-agent-for-real-estate-in-india-a-complete-2026-guide, https://callquants.us/landing/ai-voice-agent-real-estate-india
- Why it matters: Vyostra uniquely spans website chat + Meta Lead Ads + WhatsApp journeys + voice in one product; every SERP here shows single-channel vendors.
- AI answer likely: yes for use-case lists, how-to (FB lead ads -> WhatsApp), and speed-to-lead facts.
- Priority (estimated): High (fragmented SERPs, strong product fit).

### Cluster E: Alternatives and comparisons (comparison intent)
- Members: Chatbase alternative India; Chatbase alternatives; Indian alternative to Chatbase; Chatbase vs Tidio vs BotPenguin; BotPenguin alternatives; Wati alternatives India.
- Overlap: 3 (Chatbase alt India x Chatbase alternatives) -> one page; others 0-1 -> separate pages.
- Dominant SERP type: review aggregators (Capterra.in, G2, AlternativeTo, SourceForge, SoftwareSuggest) + competitor-owned listicles and "X vs Y" pages.
- Example URLs: https://www.capterra.in/alternatives/1053300/chatbase, https://www.g2.com/products/chatbase-chatbase/competitors/alternatives, https://chatimize.com/chatbase-alternatives/, https://www.lindy.ai/blog/chatbase-alternatives, https://botpenguin.com/alternatives/chatbase, https://wotnot.io/comparisons/chatbase-alternative, https://yourgpt.ai/yourgpt-chatbot-vs-chatbase, https://www.spurnow.com/en/blogs/botpenguin-alternative, https://m.aisensy.com/blog/best-wati-alternatives/, https://inceptimind.com/blog/wati-alternatives-india/
- Gap: only Capterra.in carries an India signal for Chatbase alternatives; no page seen addresses INR billing, GST invoices, WhatsApp, Hinglish for Indian buyers.
- Off-site action: get listed on Capterra.in, G2, AlternativeTo, SoftwareSuggest (aggregators occupy many slots).
- AI answer likely: yes (comparison tables, "closest alternative" answers).
- Priority (estimated): High for Chatbase-India page, Medium for BotPenguin/Wati.

## 4. Hub-and-spoke architecture

```
/ (home)
|
+-- PILLAR 1: /ai-chatbot-for-website-india            [Cluster A, 2500-4000 words]
|     +-- /ai-chatbot-pricing-india                     [B spoke]
|     +-- /chatbase-alternatives-india                  [E spoke]
|     +-- /compare/vyostra-vs-chatbase | -vs-botpenguin | -vs-tidio   [E spokes, comparison template]
|     +-- /ai-chatbot-with-crm                          [C1 spoke]
|     +-- /lead-capture-chatbot-small-business          [C2 spoke]
|     +-- /blog/chatbot-lead-qualification-questions    [C2 informational spoke]
|
+-- PILLAR 2: /whatsapp-chatbot-for-real-estate-india   [Cluster D vertical hub, 2500-4000 words]
      +-- /blog/facebook-lead-ads-whatsapp-auto-reply   [D spoke, how-to]
      +-- /blog/real-estate-lead-follow-up-whatsapp     [D spoke]
      +-- /real-estate-chatbot-for-website              [D spoke]
      +-- /ai-voice-agent-real-estate-india             [D spoke]
```

Link matrix:
- Mandatory: every spoke <-> its pillar (bidirectional). Pillar 1 <-> Pillar 2.
- Recommended (within cluster): pricing <-> Chatbase alternatives <-> vs pages; CRM chatbot <-> lead capture <-> qualification questions; FB lead ads auto-reply <-> follow-up automation <-> voice agent <-> RE website chatbot.
- Optional (cross-cluster): qualification questions -> RE follow-up; RE website chatbot -> Pillar 1 pricing; Chatbase alternatives -> RE hub ("for real estate teams"); lead capture -> FB lead ads auto-reply.
- Each spoke receives: pillar link + at least 2 peer links = 3+ incoming.

Cannibalization check:
- "AI chatbot for website India" and "chatbot for small business India" -> one pillar page with an SMB section; do not create a separate SMB page.
- "lead capture chatbot for small business" and "best chatbot for lead generation" (overlap 4) -> one page.
- "website chatbot price in India" and "AI chatbot ... pricing INR" (overlap 4) -> one page.
- "Chatbase alternative India" and "Chatbase alternatives" (overlap 3) -> one page, India-first.
- "WhatsApp chatbot for real estate" (global) and "... India" (0 overlap) -> India hub targets the India term; global use-case term handled as a section, not a separate page.
- Avoid "best real estate CRM India" as a primary target: Vyostra is a lead queue, not a full real-estate CRM; that page would mismatch intent.

## 5. Ten page/article ideas

| # | Page | Cluster | Template | AI-answer target |
|---|---|---|---|---|
| 1 | AI Chatbot for Your Website in India: 2026 Buyer's Guide (SaaS vs agency, Hinglish, WhatsApp handoff, INR plans) | A (Pillar 1) | Pillar guide | "Best X in India" + FAQ |
| 2 | AI Chatbot Pricing in India: Monthly SaaS vs Custom Build, in INR | B | Cost guide with table | FAQ / cost-range answer |
| 3 | Best Chatbase Alternatives for Indian Businesses (INR billing, GST, WhatsApp, Hinglish) | E | Listicle/comparison | "Best X in India" + comparison |
| 4 | Vyostra vs Chatbase (and vs BotPenguin, vs Tidio) | E | Head-to-head comparison | Comparison table |
| 5 | AI Chatbot with Built-in Lead CRM for Small Businesses in India | C1 | Commercial landing/listicle | "Best X in India" |
| 6 | What Is a CRM Chatbot? How Website Chat Turns Into a Lead Queue | C1 | Explainer | FAQ / definition |
| 7 | 25 Lead Qualification Questions for Chatbots (Real Estate, Clinics, Coaching) | C2 | Informational list | FAQ / list answer |
| 8 | WhatsApp Chatbot for Real Estate in India: Use Cases, Setup, Costs | D (Pillar 2) | Vertical pillar | "Best X in India" + FAQ |
| 9 | How to Auto-Reply on WhatsApp to Facebook Lead Ads (India, step by step) | D | How-to | Step-list / FAQ |
| 10 | AI Voice Agent for Real Estate in India: Callback in 60 Seconds, Hinglish | D | Commercial landing | FAQ |

Suggested order (estimated priority): 8, 1, 3, 2, 9, 4, 5, 7, 10, 6. Rationale: fragmented real-estate SERPs and the unaddressed India angle on Chatbase alternatives look most winnable; global CRM-chatbot explainers face entrenched listicles.

## 6. Pre-delivery validation

- No two pages share a primary keyword: pass.
- Every spoke links to pillar and pillar to every spoke: pass (planned).
- Every spoke has 3+ incoming links planned: pass.
- Cluster count 2 pillars / 5 topic clusters, 2-5 posts each: pass.
- Word counts: pillars 2500-4000, spokes 1200-1800: specified.
- SERP overlap >= 4 among cluster peers: FAIL for clusters A, C1, D, and part of E. Grouping there rests on intent and page-type similarity plus truncated US SERPs, not on the 4+ threshold. Re-verify with a google.co.in top-10 export (e.g. a SERP API with gl=in) before committing to URL structure.

## 7. Structured plan (JSON)

```json
{
  "site": "https://vyostra.com",
  "generated": "2026-09-15",
  "data_limitations": ["no volume/KD API; priorities estimated", "WebSearch is US-located, 6-10 results per query", "AI Overview presence inferred, not observed"],
  "pillars": [
    {"id": "P1", "primary_keyword": "AI chatbot for website India", "url": "/ai-chatbot-for-website-india", "template": "pillar-guide", "intent": "commercial", "word_count": "2500-4000"},
    {"id": "P2", "primary_keyword": "WhatsApp chatbot for real estate India", "url": "/whatsapp-chatbot-for-real-estate-india", "template": "pillar-guide", "intent": "commercial", "word_count": "2500-4000"}
  ],
  "clusters": [
    {"id": "A", "name": "AI chatbot for website India", "pillar": "P1", "keywords": ["AI chatbot for website India", "best AI chatbot for website in India 2026", "chatbot for small business India", "free AI chatbot for website India", "how to add AI chatbot to website trained on your content", "Hindi Hinglish AI chatbot for website"], "max_pair_overlap": 2, "priority_estimated": "high"},
    {"id": "B", "name": "Chatbot pricing India", "pillar": "P1", "keywords": ["website chatbot price in India", "AI chatbot trained on website content India pricing INR", "Chatbase pricing in INR"], "max_pair_overlap": 4, "posts": [{"url": "/ai-chatbot-pricing-india", "template": "cost-guide", "word_count": "1200-1800"}], "priority_estimated": "high"},
    {"id": "C", "name": "Chatbot with CRM and lead capture", "pillar": "P1", "keywords": ["AI chatbot with CRM", "chatbot with built-in CRM for small business", "chatbot CRM integration India", "what is a CRM chatbot", "lead capture chatbot for small business", "best chatbot for lead generation 2026", "chatbot for lead qualification questions examples", "AI chatbot lead management software India", "lead generation chatbot for small business India WhatsApp website"], "max_pair_overlap": 4, "posts": [{"url": "/ai-chatbot-with-crm", "template": "commercial-listicle"}, {"url": "/lead-capture-chatbot-small-business", "template": "commercial-listicle"}, {"url": "/blog/what-is-a-crm-chatbot", "template": "explainer"}, {"url": "/blog/chatbot-lead-qualification-questions", "template": "informational-list"}], "priority_estimated": "medium-high"},
    {"id": "D", "name": "WhatsApp + real estate lead automation India", "pillar": "P2", "keywords": ["WhatsApp chatbot for real estate India", "WhatsApp chatbot for real estate", "real estate chatbot for website India", "WhatsApp automation for real estate agents India", "real estate lead follow up automation WhatsApp", "instant WhatsApp reply to Facebook lead ads India", "AI voice agent for real estate India"], "max_pair_overlap": 2, "posts": [{"url": "/blog/facebook-lead-ads-whatsapp-auto-reply", "template": "how-to"}, {"url": "/blog/real-estate-lead-follow-up-whatsapp", "template": "how-to"}, {"url": "/real-estate-chatbot-for-website", "template": "commercial-landing"}, {"url": "/ai-voice-agent-real-estate-india", "template": "commercial-landing"}], "priority_estimated": "high"},
    {"id": "E", "name": "Alternatives and comparisons", "pillar": "P1", "keywords": ["Chatbase alternative India", "Chatbase alternatives", "Indian alternative to Chatbase", "Chatbase vs Tidio vs BotPenguin", "BotPenguin alternatives", "Wati alternatives India"], "max_pair_overlap": 3, "posts": [{"url": "/chatbase-alternatives-india", "template": "comparison-listicle"}, {"url": "/compare/vyostra-vs-chatbase", "template": "head-to-head"}, {"url": "/compare/vyostra-vs-botpenguin", "template": "head-to-head"}], "priority_estimated": "high"}
  ],
  "links": {
    "mandatory": "every spoke <-> its pillar; P1 <-> P2",
    "recommended": [["/ai-chatbot-pricing-india", "/chatbase-alternatives-india"], ["/chatbase-alternatives-india", "/compare/vyostra-vs-chatbase"], ["/ai-chatbot-with-crm", "/lead-capture-chatbot-small-business"], ["/lead-capture-chatbot-small-business", "/blog/chatbot-lead-qualification-questions"], ["/blog/facebook-lead-ads-whatsapp-auto-reply", "/blog/real-estate-lead-follow-up-whatsapp"], ["/blog/real-estate-lead-follow-up-whatsapp", "/ai-voice-agent-real-estate-india"], ["/real-estate-chatbot-for-website", "/blog/facebook-lead-ads-whatsapp-auto-reply"]],
    "optional": [["/blog/chatbot-lead-qualification-questions", "/blog/real-estate-lead-follow-up-whatsapp"], ["/real-estate-chatbot-for-website", "/ai-chatbot-pricing-india"], ["/lead-capture-chatbot-small-business", "/blog/facebook-lead-ads-whatsapp-auto-reply"]]
  }
}
```
