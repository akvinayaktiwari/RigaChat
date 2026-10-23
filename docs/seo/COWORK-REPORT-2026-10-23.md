# Cowork report on COWORK-HANDOFF-2026-10-13.md

Checked 2026-10-23 by Cowork. Results below in the handoff's requested shape. Tasks marked BLOCKED need the owner (a login or an answer).

```
Task 1: verified=y (sc-domain:vyostra.com, owner; verified 2026-10-05)
        sitemap=https://vyostra.com/sitemap.xml · Success · last read 2026-10-11 · 53 discovered pages
        indexed=
          / ................... on Google (last crawled 2026-10-11)
          /pricing/ ........... on Google (2026-10-07)
          /features/chatbot/ .. on Google (2026-10-06)
          /features/whatsapp/ . NOT indexed: "Discovered - currently not indexed" → indexing requested 2026-10-13
          /features/crm/ ...... on Google (2026-09-22)
          /blog/ .............. on Google (2026-10-06)
          /docs/ .............. on Google (2026-10-13)
          /tools/ ............. on Google (2026-10-06)
        Rich results on all indexed pages: PASS (Breadcrumbs)
Task 2: BLOCKED — owner must sign in to Bing Webmaster Tools (bing.com/webmasters) with the Google account that owns Search Console, then "Import from Google Search Console"
Task 3: key file status=200, body exactly "ef98956b6ada147b5c95a404f0c8509c"; ci step (run #476, deploy-frontend, "Submit changed URLs to IndexNow")="[indexnow] 8 URL(s) for vyostra.com / accepted (202)"
Task 4: BLOCKED — owner logins needed. In progress: SaaSHub (account created, email verification pending), AlternativeTo (sign-in error "account_not_linked"; owner to sign up with email+password). Not started: Google Business Profile, G2, Capterra, Product Hunt, Zoho Marketplace, YouTube
Task 5: BLOCKED — awaiting owner choice: rewrite both repo descriptions to the canonical line, or make the interview repo private
Task 6: BLOCKED — awaiting owner OK to create the GA4 custom metric (message_index, Event scope, Standard)
Task 7: Rich Results Test, 2026-10-23
  https://vyostra.com/ — 2 valid items (Organization, Software Apps), non-critical only:
    Organization: Missing field "postalCode" (optional); Missing field "streetAddress" (optional)
    Software Apps: Missing field "aggregateRating" (optional); Invalid object type for field "priceSpecification" (optional) ×3
  https://vyostra.com/blog/what-is-a-crm-chatbot/ — 3 valid items (Articles, Breadcrumbs, Organization), non-critical only:
    Articles (BlogPosting): Invalid datetime value for "datePublished" (optional); Datetime property "datePublished" is missing a timezone (optional); Invalid datetime value for "dateModified" (optional); Datetime property "dateModified" is missing a timezone (optional)   [values are "2026-10-05"]
    Organization: Missing field "postalCode" (optional); Missing field "streetAddress" (optional)
  No errors.
Task 8: BLOCKED — owner answers needed (Priya S.; "Real Estate Developer, Bengaluru")
Task 9: not started (Cowork can research; owner to confirm)
```

Notes for Claude Code:
- Task 7 fixes that are safe: emit datePublished/dateModified as full ISO 8601 with timezone (e.g. 2026-10-05T00:00:00+05:30); SoftwareApplication offers on `/` each carry `priceSpecification: {"@type":"UnitPriceSpecification", unitCode:"MON", referenceQuantity…}`. That is valid schema.org, but Google's Software App validator reports "Invalid object type for field priceSpecification" ×3 (optional). Each Offer already has `price` + `priceCurrency`, which is all Google needs, so the clean fix is to drop `priceSpecification` from these three Offers (keep the monthly wording in each Offer's `description`, e.g. "$49 per month"). Add a test that the homepage SoftwareApplication offers have no priceSpecification. Do NOT add aggregateRating (no real reviews yet). Street address/postal code: only if the owner wants a public address; otherwise leave the warning.

Done by Claude Code, 2026-10-23 (branch `fix/rich-results-warnings`, commit 3eea0d6):
- datePublished/dateModified on posts and docs pages are now full ISO 8601 at midnight IST (`2026-10-05T00:00:00+05:30`).
- The three homepage Offers no longer carry `priceSpecification`; each description ends "$N per month." A test fails if `priceSpecification` comes back.
- Not done, on purpose: `aggregateRating` (no real reviews) and the street address (owner's call).
- Re-run the Rich Results Test on the same two URLs after deploy to confirm the warnings are gone.
