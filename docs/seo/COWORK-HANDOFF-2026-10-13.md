# Handoff to Cowork: owner-side SEO tasks for vyostra.com

**Written:** 2026-10-13. **Context file:** `docs/seo/QDNCO-LEARNINGS.md` (why these tasks exist). **Status file:** `docs/seo/AEO-GEO-STATUS.md` (the owner's living done/todo list).

## What this is

Claude Code (in the repo) has done everything it can do from the codebase. What is left needs a person with a browser, DNS access and logins. This file is self-contained: do the tasks, then report back what each one produced, so the code side can finish.

Site: **https://vyostra.com**. Company: Vyostra AI, an AI chatbot, WhatsApp and CRM platform for lead capture. Founders: see `/about-us/`. Company LinkedIn: `linkedin.com/company/vyostra-ai`. X: `@vyostra_ai`.

## Ground rules

1. **Never paste or return a credential, API key, token or DNS secret** in a report. Say "done" and where it is stored.
2. **Do not create a profile under a name that is not ours**, and do not claim an existing profile for a similarly named company. If it is ambiguous, stop and ask.
3. **Do not invent facts** for any listing: no customer counts, ratings, awards or review quotes. Copy descriptions from `/about-us/` and the homepage "What is Vyostra AI?" block.
4. **Claude Code stays out of the merge button.** Merging to `main` deploys to production. The IndexNow branch is for the owner to merge.
5. Use the same description everywhere (below), so the entity reads consistently.

Canonical one-line description: *Vyostra AI is an AI chatbot and CRM that answers website and WhatsApp enquiries, qualifies leads and puts them in one inbox.* Check it against the live homepage before using it.

---

## Tasks, in order

### 1. Verify vyostra.com in Google Search Console (blocks almost everything)

- Add a **Domain property** for `vyostra.com`; verify with the DNS TXT record at the domain's DNS host.
- Submit `https://vyostra.com/sitemap.xml`.
- Use URL Inspection → Request indexing for: `/`, `/pricing/`, `/features/chatbot/`, `/features/whatsapp/`, `/features/crm/`, `/blog/`, `/docs/`, `/tools/`.

**Report back:** property verified yes/no; sitemap status and "Discovered URLs" count; and, for each requested URL, whether it said "URL is on Google" or "not indexed" with the reason shown.

Why it matters: a web search for the brand returned the GitHub repos, not the site. Until the site is verified there is no index data at all.

### 2. Import the property into Bing Webmaster Tools

- Sign in, **Import from Google Search Console** (fastest once task 1 is done).
- Submit the sitemap. Under IndexNow, confirm Bing shows the key `ef98956b6ada147b5c95a404f0c8509c` as recognised once the code is merged and deployed.

**Report back:** verified yes/no; sitemap URL count Bing shows.

### 3. After the owner merges `chore/indexnow`: confirm the key file is live

Run, replacing nothing:

```
curl -s -o /dev/null -w '%{http_code}\n' https://vyostra.com/ef98956b6ada147b5c95a404f0c8509c.txt
curl -s https://vyostra.com/ef98956b6ada147b5c95a404f0c8509c.txt
```

Expected: `200` and a body that is exactly `ef98956b6ada147b5c95a404f0c8509c`. Anything else (404, an HTML page) means the file did not deploy; report the status and the first 200 characters of the body.

Then in the GitHub Actions run for that merge, open the step **Submit changed URLs to IndexNow** and report whether it printed `accepted (200)` or `accepted (202)`. Either is success; 202 is normal on the first run.

### 4. Claim directory and entity profiles

For each, create or claim the listing, use the canonical description, link to `https://vyostra.com`, and add the company logo from `frontend/public/logo.png`.

| Profile | Why |
|---|---|
| Google Business Profile | Biggest single entity and local signal; yields a Knowledge Graph id |
| G2 | First real third-party referring domain; AI engines cite it |
| Capterra | Same |
| Product Hunt | Same |
| AlternativeTo | Same |
| Zoho Marketplace | Only if the Zoho integration is listable; read their requirements first and stop if it needs a review we have not had |
| YouTube channel | Strongest measured correlate of AI visibility; needs a walkthrough video later |

**Report back, as a table:** profile name, the exact public URL, claimed/created, and anything the site asked for that you could not provide. Claude Code will add each confirmed URL to `frontend/src/lib/social-profiles.ts`, which feeds both the footer and the `Organization` `sameAs`.

### 5. Fix what ranks first for the brand

- The two public GitHub repos rank for "vyostra". Their descriptions say "solo founder" and "for Indian SMBs", which contradicts the site. Either rewrite both descriptions to the canonical line, or make the interview repo private.
- Do not delete either repo.

**Report back:** each repo's name, and which of the two actions you took.

### 6. Register `message_index` in GA4

- Admin → Custom definitions → Create custom metric. Event parameter `message_index`, scope Event, unit Standard.
- It is already collected, but cannot be reported until registered.

**Report back:** done yes/no, and the metric name you used.

### 7. Run the Rich Results Test on two pages

- Test `https://vyostra.com/` and one post, e.g. `https://vyostra.com/blog/what-is-a-crm-chatbot/`.
- Report every error and warning verbatim, with which schema type it concerns. Do not fix anything.

### 8. Confirm two testimonials are real and approved

- The homepage "Priya S." testimonial says leads "from the AI agent" sync to Zoho. Chat leads do not sync to Zoho (only form and Meta lead ad leads do), so the sentence is inaccurate.
- The "Real Estate Developer, Bengaluru" testimonial.

For each: is the person real, did they approve the wording, and for Priya S., how do leads actually reach her Zoho? **Report back** the answers only. Do not edit the site; Claude Code rewords with her approval or removes the sentence.

### 9. Verify competitor facts (unblocks comparison pages)

The draft at `docs/seo/drafts/compare-pages.md` has every competitor cell marked `TODO: verify`. For each cell, read the competitor's own pricing and feature pages and record: the fact, the URL it came from, and the date you read it. If a fact cannot be found on the competitor's own site, say "not stated" rather than guessing.

---

## What to send back

One message, in this shape, so Claude Code can act on it directly:

```
Task 1: verified=<y/n>, sitemap=<status>, indexed=<list of urls: on Google / not indexed (reason)>
Task 2: verified=<y/n>, urls=<n>
Task 3: key file status=<code>, ci step=<accepted 200/202 | failed: message>
Task 4: | profile | url | claimed/created | blockers |
Task 5: <repo>: <action>
Task 6: done=<y/n>
Task 7: <verbatim warnings, or "none">
Task 8: <answers>
Task 9: <facts, urls, dates>
```

Anything blocked, say so by number and why. Do not skip a task silently.

## What Claude Code will do with it

| Your result | Claude Code's follow-up |
|---|---|
| Task 4 URLs | Add to `social-profiles.ts`; `sameAs` and the footer update together, tests keep them in step |
| Task 1 data | Striking-distance pages and the weekly scoreboard (status-file items 23, 24) |
| Task 7 findings | Schema fixes |
| Task 8 answers | Reword or remove the Zoho sentence |
| Task 9 facts | Publish the comparison pages (item 18) |
