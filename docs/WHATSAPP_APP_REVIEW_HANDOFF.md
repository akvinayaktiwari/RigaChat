# WhatsApp Embedded Signup — App Review handoff prompt

Copy everything below the line and hand it to whoever is doing the setup (it is
written to be pasted into Claude Code in this repo, or read by a human directly).

---

## Task: get Advanced access for WhatsApp Embedded Signup on the Vyostra Meta app

You are picking up a Meta App Review submission that is **drafted but not
submitted**. Do not re-scope it, do not add permissions, and do not trust the
dashboard over the Graph API.

### The facts you are starting from (verified 2026-08-30 — re-verify, don't assume)

- Meta app: `1620710049625709` ("Vyostra AI Platform"), **Published**.
- Business Verification: **Verified**. Tech Provider access verification:
  **Verified**. Data Use Checkup: completed 2026-08-26. All three gates are
  already behind us.
- App Review of 2026-08-26 was **approved — for Lead Ads only**
  (`pages_show_list`, `pages_manage_metadata`, `pages_read_engagement`,
  `leads_retrieval`, `email`, `public_profile`). That approval does **not**
  cover WhatsApp. Anyone reading it as "Meta is done" will chase a phantom bug.
- Product runs two WhatsApp paths. Only **`meta_direct`** needs this review — on
  the Gupshup path Gupshup owns the WABA and no Meta app permission is needed.

### What to submit — exactly two permissions, nothing else

| Permission | Why |
|---|---|
| `whatsapp_business_management` | create/read templates, register the number, subscribe the webhook on the client's WABA |
| `whatsapp_business_messaging` | send and receive messages on the client's WABA |

**Do NOT add `business_management`.** Embedded Signup returns `waba_id`
directly, so the `me/businesses` walk never runs on the popup path. Adding it
only widens the review surface. (The old redirect flow does call
`me/businesses` — that is a separate, legacy path; see the config table below.)

Without Advanced access these permissions **do not appear in the consent screen
at all** for a client's WABA, and `whatsapp_business_management` against a WABA
we do not own returns error `(#200) You do not have permission`. Standard access
still covers Vyostra's own WABA fully — which is exactly what makes all
pre-approval testing possible.

### The two login configs — do not swap them

| Env var | Value | Sole consumer | Token type |
|---|---|---|---|
| `VITE_META_WHATSAPP_CONFIG_ID` (GitHub repo var, **build-time**) | `2504667890053340` | `FB.login` in `frontend/src/pages/WhatsApp.tsx:339` → **popup** | system-user, never expires |
| `META_WHATSAPP_CONFIG_ID` (backend Lambda env) | `1063430079829327` | `getOAuthUrl` in `backend/src/providers/meta-whatsapp-provider.ts:275` → **redirect** | user |

Pointing the backend var at the Embedded Signup config **breaks the redirect
flow**: a system-user token cannot call `me/businesses`, and it fails as "No Meta
business portfolio is visible to this account", which points nowhere near the
cause. The old config stays live deliberately. Delete it only when the redirect
path is retired.

The frontend var is build-time: changing it needs a CI rerun, and you verify it
by grepping the deployed bundle at `https://vyostra.com/assets/index-*.js` for
the id — never by trusting the repo variable.

### Work items, in order

1. **Drive the popup path end to end, once, before recording anything.**
   It has never been exercised. The 2026-08-30 test connection went through the
   *redirect* link — proven by `debug_token` reporting `type: USER` (Embedded
   Signup issues a business-integration system-user token) and by
   `businessAccountId` still equalling `wabaId` (the `business_id` fallback
   fired; only the redirect path never supplies one). Video A's entire subject is
   the popup, so a redirect-path recording is an automatic rejection.

   Verify any connection claim this way, not from the dashboard: scan the
   `clients` table for `metaDirectWhatsAppConnection`, then run the stored token
   through Graph `debug_token`.

2. **Create a Utility template on the `meta_direct` WABA.**
   Templates are WABA-scoped — the approved `lead_notification_1` on the Gupshup
   WABA does **not** transfer. This is the only item on an external approval
   clock, so start it first. Use `backend/scripts/create-whatsapp-templates.ts`
   (idempotent; `--dry-run` doubles as the status reader). It needs `META_WABA_ID`
   and a token carrying `whatsapp_business_management` — the per-client token in
   DynamoDB has that scope and decrypts with `aws kms decrypt`. An app access
   token (`app_id|app_secret`) **cannot** read templates; Meta answers `(#200)`.
   Expect Meta to reclassify UTILITY → MARKETING; that is a pricing change, not a
   rejection.

3. **Record two screencasts — one per permission.** Combining them into one video
   is the single most common rejection for this pair.
   - **Video A — `whatsapp_business_management`:** connect → Embedded Signup
     **popup** → asset selection → connected number shown in the dashboard →
     template created.
   - **Video B — `whatsapp_business_messaging`:** lead form submitted → owner's
     WhatsApp alert arrives → visitor replies on WhatsApp → the AI answers →
     the exchange appears in the CRM.
   `scripts/record-meta-screencast.sh` is the existing recorder used for the Lead
   Ads submission — reuse it. Video B cannot be filmed until step 2's template is
   approved.

4. **Complete the paperwork blocks** in the App Review draft: 2 allowed-usage
   agreements, 6 renewal certifications, and the Data handling section.

5. **Submit**, then report back with the submission id and the date.

### Hard gates to re-check before submitting

Each of these sank or nearly sank the Lead Ads submission:

- At least one **successful API call per requested permission in the last 30
  days** — Meta checks this mechanically. Make a real send and a real template
  call on the `meta_direct` WABA before submitting.
- Privacy Policy and Terms must render **without JavaScript** (they are
  prerendered — confirm the deployed pages, not the repo).
- Deauthorize and data-deletion callbacks live (they return 400 JSON on an
  unsigned POST).
- Valid OAuth redirect URI registered.
- No stray permission left in the login config — a config change invalidates any
  screencast recorded before it.

### Ground rules

- Verify against the Graph API and the deployed bundle, never the dashboard alone.
- Do not deploy anything as part of this task. If a code change turns out to be
  needed, raise it — pushing to `main` deploys to production.
- `docs/META_APP_REVIEW_SUBMISSION.md` holds the Lead Ads submission text and the
  gate checklist it passed; mirror its structure for the WhatsApp blocks.
