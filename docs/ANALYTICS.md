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
- `post_age_days`, `reading_minutes`, `percent` — custom **metrics**

Content grouping needs nothing: `content_group` is a GA4 built-in.

GA4 allows 50 event-scoped custom dimensions and 50 custom metrics per
property. This uses 6 and 3.

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
