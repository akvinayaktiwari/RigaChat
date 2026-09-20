# GA4 custom definitions — setup checklist

Copy-paste sheet for **GA4 → Admin → Data display → Custom definitions**.

Do this before the blog gets traffic. A custom parameter that is not registered
here is collected but **unreportable** — it appears in no report and no
exploration — and GA4 does **not** backfill it for the period before you
register it. Registering ahead of the data is correct; the reverse loses data.

The `Event parameter` values must match the code exactly (lowercase,
underscores). See `frontend/src/hooks/useBlogPostAnalytics.ts`. The
`Dimension name` is only the label shown in reports — change it freely.

If the **Event parameter** dropdown does not list a name, it is because GA only
offers parameters it has seen in roughly the last 48 hours. Type the name into
the field and take the manual entry GA offers.

Ignore the amber "high number of unique values" warning. It is about unbounded
parameters such as timestamps and user IDs; every value below is bounded by how
many posts exist.

---

## Custom dimensions — tab "Custom dimensions", Scope: **Event**

```
Dimension name:   Post slug
Event parameter:  post_slug
Description:      URL segment of the blog post - the row key for per-post reporting
```

```
Dimension name:   Post title
Event parameter:  post_title
Description:      Readable post title, for reports you do not want to read as slugs
```

```
Dimension name:   Post category
Event parameter:  post_category
Description:      The post cluster, e.g. Lead Generation Playbook
```

```
Dimension name:   Post tags
Event parameter:  post_tags
Description:      Pipe-separated tags. Filter with contains, not exactly matches
```

```
Dimension name:   Post published date
Event parameter:  post_published_at
Description:      ISO date the post went live
```

```
Dimension name:   CTA action
Event parameter:  cta_action
Description:      Which CTA was clicked on a post, e.g. open_demo
```

## Custom metrics — tab "Custom metrics", Scope: **Event**

Unit of measurement is **Standard** for all four. `reading_minutes` is
deliberately not "Minutes": that unit makes GA format it as a duration, which
reads oddly for an editorial estimate you mostly want to average.

```
Metric name:      Post age days
Event parameter:  post_age_days
Description:      Whole days between publication and the event
Unit:             Standard
```

```
Metric name:      Reading minutes
Event parameter:  reading_minutes
Description:      Estimated read time declared in the post metadata
Unit:             Standard
```

```
Metric name:      Read percent
Event parameter:  percent
Description:      Scroll depth milestone reached: 25, 50, 75 or 100
Unit:             Standard
```

```
Metric name:      Demo chat message index
Event parameter:  message_index
Description:      How many messages into the landing-page demo chat this event is. 1 is the visitor's first message.
Unit:             Standard
```

A parameter GA4 has never received is not offered in the dropdown — type the
name in. Registering it before the first event is the right order, since GA4
does not backfill a dimension or metric for the period before it existed.

## Just the parameter names

```
post_slug
post_title
post_category
post_tags
post_published_at
cta_action
post_age_days
reading_minutes
percent
message_index
```

## Quotas

50 event-scoped custom dimensions and 50 custom metrics per property. This uses
6 and 4. `content_group` needs no registration — it is a GA4 built-in.

## Verifying

**Admin → DebugView**, with the GA Debugger extension on. It shows each event
and its parameters as they arrive, and it is the only way to confirm a
*parameter* is landing rather than just the event. The standard reports lag
24–48 hours, which has already been mistaken here for a dead tag.

Then see `ANALYTICS.md` for the report that turns these into "what should I
write next".
