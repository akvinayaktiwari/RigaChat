# What qdnco.com does that vyostra.com should borrow

**Audited:** 2026-10-13. **Subject:** the `QDnCo` repository (`~/Desktop/QDnCo`), its built `site/` output (121 sitemap URLs, 46 answer pages), read-only.
**Companion:** `QDNCO-SEO-AEO-AUDIT.md` in the repo root audits QDnCo's own weaknesses (2026-09-18); several of those have since been fixed. This file goes the other way: what to bring here.

**Method and limits.** Static reading of committed source and built HTML. No live crawl, no Search Console, no CrUX. QDnCo's rankings are as the owner reports them and were not verified. QDnCo sells to a narrow, low-competition niche (Bengaluru real estate marketing); "AI chatbot" and "WhatsApp CRM" are far harder queries, so the same tactics should be expected to move more slowly here.

---

## What QDnCo has that Vyostra does not

| # | QDnCo | Vyostra today | Take-away |
|---|---|---|---|
| 1 | **Answer hub.** 46 pages at `/answers/`, one real question per URL. Sentence one answers it; each page has a "Last updated" line, a "Related questions" block, and `Article` + `BreadcrumbList` schema. | One `/faq/` page and 22 posts. | An `/answers/` section, one question per URL, questions chosen from OpenSEO data, not invented. Probably the largest structural gap. |
| 2 | **Original data pages.** 6 under `/data/`. Every figure is labelled Method, Sample, Limits and source status ("owner-reported; reconciliation pending"). | None. | Publish aggregate, anonymised platform data in the same labelled format, **once real volume exists**. Never invent figures (see `homepage-claims-must-be-checkable`). |
| 3 | **Entity graph.** `sameAs` lists 11 profiles including the Google Knowledge Graph id, YouTube, Clutch, GoodFirms, DesignRush, Trustpilot and Sortlist. Org and Person nodes share stable `@id`s; Person carries `knowsAbout`. | LinkedIn and X (`frontend/src/lib/social-profiles.ts`). | Add profiles as each is claimed and confirmed: G2, Capterra, Product Hunt, AlternativeTo, YouTube, Google Business Profile. A wrong `sameAs` points the entity graph at someone else's company, so never add an unclaimed one. |
| 4 | **IndexNow.** `submit-indexnow.py` pushes the sitemap to Bing, with a comment explaining that ChatGPT Search and Copilot lean on Bing's index. | Was absent. `GEO-ANALYSIS-2026-10-02.md` scored Bing Copilot 50 for this reason. | **Built on branch `chore/indexnow`** (see below). |
| 5 | **`llms-full.txt`**, 133 KB: the whole corpus in one file. `llms.txt` carries an identity block (founder, contact) and published pricing; both are generated from the content modules. | `llms.txt` only, generated from the page list. | Generate an `llms-full.txt` from the blog, docs and feature content; add a short identity and pricing block to `llms.txt`. |
| 6 | **Category-level comparison pages.** 6 under `/compare/` ("in-house vs agency", "buying leads vs generating them"). They need no competitor facts. | Blocked on owner task 7: every competitor cell is `TODO: verify`. | Write comparisons that need no competitor data: chatbot vs live chat, WhatsApp Business app vs API, form vs chatbot. Unblocks status-file item 18 without waiting. |
| 7 | **Glossary** with `DefinedTerm` schema. | None. | A `/glossary/` of 20 to 30 terms (CRM chatbot, 24-hour session window, lead qualification). Cheap; feeds definition-style queries. |
| 8 | **Honest-limits sections.** "What is deliberately not in the definition", "The honest version of that comparison". | Present on integration and industry pages and in a few posts. | Make a "Limits" section a required field in the blog template with a registry test, the way `market` already is. |
| 9 | **Area pages.** 7 programmatic local pages. | One industry page. | Only with real copy per industry (status-file item 12). Do not generate these. |

## Where Vyostra is already ahead

- Full prerender, mobile LCP about 1.7 s, split bundle. QDnCo's homepage was Babel-in-the-browser as of the September audit.
- Guard tests for schema, claims, titles, sitemap and hydration. QDnCo has one test file.
- Six free tools with a hub and `WebApplication` schema. QDnCo has one calculator.
- One source of truth per list (`free-tools.ts`, the blog registry, `crawl-files.ts`). QDnCo's `sync-faq-schema.mjs` solves the same drift problem more narrowly.

## Do not copy

- **`.html` URLs.** QDnCo canonicals are `/answers/x.html`. The trailing-slash form here is better.
- **Expecting FAQ rich results.** Google restricted them in 2023. FAQ schema is kept for machine parsing only; that is already the stance in `AEO-GEO-STATUS.md`.
- **Hand-kept pricing copy.** QDnCo's `why-550-per-qualified-lead` URL now answers "how is pricing calculated" because the per-lead model was retired, and a URL slug is still carrying the old number. Prices here come from constants; keep it that way.
- **A personal Gmail in schema.** Use a domain address.

---

## What is done and what is not

| Item | State |
|---|---|
| IndexNow (item 4) | Built on branch `chore/indexnow`, **not merged, not deployed**. Merging to `main` deploys. |
| Everything else above | Not started. Owner-side prerequisites are in `COWORK-HANDOFF-2026-10-13.md`. |

### IndexNow: how it works

- Key file `frontend/public/ef98956b6ada147b5c95a404f0c8509c.txt` ships at the site root. IndexNow verifies ownership by fetching it.
- `frontend/scripts/submit-indexnow.mjs` reads the built `dist/sitemap.xml` and posts URLs whose `lastmod` is within the last 7 days (`--all` for every URL, `--dry-run` to print). It discovers the key from `dist/`, so the key is never a constant that can drift from the file.
- It refuses a `localhost` origin, so a build without `VITE_COGNITO_REDIRECT_URI` can never submit junk.
- CI runs it as the last step of `deploy-frontend`, with `continue-on-error: true`. A failed push never fails a deploy.
- Google does not take part in IndexNow. Google discovery still needs Search Console (owner task 1).

### Suggested order

| Priority | Item | Effort |
|---|---|---|
| 0 | Verify Search Console and Bing Webmaster (owner tasks 1, 2) | Owner, 30 min |
| 1 | Merge IndexNow, confirm the key file is live | Small |
| 2 | `llms-full.txt`; identity and pricing block in `llms.txt` | Small |
| 3 | `sameAs` expansion as profiles are claimed | Owner, then small |
| 4 | Category-level comparison pages | Medium |
| 5 | `/answers/` hub, 10 to 15 questions from keyword data | Medium |
| 6 | Glossary with `DefinedTerm` | Medium |
| 7 | "Limits" as a required template field, with a test | Small |
| 8 | Data pages | Blocked on real aggregate volume |
