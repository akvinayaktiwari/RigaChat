# Analytics — From "Traffic Lands" to Actually Optimized

Handoff for the work that remains after GA4 page-view tracking landed (2026-09-16).
The tag is live and verified in the production bundle. What is left is everything
that turns a visitor count into a funnel: conversion events, consent, and the
crawler traffic GA4 structurally cannot see.

Read this before adding a single `gtag` call. The three biggest mistakes here all
produce numbers that look **plausible and are wrong**, which is worse than no
analytics at all.

---

## Where things actually stand

Verified against the live site and GitHub on 2026-09-16, not assumed:

```
DONE
  GA4 property            Vyostra AI, stream 15791450192, G-WGYR4EDQ8G
  tag in production       confirmed in https://vyostra.com/assets/index-*.js
  page views on nav       fired per React Router navigation, not by GA4
  route exclusions        /dashboard /admin /l/ /widget-test /form-test /voice-test
  query strings stripped  page_location is origin+pathname, never href
  dev builds inert        import.meta.env.DEV short-circuits everything
  consent defaults        all three ad signals denied, analytics_storage granted
  repo variable           VITE_GA_MEASUREMENT_ID set (a variable, NOT a secret)
  CI + deploy.sh          var threaded through both, OUTSIDE the required list
  double-counting fix     GA4 "page changes based on browser history" turned off
  data retention          14 months

NOT DONE
  conversion events       zero. No signup, no contact, no checkout, no demo-chat
  key events in GA4       nothing marked, so "Generate leads" reports are empty
  consent banner          EEA visitors get analytics_storage granted by default
  Search Console          link + Library publish step both unconfirmed
  CloudFront access logs  off, so AI crawler traffic is invisible everywhere
  dashboard analytics     deliberately unmeasured; no PostHog, no 2nd property
  UTM discipline          no convention, so blog/campaign traffic is unattributed
```

---

## The three things that will silently corrupt the data

Every one of these has already been designed around once. Do not undo them.

**1. Never add a `gtag` snippet to `frontend/index.html`.** That file is the
prerender template — `frontend/scripts/prerender.mjs` injects into it, so a tag
there is baked into all 15 prerendered pages *and* `app-shell.html`, with no way
to exclude the signed-in app and no consent gate. Google's own setup panel tells
you to paste it there. Ignore it. All tag loading lives in
`frontend/src/lib/analytics.ts`.

**2. Never track `/dashboard` in this property.** One signed-in session generates
dozens of in-app page views. Mixed into a marketing property they swamp every
acquisition, bounce and conversion figure, and the damage is not reversible —
GA4 has no way to retroactively segment them out. `UNTRACKED_PREFIXES` in
`analytics.ts` is the guard; `analytics.test.ts` pins it, including the
segment-boundary cases (`/administration` must stay tracked).

**3. Never put a lead identifier, OAuth code or Meta redirect state into an
event parameter.** `trackPageView` builds `page_location` from
`window.location.origin + pathname` precisely so query strings never leave the
browser. `/l/:token` is excluded for the same reason. Sending PII to Google is a
term-of-service breach, and it cannot be deleted from a property afterwards.

---

## The order to do it in

### 1. Conversion events — the actual gap

GA4 currently answers "how many people came" and nothing else. The property was
set up with **Generate leads** as its primary objective and there is not one
event to populate it.

Add a typed `trackEvent(name, params)` to `frontend/src/lib/analytics.ts`
alongside the existing exports — same guards (`isAnalyticsEnabled()`,
`isTrackedPath()`), same no-`any` discipline, `GtagCommand` already has the
`['event', string, Record<string, unknown>]` shape.

The events worth having, in descending order of value:

| Event | Fires from | Why |
|---|---|---|
| `generate_lead` | contact form success, `src/services/api.ts` → `POST /api/contact` | the marketing site's actual conversion |
| `sign_up` | signup completion, `src/pages/SignupPage` | top of the product funnel |
| `demo_chat_opened` | `src/components/landing/DemoChat.tsx` | the landing page's core interaction; no idea today whether anyone uses it |
| `begin_checkout` | `src/lib/razorpay-checkout.ts` open path | where the Razorpay drop-off is |
| `purchase` | checkout success | needs `value` + `currency`; see the currency trap below |

Fire them on **confirmed success**, not on click. A click-fired `generate_lead`
counts every failed submission as a conversion, and the contact route has a
honeypot and a rate limit that reject silently.

Then mark them in GA4: **Admin → Events → Key events**. An event that is not
marked is invisible to every conversion report, and marking is not retroactive
for reports built before it — do it the same day you ship the events.

**The currency trap on `purchase`:** the property reports in USD, the site
advertises $49, and Razorpay charges INR for UPI plans. If you send a raw amount
with the wrong `currency`, GA4 converts it and the revenue figure is quietly
wrong by ~85x. Send the actual charged amount with its actual currency code, or
do not send `purchase` at all yet.

### 2. Consent banner — the real gap in the current build

`initAnalytics()` sets Consent Mode v2 defaults with all three ad signals denied
but `analytics_storage: 'granted'`. That is better than stock GA4 and it is
still not compliant for the EEA, where analytics cookies need prior consent.

Content targets India and UAE, so EEA traffic is incidental rather than the
business — this is a real risk, not an emergency. The fix:

- default `analytics_storage: 'denied'`, then `gtag('consent', 'update', ...)`
  on accept. The call site is already commented in `analytics.ts`.
- the banner belongs in the marketing layout only, never in the dashboard shell
- persist the choice in `localStorage` and re-apply it before `initAnalytics()`
  runs, or every page load re-prompts
- there is currently **no cookie banner component anywhere** in
  `frontend/src/components` — this is greenfield

Region-gating the banner to EEA visitors is defensible and avoids putting a
consent wall in front of the Indian traffic the content strategy is chasing.

### 3. Search Console — confirm both halves

Verification and linking may already be done; the **publish** step almost
certainly is not, and it is the one that makes people think the link failed.

- verify `vyostra.com` at search.google.com/search-console (Domain property via
  DNS TXT is the durable form; URL-prefix can verify instantly via the now-live
  GA tag)
- GA4 **Admin → Product links → Search Console links** → link to stream
  `Vyostra AI`
- **Reports → Library → Search Console collection → ⋮ → Publish.** Without this
  the data arrives and no report displays it.
- ~48h before anything appears, and Search Console does not backfill

This is the only source of query-level search data, which is the whole point for
the India/UAE content push. `Reports → Search Console → Queries` is the payoff.

### 4. CloudFront access logs — the AI-crawler blind spot

GPTBot, PerplexityBot and ClaudeBot **do not execute JavaScript**, so they will
never appear in GA4 no matter what is added to it. If the strategy is AI-engine
citation, GA4 cannot measure whether it is working.

CloudFront standard logging to S3 is the free fix and gives server-side truth
that ad blockers cannot eat either. The distribution is managed in
`deploy/cloudfront/` and by `scripts/deploy.sh`. Log delivery is a distribution
config change, so check whether `deploy.sh` would overwrite it before enabling
it by hand in the console.

Nothing parses these yet. A small Athena table or a scheduled script that counts
hits by user-agent is enough; do not build a pipeline.

### 5. Dashboard product analytics — separate tool, separate decision

`/dashboard` is excluded on purpose and should stay that way. When product usage
needs measuring, it is PostHog or a second GA4 property, and it is its own piece
of work. Do not solve it by deleting a line from `UNTRACKED_PREFIXES`.

---

## Constraints that apply to all of it

From `CLAUDE.md`, and they are not negotiable:

- TypeScript strict, **no `any`**. Typed inputs and outputs on every function.
- Functions under 40 lines, kebab-case filenames, camelCase functions.
- Routes → services → repositories. No layer skips. (Relevant if any of this
  grows a backend endpoint.)
- **`npm test` does not typecheck.** Only `npm run build` runs `tsc`. Run the
  build, not just the tests.
- **Commit in chunks.** One logical change per commit, source and its regression
  test in the same commit, staged by name — never `git add .`.
- **Pushing to `main` deploys to production.** `.github/workflows/ci.yml` runs
  the deploy on every push. Branch unless told otherwise.
- A new `VITE_*` var must go into `scripts/deploy.sh` *and*
  `.github/workflows/ci.yml`, and stay **out** of the required-vars loop at
  `deploy.sh:147` unless a missing value should genuinely abort a deploy.

## Files that matter

```
frontend/src/lib/analytics.ts              the whole tag; read the header comment first
frontend/src/lib/analytics.test.ts         pins the route exclusions
frontend/src/hooks/useAnalyticsPageViews.ts hook + null component
frontend/App.tsx:72                        mount point, above <Routes> on purpose
frontend/src/vite-env.d.ts                 VITE_GA_MEASUREMENT_ID, optional
scripts/deploy.sh:144,326                  manual-deploy path
.github/workflows/ci.yml:284               the path that actually deploys
```

## Verifying anything you ship

Do not trust the green check. The bundle is the truth:

```
curl -s https://vyostra.com/ | grep -oE '/assets/[A-Za-z0-9_.-]+\.js'
curl -s https://vyostra.com/assets/index-<hash>.js | grep -c 'G-WGYR4EDQ8G'
```

Then GA4 **Reports → Realtime** in an incognito window: navigate `/` →
`/features` → `/blog` and watch the paths arrive, then load `/dashboard` and
confirm it does **not**. An empty Realtime is an ad blocker far more often than
it is a bug.
