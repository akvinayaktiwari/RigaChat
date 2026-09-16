# Content strategy: who we write for, and what winning looks like

Read this before writing anything public — a blog post, a landing page, a
comparison page. It is the standing brief. `BLOG_AUTHORING.md` covers the
mechanics; this covers the target.

## The market

**Global product, two focus markets: India and the UAE.**

Sell anywhere, write for those two. Everything below follows from that: a page
written for nobody in particular ranks for nobody in particular, and "global"
content in this category is already saturated by vendors with far more domain
authority than vyostra.com has today.

### India — the primary market

Everything is already built for it and every claim is safe to make.

- Pricing is **one global list in USD** ($49 / $129 / $349). India is no longer
  priced separately or lower. Quote USD; a converted rupee figure is fine
  alongside it, marked approximate, because the card is charged in USD.
- WhatsApp is the channel that matters. Gupshup is the provider behind it.
- Real estate is the strongest vertical; clinics and edtech are secondary.
- Compliance worth naming where relevant: **RERA** for property advertising, and
  India's tightening data-protection regime for consent and opt-in.
- `frontend/src/lib/phone.ts` defaults bare 10-digit numbers to `+91`. The
  product is India-shaped in code, not just in marketing.

### UAE — the expansion market

High-value, and the four competitors we studied (Chatbase, Wonderchat, Tidio,
CustomGPT) ignore the region entirely: not one of their sitemaps contains a URL
with "india" or a Gulf market in it. Dubai real estate is the obvious wedge.

Three things are true today, and a UAE page must respect all three:

1. **No self-serve checkout yet.** Pricing is global USD now, but the checkout
   still runs on Razorpay's India plans: international CTAs route to a mailto
   until USD plans exist (TODOS.md). So a UAE page ends in **"talk to us"**, not
   "start free trial" — until that changes.
2. **English, not Arabic.** Multi-language is Phase 2. English is defensible for
   Dubai real estate; implying Arabic support is not.
3. **The on-page voice agent needs a network test.** It is browser audio to our
   own relay, so the DID and telecom-licensing problems of phone numbers do not
   apply — but the UAE blocks some VoIP at ISP level and nobody has loaded the
   widget from a UAE network. Verify before a page promises it works there.
   (Tracked in TODOS.md.)

Quote the global USD price for the UAE too. Do not invent an AED figure: the
card is charged in USD, and a local-currency number nobody is charged is just
wrong.

## Two audiences, one page

Every page is written for a human buyer **and** for the engines. These pull in
the same direction more than people assume: the thing that earns an AI citation
is a clear, self-contained, checkable answer, which is also what a buyer wants.

### Ranking on Google

- One page per intent. Do not write two pages chasing the same query.
- The keyword clusters and the ten planned articles are in
  `docs/seo/SEO-GEO-AUDIT.md` (section 5) and
  `docs/seo/research/keyword-clusters.md`.
- Prerendered static HTML is non-negotiable. A page a crawler cannot read
  without JavaScript does not exist. This is the problem the September 2026 work
  fixed; do not reintroduce it.
- Title, meta description, one H1, a trailing-slash canonical, and internal
  links to the related feature page and cluster siblings.

### Getting quoted by ChatGPT, Perplexity and AI Overviews

This is the half most competitors are not doing yet, and it is where a small
site can win.

- **Answer in the first paragraph.** Open with a direct, quotable definition or
  answer, then expand. An engine lifts the paragraph that answers the question,
  not the one that builds up to it.
- **Write self-contained passages.** Every section should make sense quoted on
  its own, without the two paragraphs above it. Pronouns referring back across
  headings are how a passage becomes unquotable.
- **Use an FAQ block** (`meta.faq`) with questions phrased the way people ask
  them. It renders on the page and publishes FAQPage schema from the same array.
- **Be specific and checkable.** "The 24-hour customer service window" earns
  citations. "Boost your conversions" does not.
- **Comparison tables get quoted** more than prose. Where a decision has three
  options, give it three rows.
- **Entity consistency.** The product is "Vyostra AI" everywhere, always. The
  name collides with Vyomastra Technologies (a drone company in Karnataka),
  Vystra and Vynta AI, so consistency plus `sameAs` links in the Organization
  schema is what keeps the entity distinct.
- **Off-site presence is part of this.** AI answers lean on listicles, G2 and
  Capterra, and Reddit. Being absent from those caps what on-site work can do —
  see the audit's off-site plan.

## Non-negotiables

1. **Never invent a number.** No response times, conversion rates, market sizes
   or customer counts unless they are sourced and cited, with the source named
   in the text. If a figure is an estimate, say so in the sentence. This is a
   category full of made-up statistics; being the page that cites its sources is
   a competitive advantage, not a constraint.
2. **Never claim a capability the product does not ship today.** Not the
   roadmap, not "coming soon" written as though it is live.
3. **Platform rules over marketing claims.** Where a constraint exists (the
   WhatsApp 24-hour window, template approval, opt-in), lead with it. Explaining
   what actually governs the channel is the thing vendor pages skip, and it is
   why our pages deserve to rank.
4. **Every public page is prerendered.** Add its route in
   `frontend/prerender-entry.tsx` and `crawl-files.ts`, and its prefix in
   `deploy/cloudfront/viewer-request.js`. Blog posts get this automatically.

## Current state

- **Published:** WhatsApp chatbot for real estate in India.
- **Next:** on-page voice agent for India, then the UAE edition once the network
  test is done.
- **Planned:** the remaining articles in the audit's section 5, prioritised by
  the India/UAE focus above rather than by search volume alone.
