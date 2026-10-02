# GEO Analysis — vyostra.com (2026-10-02)

Method: live fetch of `robots.txt`, `llms.txt`, `sitemap.xml` and 16 pages as `OAI-SearchBot` (no JavaScript executed), parsed for schema, headings, passage lengths, media and outbound links. Brand presence checked with three web searches. Baseline: `GEO-ANALYSIS-2026-10-01.md` (~73, estimate).

Not measured: rankings, real AI citations, Google index coverage (no Search Console property is connected), Bing index. The scores are heuristics, not signals any search engine publishes.

Framing, per Google's AI optimization guide: this is SEO applied to AI surfaces. A page must be indexed and snippet-eligible in Google Search to appear in AI Overviews or AI Mode. `llms.txt`, chunking and schema added "for AI" are not levers for Google.

## 1. GEO Readiness Score: 71 / 100

| Criterion | Weight | Score | What decided it |
|---|---|---|---|
| Citability | 25 | 19 | Direct answers open the homepage, pricing, FAQ and the voice page. Feature pages are thin (235-470 words). Two of five posts cite no outside source. |
| Structure | 20 | 17 | No page skips a heading level (now enforced by a test). Question H2s on posts, FAQ and pricing; none on four feature pages. |
| Multi-modal | 15 | 5 | Zero `<img>` and zero video in the content of all 16 pages. Tables in every post and a live demo are the only non-text assets. |
| Authority | 20 | 12 | Bylines, dates, `Person` nodes with LinkedIn. No presence on YouTube, Reddit or Wikipedia. The about page carries no schema. |
| Technical | 20 | 18 | Every page is server-rendered, every crawler gets 200, sitemap carries real `lastmod`. Index coverage unverified. |

The total is below yesterday's ~73 because multi-modal was measured this time (5) instead of assumed (8). Nothing regressed; citability, authority and technical all rose.

## 2. Platform breakdown (estimates)

| Platform | Score | Driver |
|---|---|---|
| Google AI Overviews | 58 | Cites pages that already rank. Index coverage is unverified and the site is 21 URLs. |
| Google AI Mode | 58 | Rewards freshness and entity authority. Freshness is strong (4 of 5 posts under 3 weeks old); entity authority is thin. |
| ChatGPT Search | 60 | Fully crawlable by `OAI-SearchBot`. No Wikipedia or Reddit footprint to corroborate the brand. |
| Perplexity | 50 | Leans on Reddit and community sources, where the brand does not appear. |
| Bing Copilot | 50 | Depends on the Bing index. No Bing Webmaster verification or IndexNow is in place. |

## 3. AI crawler access (each user-agent checked separately)

Search citability:

| User-agent | Governs | robots.txt | Live fetch |
|---|---|---|---|
| `Googlebot` | Google Search, AI Overviews, AI Mode | Allowed (`*` group) | 200 |
| `OAI-SearchBot` | ChatGPT Search citability | Allowed (named) | 200 |
| `Claude-SearchBot` | Claude search citability | Allowed (named) | 200 |
| `PerplexityBot` | Perplexity search | Allowed (named) | 200 |
| `Applebot` | Siri, Spotlight, Safari | Allowed (`*` group) | not fetched |

Training and grounding:

| User-agent | Governs | robots.txt |
|---|---|---|
| `GPTBot` | OpenAI model training | Allowed (named) |
| `ClaudeBot` | Anthropic model training | Allowed (named) |
| `Google-Extended` | Gemini and Vertex training and grounding only | Allowed (named) |
| `CCBot`, `Applebot-Extended`, `Bytespider`, `cohere-ai` | training | No rule; fall to `*`, allowed |

User-triggered fetchers (`ChatGPT-User`, `Claude-User`, `Google-Agent`) ignore robots.txt by design. `ChatGPT-User` is named and allowed; the rule has no effect either way.

Disallowed for everyone: `/dashboard`, `/admin`, `/auth/`, `/l/`, `/api/`, and the three test pages. Correct. No search crawler is blocked from any public page.

## 4. llms.txt

Present: `200`, `text/plain`, valid llmstxt.org structure (definition, Product, Pricing, Blog, Company, Optional), generated from the same data as the sitemap so it cannot drift.

No score weight. Google states it neither helps nor hurts Search; the evidence that other engines read it is thin. Nothing to do here.

One accuracy note: the WhatsApp line says alerts are "sent through Gupshup". True today. It must change together with the FAQ and Help copy when the Meta direct route opens to clients.

## 5. Brand mention analysis

| Surface | Finding |
|---|---|
| Wikipedia / Wikidata | None. |
| YouTube | None found. |
| Reddit | None found. |
| LinkedIn | Company page and both founder profiles exist and are linked as `sameAs`. |
| GitHub | Two public repos rank first for the brand name. |

Two problems came out of the brand search:

1. **Searching "Vyostra AI" returned the GitHub repos, not vyostra.com.** The search tool is not Google, so this is not proof the site is unindexed, but it is the strongest reason to verify the property in Search Console now.
2. **The brand describes two different products.** The top results are `VyostraAI-Interview` (AI interviews with proctoring) and `RigaChat` (the chatbot). The repo text also says "built by a solo founder" and "for Indian SMBs", while the site names two founders and sells globally. An engine assembling an answer about "Vyostra AI" from these gets a mixed entity.

## 6. Passage-level citability

Target is a self-contained 134-167 word answer under a question heading. Of 94 H2 sections measured, 8 land in that range.

Already citable as they stand:

| Page | Section length (words) |
|---|---|
| Homepage, "What is Vyostra AI?" | 148 |
| Voice agents on your website (post) | 159, 152, 160 |
| WhatsApp chatbot for real estate (post) | 145 |
| Voice agent for real estate (post) | 134 |
| On-page vs phone agent (post) | 159 |
| Pilgrimage residences (post) | 167 |

Too thin to quote (the whole page is the problem, not one passage):

| Page | Words | Longest paragraph |
|---|---|---|
| `/features/forms/` | 235 | 24 |
| `/features/crm/` | 310 | 51 |
| `/features/whatsapp/` | 342 | 51 |
| `/features/chatbot/` | 469 | 54 |
| `/help/` | 468 | 15 |

Too long to lift cleanly: several post sections run 290-600 words under one H2 (WhatsApp post 370, 325, 464; pilgrimage post 603, 514). A sub-heading every 150-200 words would give an engine a boundary to cut at. This is ordinary readability work, not chunking for AI.

## 7. Server-side rendering

Pass. All 16 pages return complete HTML without JavaScript: H1, every H2, body copy, FAQ answers, pricing and JSON-LD. Sizes run 24 kB to 107 kB. No content depends on the client bundle.

## 8. Top 5 highest-impact changes

1. **Verify vyostra.com in Search Console and confirm the pages are indexed.** Everything else assumes this. Submit the sitemap and request indexing for `/pricing/`, `/faq/` and `/features/voice-agent/`. Owner task: it needs your Google account.
2. **Fix the brand entity outside the site.** Rewrite the two GitHub repo descriptions and READMEs to match the site (one definition, two founders, link to vyostra.com), or make the interview repo private or rename it. This is the only off-site surface that currently ranks for the brand, and it contradicts the site.
3. **Put one real video on YouTube and embed it.** A 2-3 minute product walkthrough addresses the two weakest scores at once: multi-modal (5/15) and off-site presence. YouTube mentions are the strongest measured correlate of AI visibility.
4. **Rebuild the four older feature pages on the voice-agent page's pattern.** `/features/voice-agent/` opens with a direct definition and has question H2s and a visible FAQ; chatbot, WhatsApp, CRM and forms have none of that and are 235-470 words.
5. **Add first-hand evidence and sources to the two unsourced voice posts.** "Voice agent for real estate" and "On-page vs phone agent" link to no outside source. Google's test is first-hand, non-commodity content: measured latency from your own agent, a real transcript, a screenshot of the handoff. Add real numbers only; none are to be invented.

## 9. Schema recommendations

- `/about-us/` has no JSON-LD at all. It is the page about the founders, so it should carry `AboutPage` with the `Organization` and both `Person` nodes that other pages already emit.
- `/blog/` has no JSON-LD. Add `CollectionPage` or `Blog` with an `ItemList` of the posts.
- The four older feature pages emit only `WebPage` and `BreadcrumbList`. Leave them until the pages have a visible FAQ; schema must describe visible content.
- `/help/` emits `FAQPage` with no `Organization` or `BreadcrumbList`. Minor.
- No post has an `image` on its `BlogPosting`, because no post has an image. Google's article guidance recommends one.
- `FAQPage` is correct where the questions are visible, but Google no longer shows FAQ rich results for commercial sites. Expect no rich result from it.

## 10. Content reformatting suggestions

- **Homepage H1** ("Deploy AI agents your customers love to talk to.") names neither the product nor the category. The definition follows in the first H2, so the page still answers early; a subtitle sentence that starts "Vyostra AI is…" directly under the H1 would move the answer into the first 60 words.
- **`/features/chatbot/`, `/whatsapp/`, `/crm/`, `/forms/`:** open each with "The Vyostra AI [feature] is…" in 40-60 words, replace the "How It Works" style H2s with the questions buyers ask, and add a visible FAQ of 3-4 real questions.
- **`/faq/`:** the first section is 174 words covering several questions. Each answer is already short and direct; no change needed beyond keeping answers first.
- **WhatsApp and pilgrimage posts:** split the 370-600 word sections with H3s.
- **Pilgrimage post:** 10 H2s, none phrased as a question, and it is the only post over two months old. It is off the product's topic; refresh it or accept that it will not be cited for product queries.
- **Images:** every post is text and tables only. One diagram per post (the 24-hour WhatsApp window, the voice latency budget) gives image search and multi-modal answers something to use.

## Caveats

- Scores are estimates from on-page signals and three searches.
- Index coverage and rankings were not measured. If the site is not indexed, the Google scores above are too high.
- Brand-mention findings come from a US-only search tool, not from Google, Reddit or YouTube directly.

## Sources

- [akvinayaktiwari/VyostraAI-Interview](https://github.com/akvinayaktiwari/VyostraAI-Interview)
- [akvinayaktiwari/RigaChat](https://github.com/akvinayaktiwari/RigaChat)
- [Google AI optimization guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
