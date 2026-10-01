# GEO Analysis — vyostra.com (2026-10-01)

Method: live `curl` of robots.txt, llms.txt, sitemap and the homepage fetched as `OAI-SearchBot` (no JS executed). Baseline: `GEO-AUDIT-2026-09-19.md` (63/100). Not measured: rankings, actual AI citations, Wikipedia/Reddit/YouTube presence (no DataForSEO/Ahrefs access this run).

## GEO Readiness Score: ~68 / 100 (estimate)

The 09-19 audit was never formally re-scored. This estimate credits the shipped fixes (question H2s, "What is Vyostra AI?" block, breadcrumb/WebPage schema, internal links, Person schema). It is held down by the same constraint as before: only **2 blog posts** and no off-site entity presence.

| Criterion | Weight | Score | Note |
|---|---|---|---|
| Citability | 25% | 17/25 | Definition block live; thin supply of 134-167 word answer passages beyond the homepage |
| Structure | 20% | 17/20 | Clean H1→H2 hierarchy, question headings present |
| Multi-modal | 15% | 8/15 | Not re-checked; no video/original data assets known |
| Authority | 20% | 12/20 | Two Person nodes in schema, but only one `sameAs` (company LinkedIn); no founder profiles, no Wikipedia/Reddit/YouTube |
| Technical | 20% | 16/20 | SSR/prerender works; llms.txt absent (low weight) |

## Platform breakdown (estimates)

| Platform | Score | Driver |
|---|---|---|
| Google AI Overviews | 62 | Needs classic rankings first; 15-URL site is small |
| Google AI Mode | 55 | Needs freshness + entity authority; both thin |
| ChatGPT Search | 60 | Crawlable; no Wikipedia/Reddit footprint |
| Perplexity | 52 | Reddit-driven; zero community presence |

## AI crawler access (each checked separately)

| User-agent | Governs | Status |
|---|---|---|
| OAI-SearchBot | ChatGPT Search citability | Allowed |
| Claude-SearchBot | Claude search citability | Allowed |
| PerplexityBot | Perplexity search | Allowed |
| Googlebot | Google Search / AI Overviews / AI Mode | Allowed (`*` group) |
| GPTBot | OpenAI training | Allowed |
| ClaudeBot | Anthropic training | Allowed |
| Google-Extended | Gemini/Vertex training + grounding only | Allowed |
| ChatGPT-User | user-triggered browsing | Allowed (robots.txt cannot block it anyway) |
| CCBot, Applebot-Extended, Bytespider, cohere-ai | training | No explicit rule; fall to `*` = allowed |

No crawler is blocked. Training vs search access is a licensing choice, not a visibility one.

## llms.txt
`/llms.txt` returns **404**. Google says it does not help or hurt Google Search; it is an optional extra for non-Google systems. No score weight. Skip unless you want it for completeness.

## Server-side rendering
Pass. Fetched without JS, the homepage returns 106 KB of HTML with the H1, 10 H2s, the "What is Vyostra AI?" definition, pricing and blog links all present, plus JSON-LD (`Organization`, `WebSite`, `SoftwareApplication` with 3 `Offer`s, 2 `Person`). Consistent with the prerender work in [[seo-prerender-app-shell]].

## Top 5 highest-impact changes

1. **Publish more posts.** 2 blog posts is the binding constraint, as the 09-19 audit said. AI engines cite pages, and the site has 15 URLs. Target India/UAE queries per the content-market plan.
2. **Founder entity links.** The two `Person` nodes have no `sameAs`; the Organization has only company LinkedIn. Add founder LinkedIn URLs plus a credential line on `/about-us/`. Blocked on founder inputs.
3. **Off-site mentions.** YouTube (strongest correlate, ~0.74) and Reddit are absent. A short product walkthrough on YouTube and genuine answers in r/realestateindia-type threads beat any on-page tweak.
4. **`dateModified` + refresh cadence.** Content under 3 months old is cited far more; set a 60-90 day refresh on both posts and the feature pages, and expose `dateModified` in schema.
5. **Measure real citations.** No baseline exists. Run a fixed set of 20 novel prompts monthly across ChatGPT, Perplexity and AI Mode and log whether vyostra.com is cited. Without it, the 68 is a guess.

## Schema recommendations
- Add `sameAs` to both `Person` nodes and a `jobTitle`.
- Add `dateModified` to `BlogPosting`.
- `FAQPage` is fine on `/help/` for crawlers but Google no longer shows it for commercial sites; do not expect a rich result.

## Content reformatting
- Keep the homepage definition block; ensure it stays 40-60 words up front.
- On each feature page (`/features/chatbot/`, `/whatsapp/`, `/crm/`, `/forms/`), lead with a self-contained "What is X?" answer, then 134-167 word passages per question H2.
- Cite Meta/WhatsApp primary docs for platform claims, as already done in the posts.

## Caveats
- Score is an estimate, not a formal re-score.
- Brand-mention analysis is an inference from the schema and sitemap, not a search.
- The StatsBar claims were already flagged and addressed per [[homepage-claims-must-be-checkable]].
