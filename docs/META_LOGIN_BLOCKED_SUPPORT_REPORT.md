# Facebook Login blocked app-wide — REGRESSION within 24 hours

**App ID:** 1620710049625709 (Vyostra AI Platform)
**App admin / only role holder:** 4512644655638994
**Business verification:** complete, Tech Provider (2026-07-27)
**App status:** Published (Live) since 2026-08-11

## Error

Every Facebook Login attempt, by the app admin, returns:

> Feature Unavailable — Facebook Login is currently unavailable for this app, since
> we are updating additional details for this app. Please try again later.

## This is a regression, not a configuration problem

**On 2026-08-12 Facebook Login WORKED on this app.** The WhatsApp Embedded Signup
flow completed successfully: `FB.login()` opened its popup and the JS SDK logged
`client_login_start` → `client_login_end` → `client_login_complete_heartbeat`.

**On 2026-08-13 the same flow, same app, same admin account, fails with the error
above.** Nothing was changed in our application code or our OAuth configuration
between those two points. The only actions taken in the App Dashboard in between
were those instructed by Meta Support (see "Prior ticket" below).

## Both login mechanisms fail, with three different configurations

| # | Mechanism | Configuration | Result |
|---|---|---|---|
| 1 | `FB.login()` (JS SDK) | config 1063430079829327 | Feature Unavailable (worked 08-12) |
| 2 | Redirect to `/dialog/oauth` | config 1581255013395833 | Feature Unavailable |
| 3 | Redirect to `/dialog/oauth` | config 1063430079829327 | Feature Unavailable |
| 4 | Redirect to `/dialog/oauth` | raw scope string, no config_id | Feature Unavailable |

The failure is therefore independent of the login mechanism, of the Login for
Business configuration, and of the requested permission set.

## The failure is post-authentication only

An **unauthenticated** request to the OAuth dialog behaves perfectly normally:

- the app ID is accepted
- the redirect URI `https://vyostra.com/api/integrations/meta/callback` is accepted
  (no "URL Blocked")
- all requested scopes are accepted
- Meta returns `302` to `login.php?...&is_business_login=1`

The error appears only **after** the user authenticates. This points at an
app-level state evaluated post-login rather than at any parameter we send.

## Everything on our side verified healthy at time of writing

Confirmed live via Graph API with an app access token, 2026-08-13:

- `GET /1620710049625709` returns the app normally — app is not disabled
- `GET /1620710049625709/subscriptions` returns the webhook as **active**:
  object `page`, field `leadgen` v26.0, callback
  `https://vyostra.com/api/webhooks/meta`
- `GET /1620710049625709/roles` returns 4512644655638994 as `administrators`
- App metadata: `app_type` 0, category `Business`, `restrictions` only `{"age":"13+"}`

Also verified in the App Dashboard:

- Privacy Policy and Terms of Service URLs set and publicly reachable
- App icon and category set
- Deauthorize callback and Data Deletion Request callback both configured
- Valid OAuth Redirect URIs contains the exact redirect URI above
- A test webhook payload sent from the App Dashboard was delivered to our endpoint,
  passed `X-Hub-Signature-256` verification, and was processed successfully

## Prior ticket, and why its resolution did not hold

A previous ticket was answered on 2026-08-12 by a support agent and **closed**. The
diagnosis given was that the `email` permission's access level was "None", and that
setting it to Standard Access would resolve the error.

We checked. In the App Dashboard, `email` shows status **"Ready for testing"**, not
"None". We followed the instruction regardless. **The error persists unchanged.**

That ticket was also closed before the regression described above was observed.

## What we need

1. Why is Facebook Login disabled for this app at the app level, when the app is
   published, business-verified, has no Required Actions we can act on, and whose
   API surface is otherwise fully functional?
2. What exactly are the "additional details" being updated, and what must we do to
   complete them? The error names nothing actionable.
3. Was any automated enforcement or review action applied to this app between
   2026-08-12 and 2026-08-13?

## Business impact

No user can connect a Facebook Page, so our Lead Ads integration is entirely
non-functional, and our WhatsApp onboarding — which was working on 2026-08-12 — has
now stopped working as well.

This also blocks App Review itself. App Review requires at least one successful API
call per requested permission, and requires a screencast of the end-to-end user
flow. Both are impossible while Facebook Login is disabled, so we cannot progress
the submission until this is resolved.

## We are blocked from completing App Review by this same issue

Our App Review submission currently stands at 4 of 8 items complete:

| Permission / feature | Status |
|---|---|
| `email` | complete |
| `leads_retrieval` | complete |
| `public_profile` | complete |
| `pages_show_list` | needs screencast |
| `pages_manage_metadata` | needs screencast |
| `business_management` | needs screencast |
| `whatsapp_business_messaging` | needs screencast + required API test calls |
| Business Asset User Profile Access | needs description + screencast |

Every outstanding item requires either a screencast showing the end-to-end user
experience, or successful API test calls. **The end-to-end user experience is
Facebook Login**, and API test calls require an access token obtained through it.

We therefore cannot complete App Review while Facebook Login is disabled, and we
cannot get Facebook Login re-enabled by completing App Review. We are asking for
this dependency to be broken from your side.

## Note for the reviewer

Please do not close this ticket with an instruction to change a permission access
level or an OAuth configuration. Four separate configurations have been tested and
all fail identically, including one that demonstrably worked yesterday. The variable
is app state, not request parameters.
