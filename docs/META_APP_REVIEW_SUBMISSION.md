# Meta App Review — submission text

Paste-ready copy for app `1620710049625709` ("Vyostra AI Platform"), use case
**Capture and manage ad leads with Marketing API**.

Record the screencast with `scripts/record-meta-screencast.sh` and upload the
**same file** to every permission block below.

---

## Submit exactly these six

| Permission | Justification text | API calls made |
|---|---|---|
| `leads_retrieval` | below | yes — `GET /{leadgen_id}?fields=field_data` |
| `pages_show_list` | below | yes — `GET /me/accounts` |
| `pages_manage_metadata` | below | yes — `POST /{page-id}/subscribed_apps` |
| `pages_read_engagement` | below | yes — Page identity during connect |
| `email` | complete in the draft | baseline |
| `public_profile` | complete in the draft | baseline |

Every one is genuinely requested by `META_OAUTH_SCOPES` and backed by a real call
made on 2026-08-15. One screencast covers all of them — upload the same file to each
block. Anything not on this list is covered in "Do NOT submit these" below.

## Before you submit — hard gates

Verified 2026-08-15 unless noted.

- [x] **At least one successful API call per requested permission, within the last
      30 days.** Meta checks this mechanically. Satisfied for all four Page
      permissions: Page "The Simplest Solution" (`353635678632363`) was connected
      and four test leads were retrieved with complete `field_data`. This is the
      gate `business_management` and Business Asset User Profile Access would fail.
- [x] App is **Published**
- [x] Business verification **complete** (Tech Provider, 2026-07-27)
- [x] Webhook: object `page`, field `leadgen` v26.0, callback
      `https://vyostra.com/api/webhooks/meta`, active — via
      `GET /{app-id}/subscriptions`
- [x] Deauthorize callback → returns 400 JSON on an unsigned POST, so it is live
- [x] Data deletion callback → returns 400 JSON on an unsigned POST, so it is live
- [x] Valid OAuth Redirect URI → `https://vyostra.com/api/integrations/meta/callback`
- [x] Privacy Policy and Terms render **without JavaScript** — both 200 with
      server-rendered text (603 and 364 words), plus title, description and
      canonical. Prerendered and deployed, not merely committed.
- [ ] **`pages_manage_ads` removed from login config `1581255013395833`** — the one
      remaining item, dashboard-only, and it invalidates any screencast recorded
      before the change.

---

## What the app does (opening line for every block)

> Vyostra AI Platform is a B2B SaaS CRM. Our customers are businesses that run
> their own Facebook/Instagram Lead Ads. The platform lets a customer connect
> their own Facebook Page and automatically receive their own leads into their own
> CRM dashboard, instead of downloading CSVs from Meta Business Suite by hand.
> We never access Pages, ad accounts, or leads belonging to anyone other than the
> authenticated customer who connected them.

---

## `leads_retrieval`

> We use `leads_retrieval` to read the field data of lead submissions from Lead Ads
> forms on Pages that our customer owns and has explicitly connected.
>
> Flow: the customer clicks "Connect with Facebook" in our dashboard and completes
> Facebook Login. We store a Page access token for the Page they select, and
> subscribe that Page to the `leadgen` webhook field. When someone submits one of
> that Page's Lead Ads forms, Meta delivers a `leadgen` webhook to
> `https://vyostra.com/api/webhooks/meta`. That payload contains only a
> `leadgen_id`, so we call `GET /{leadgen_id}?fields=field_data` with the Page
> access token to retrieve the submitted answers.
>
> Fields accessed: whatever the customer configured on their own lead form —
> typically full name, phone number, email address, and custom qualifying
> questions (for example property interest or budget range).
>
> Storage: written to Amazon DynamoDB in the `ap-south-1` region, partitioned by
> the customer's Page/bot id so records are isolated per customer.
>
> Access: visible only to the authenticated customer who connected that Page.
> Every dashboard route is protected by AWS Cognito JWT authentication. Vyostra
> staff do not browse customer lead data.
>
> Retention: for the duration of the customer's active subscription plus 90 days,
> or until a deletion request is received, whichever is sooner. Disconnecting the
> Meta integration stops all further retrieval immediately. Deletion can be
> requested at support@vyostra.com, and we honour Meta's data deletion callback.
> This is documented at https://vyostra.com/privacy-policy
>
> We do not sell, share, or transfer lead data to third parties.

## Do NOT submit these — and remove one from the login config

**`pages_manage_ads` — remove from Login for Business config `1581255013395833`.**
The code stopped requesting it in `9da0425`, but we send `config_id` and the
dashboard config overrides `META_OAUTH_SCOPES` entirely, so it still appears on the
live consent screen as "Create and manage ads for your Page". Three reasons it goes:
we never call an ads endpoint; the app's allowed-usage list does not contain it; and
every customer currently sees a lead-capture tool asking to create ads on their Page,
which costs connections long after review is done. **Removing it requires a new
screencast**, because the recording must match the permissions actually requested.

**`business_management` — do not submit.** Never requested and never called
(`grep` across `backend/src` returns nothing). It requires "performed required API
test calls", which Meta verifies mechanically, so submitting it fails the whole
submission on that gate alone.

**Business Asset User Profile Access — do not submit.** Same reason: not requested
anywhere, and it carries the same API-test-call requirement.

**`whatsapp_business_messaging` / `whatsapp_business_management` — separate
submission.** WhatsApp Embedded Signup is a different flow with its own config
(`1063430079829327`) and its own screencast. Both also require API test calls. Ship
Lead Ads first; a smaller submission that passes beats a larger one that is rejected.

## `pages_show_list`

> We use `pages_show_list` to display the list of Pages the customer administers,
> so they can choose which Page to connect. Immediately after Facebook Login we
> call `GET /me/accounts` and present the returned Page names for selection. Only
> the Page the customer picks is stored and used. We do not store or use the list
> of Pages they did not select.

## `pages_manage_metadata`

> We use `pages_manage_metadata` to subscribe the customer's selected Page to our
> app's `leadgen` webhook, via
> `POST /{page-id}/subscribed_apps` with `subscribed_fields=leadgen`.
>
> This is required for real-time lead delivery — without this subscription Meta
> never sends a `leadgen` event and the customer's leads never arrive. We use it
> only to add and remove this webhook subscription on the Page the customer
> connected. We do not modify any other Page settings, content, or metadata. When
> a customer disconnects, we remove the subscription.

## `pages_read_engagement`

> We use `pages_read_engagement` to read the basic Page identity (Page id and Page
> name) needed to obtain and use the Page access token for the connected Page, and
> to show the customer which Page is currently connected in our dashboard. We do
> not read posts, comments, messages, or engagement metrics.

---

## Reviewer test instructions

**Never put the reviewer account's password in this file.** This repository is
public, so a password committed here is a published credential for a live account
on production. An earlier version of this section told you to do exactly that.

The dedicated reviewer account exists (created 2026-08-15, seeded with a demo bot
and three demo leads so the CRM screens show real content). Its credentials live
outside the repo — paste them straight into Meta's "How can we test?" field, and
keep a copy in a password manager, not here.

Paste into the "How can we test?" / instructions field.

> Test credentials: <paste them into Meta's form directly — see the warning below>
>
> 1. Go to https://vyostra.com/login and sign in with the credentials above.
> 2. In the left sidebar, click **Meta Ads**.
> 3. Click **Connect with Facebook** and complete Facebook Login, granting the
>    requested permissions.
> 4. Select a Facebook Page that has a Lead Ads form.
> 5. The page will show the connected Page name and a "Connected" state. At this
>    point we have subscribed that Page to the `leadgen` webhook.
> 6. To generate a lead, open
>    https://developers.facebook.com/tools/lead-ads-testing , select the same Page
>    and form, and click **Create lead**.
> 7. Return to the **Meta Ads** screen and refresh. The new lead appears under
>    "Recent Meta Leads".
> 8. Click **Leads** in the sidebar to see the same lead in the CRM, with the
>    submitted name, phone, email and any custom form answers.
>
> The screencast attached to each permission shows this exact flow end to end,
> including the full consent screen.

---

## Notes on the screencast

`scripts/record-meta-screencast.sh` prints the shot list and records one unbroken
take. Two things reviewers reject for:

1. **The consent screen must be held ~3 seconds and every permission line legible.**
   Five permissions are requested now, so it is taller than it used to be.
2. **Do not stop before the outcome is visible.** The recording has to show the
   lead arriving in the CRM, not just the connection succeeding.

---

## Known weakness, in case a reviewer probes it

The data deletion callback records and acknowledges the request and notifies our
operations team, but performs no automated purge — deletion is completed manually
within 30 days, which is what `/data-deletion-status` tells the user. It does not
claim the data has already been deleted. Meta's signed request carries only an
app-scoped `user_id`, and Lead Ads `field_data` carries no such identifier, so
there is currently no key to correlate a deletion request to stored lead rows.
See the open item in `TODOS.md`. If a reviewer asks, the honest answer is that the
process is manual and completes within 30 days.
