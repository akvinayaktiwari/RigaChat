# Comparison pages — drafts, NOT live

Three pages are planned: `/compare/vyostra-vs-kommo`, `/compare/vyostra-vs-spur`,
`/compare/vyostra-vs-wati`. None is routed, prerendered or in the sitemap, and none
should be until every `TODO: verify` below is replaced by a fact with a source.

**Why they are a document and not page components:** a comparison page states facts
about another company. An unverified cell that ships is a false claim an answer
engine will quote under our name. A stub component with `TODO` cells would also sit
in the production bundle one route line away from being public. So the structure is
here, and the pages get built once the table is filled.

## Rules for filling this in

- Every competitor cell needs a source the reader can open: the competitor's own
  pricing or docs page, with the date you read it. No review-site summaries.
- Record prices in the currency the competitor publishes, with the plan name. Do not
  convert currencies.
- If a fact cannot be sourced, the row is cut. Do not write "limited" or "basic".
- Say what the competitor does better. A comparison that finds no advantage on the
  other side is not read as a comparison.
- The Vyostra AI column below is already verified against the repo; re-check it
  against `frontend/src/lib/pricingTiers.ts` on the day of publishing.

## Page structure (same for all three)

1. **H1:** `Vyostra AI vs <Competitor>: which fits a lead-driven business?`
2. **Opening answer, 40-60 words.** One sentence on what each product is for, one on
   who should pick which. Names both products in full.
3. **H2 `How do Vyostra AI and <Competitor> compare?`** — the table below.
4. **H2 `When is <Competitor> the better choice?`** — written first, honestly.
5. **H2 `When is Vyostra AI the better choice?`**
6. **H2 `What does each one cost?`** — both price lists, each linked to its source.
7. **H2 `Common questions`** — 4-6 questions via the `FaqList` component, with
   `FAQPage` schema from the same array (see `frontend/src/pages/Faq.tsx`).
8. Sources list with access dates.

## Comparison table

| Row | Vyostra AI (verified in repo, 2026-10-02) | Kommo | Spur | Wati |
|---|---|---|---|---|
| What it is, in one line | AI agent trained on your website that captures leads on chat, voice and WhatsApp into a built-in lead CRM | TODO: verify | TODO: verify | TODO: verify |
| Entry price | $49/month (Starter); ₹4,299/month in India | TODO: verify | TODO: verify | TODO: verify |
| Top published plan | $349/month (Agency) | TODO: verify | TODO: verify | TODO: verify |
| Free trial | 14 days, no credit card | TODO: verify | TODO: verify | TODO: verify |
| Website chat agent trained on your site | Yes, from a URL | TODO: verify | TODO: verify | TODO: verify |
| On-page voice agent | Yes, as an add-on enabled per account | TODO: verify | TODO: verify | TODO: verify |
| WhatsApp | Lead alerts and follow-up journeys; via Gupshup | TODO: verify | TODO: verify | TODO: verify |
| Built-in CRM | Yes, a lead queue with transcripts | TODO: verify | TODO: verify | TODO: verify |
| Meta lead ads intake | Yes | TODO: verify | TODO: verify | TODO: verify |
| Lead forms | Yes, embeddable | TODO: verify | TODO: verify | TODO: verify |
| External CRM sync | Zoho CRM | TODO: verify | TODO: verify | TODO: verify |
| Pay in INR by UPI | Yes | TODO: verify | TODO: verify | TODO: verify |

## Before publishing a page

- Build it as `frontend/src/pages/compare/<Name>.tsx` on `MarketingPageShell`.
- Add the route in `App.tsx` (eager) and `prerender-entry.tsx`, an entry in
  `STATIC_PAGES` (`frontend/src/lib/crawl-files.ts`), and `'/compare'` in
  `PRERENDERED_PREFIXES` (`deploy/cloudfront/viewer-request.js`). The tests in
  `crawl-files.test.ts` and `app-bundle-split.test.ts` fail on any of these missed.
- After merging, publish the CloudFront function with
  `scripts/deploy-cloudfront-function.sh`.
