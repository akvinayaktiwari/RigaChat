# Analytics

GA4, marketing site only. Property measurement ID lives in the GitHub repo
variable `VITE_GA_MEASUREMENT_ID` and reaches the bundle at build time; unset
is a clean no-op, so analytics can never abort a deploy.

Signed-in app traffic is deliberately **not** measured. One person generates
dozens of dashboard views per session, and mixing that into a marketing
property makes every acquisition number meaningless. `isTrackedPath()` in
`frontend/src/lib/analytics.ts` is the list, and it also excludes `/l/`, and
the widget/form/voice test routes, which carry customer identifiers in the path.

## The one thing that must not be changed back

`initAnalytics()` pushes an `arguments` object onto `dataLayer`, from a
function expression. gtag.js executes a queue entry as a command **only** when
it is one — it tests `Object.prototype.toString` for `[object Arguments]`, or
an own `callee`. A plain array, which is all a rest parameter ever is, falls
into gtag's legacy `method.path` branch and is discarded in silence: no
config, no page views, no console error, and a GA4 property that reports
nothing while every other signal says the tag is live. That shipped once.

## What is measured

| Event | When | Notes |
| --- | --- | --- |
| `page_view` | every marketing route change | sent manually, not by enhanced measurement — this is a BrowserRouter SPA, so GA4's own page_view would miss client-side navigations |
| `blog_post_view` | a post page mounts | |
| `blog_read_progress` | 25 / 50 / 75 / 100 % scrolled | once per milestone per post |
| `blog_cta_click` | the demo modal opens from a post | `cta_action` says which CTA |
| `generate_lead` | the backend confirms a contact message | `form: 'contact'`. Fired on confirmed success, never on click: the route rejects a rate-limited submission silently, and answers a honeypot hit with the same success shape a person gets, so a click-fired event would count bots and failures as leads. It carries no name, email or message — PII cannot be removed from a GA4 property afterwards. |
| `sign_up` | the account is created | `method: 'email'`. After the await resolves, so a duplicate email or a password Cognito rejects is not counted. |
| `demo_chat_message` | the visitor sends a message in the landing-page demo | `message_index` says how deep the conversation got. The demo opens itself on mount, so a mount event would only repeat the homepage view. The message text is never sent: people type their phone number into demo chats. |

`page_location` is built from origin + path, never `href`: the query string on
this site carries OAuth codes, Meta redirect state and lead references that
have no business reaching Google.

Consent defaults deny `ad_storage`, `ad_user_data` and `ad_personalization` —
we run no Google Ads and set no advertising cookies. This is **not** a consent
banner. If one is ever added, it flips `analytics_storage`.

## Dimensions carried by every blog event

| Parameter | Example | Why |
| --- | --- | --- |
| `post_slug` | `whatsapp-chatbot-for-real-estate-india` | the row key |
| `post_title` | … | readable reports |
| `post_category` | `Lead Generation Playbook` | which cluster earns its keep |
| `post_tags` | `WhatsApp\|Real Estate\|India` | pipe-joined; GA4 parameters are scalars, so an array is unfilterable. Use a *contains* filter for one tag |
| `post_published_at` | `2026-09-16` | |
| `post_age_days` | `1` | separates "new post spike" from durable search traffic |
| `reading_minutes` | `9` | read depth means nothing without length |
| `percent` | `50` | `blog_read_progress` only |
| `cta_action` | `open_demo` | `blog_cta_click` only |

Page views also carry `content_group` — `Home`, `Blog`, `Features`, `Company`,
`Legal`, `Account`, `Other` — derived from the path in `contentGroupFor()`.
Deriving it in code rather than as a regex in the GA UI is the point: a UI
regex stops matching the day a route is renamed, and says nothing when it does.

## Required GA4 setup (manual, once — nothing works without it)

A custom parameter that is not registered as a custom dimension is **collected
but unreportable**: it will not appear in any report or exploration, and GA4
does not backfill it for the period before registration. Register these in
**Admin → Data display → Custom definitions**, scope *Event*:

- `post_slug`, `post_title`, `post_category`, `post_tags`, `post_published_at`,
  `cta_action` — custom **dimensions**
- `post_age_days`, `reading_minutes`, `percent`, `message_index` — custom **metrics**

Content grouping needs nothing: `content_group` is a GA4 built-in.

The copy-paste sheet for that screen is `GA4_CUSTOM_DEFINITIONS.md`.

GA4 allows 50 event-scoped custom dimensions and 50 custom metrics per
property. This uses 6 and 4.

**Mark `generate_lead` and `sign_up` as key events** in **Admin → Events → Key events**, the
same day it ships. An event that is not marked is invisible to every conversion
report, and marking is not retroactive for reports built before it. The property
was created with *Generate leads* as its objective, so until this is marked
those reports stay empty.

## AI crawlers, which GA4 structurally cannot see

GPTBot, OAI-SearchBot, PerplexityBot, ClaudeBot and Googlebot do not execute
JavaScript, so they never fire a tag and never appear in GA4 — no matter what
is added to it. If the content strategy is AI-engine citation, GA4 cannot tell
you whether it is working.

CloudFront standard logging (v2) is the server-side record:

| Piece | Value |
| --- | --- |
| Distribution | `E2ZWB77M7V8J9X` (vyostra.com, www.vyostra.com) |
| Delivery source | `vyostra-cf-access-logs` (us-east-1 — CloudFront is global) |
| Destination | `s3://vyostra-cf-logs` (ap-south-1, private, 90-day expiry) |
| Fields | date, time, c-ip, cs-method, cs(Host), cs-uri-stem, sc-status, cs(User-Agent), cs(Referer), x-edge-result-type |

Read it with `./scripts/ai-crawler-hits.sh` — hits per crawler, and which blog
URLs they fetched. Logs arrive in batches, so the current hour is always
incomplete and an empty result means nothing has been delivered yet, which is
not the same as no crawler having come.

Nothing parses these into a dashboard on purpose. If that is ever wanted, an
Athena table over the bucket is the next step, not a pipeline.

The delivery is configured through the `logs` delivery API, not the
distribution's own `Logging` block, so `get-distribution-config` still reports
`Logging.Enabled: false`. That is expected and not a sign it is off. No deploy
script calls `update-distribution`, so deploying cannot switch it off.

## Reading the blog matrix

Once the dimensions are registered, the report that answers "what should I
write next" is an exploration with `post_category` (or `post_tags`) as rows and
these as columns:

- `blog_post_view` count — did it get read at all
- `blog_read_progress` at `percent = 100` divided by `blog_post_view` —
  completion rate. Low with high views means the headline outruns the body.
- `blog_cta_click` divided by `blog_post_view` — intent. A cluster with modest
  traffic and high CTA rate is worth more than a popular one with none.
- `post_age_days` — a post still earning views at 90+ days is search traffic;
  one that spiked and died was a launch, not an asset.

## Verifying a change

Realtime, not the standard reports: those lag 24–48 hours, which has already
been mistaken for a broken tag. **Admin → DebugView** with the GA Debugger
extension shows each event and its parameters as they arrive, which is the only
way to confirm a *parameter* is landing rather than just the event.
