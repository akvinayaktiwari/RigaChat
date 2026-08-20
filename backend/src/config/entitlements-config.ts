export const TRIAL = {
  durationDays: 14,
  graceDays: 3, // post-trial grace before degrade
  agents: 1,
  leads: 25,
  chat: { conversations: 50 },
  // Same ceiling as the Starter plan -- not specified by product for the
  // trial/free tier, flagged rather than left unset. Also reused for the
  // past_due/suspended/trial_expired degraded state below, matching how
  // that state already reuses TRIAL's leads/agents caps.
  kbFileSize: { maxMB: 5 },
} as const

// null = unlimited
export const PLANS = {
  // maxMB not specified by product for 'free' -- mirrors TRIAL.kbFileSize
  // above (Starter's ceiling), flagged rather than assumed silently.
  free: { agents: 1, leads: 25, chat: { conversations: 50 }, kbFileSize: { maxMB: 5 } },
  starter: { agents: 1, leads: 50, chat: { conversations: 500 }, kbFileSize: { maxMB: 5 } },
  growth: { agents: 3, leads: null, chat: { conversations: 2000 }, kbFileSize: { maxMB: 15 } },
  agency: { agents: null, leads: null, chat: { conversations: null }, kbFileSize: { maxMB: 100 } },
} as const

export const FEATURES = {
  voice: { subscribable: true, defaultLimits: { minutes: 300 } },
} as const

export const POST_TRIAL_BEHAVIOR = 'grace_then_degrade' as const
export const LEAD_CAP_TYPE = 'stock' as const // cumulative, not per-period

// Flat abuse guard, not plan-dependent — same ceiling for every plan.
// isInternal accounts bypass this too (checked at the call site), same as
// every other cap.
export const MESSAGE_CEILING_PER_CONVERSATION = 200

// Cheap pre-filter, not the real ceiling — chosen well below
// MESSAGE_CEILING_PER_CONVERSATION so it never itself becomes a
// UX-visible limit. Below this many existing messages, skip the
// getPublicConfig()/getByAccountId() lookups entirely; almost no
// conversation ever needs the ceiling check at all.
export const CEILING_CHECK_THRESHOLD = 20

// Cost-abuse guard on resyncBot() (recrawl + re-embed), not a plan
// entitlement — same cooldown for every plan, isInternal accounts bypass
// it (checked at the call site). 10 minutes; flag if you disagree.
export const RESYNC_COOLDOWN_SECONDS = 600

// Abuse guard on POST /api/auth/quick-signup, keyed by requester IP via the
// same setNX-lock shape as RESYNC_COOLDOWN_SECONDS above (RedisProvider has
// no counter primitive, only setNX) — so this is "1 attempt per window," not
// a true N-attempts/window counter. Flag if a counter is actually wanted.
export const QUICK_SIGNUP_RATE_LIMIT_SECONDS = 60

// Spam guard on POST /api/contact (public, unauthenticated, and it triggers an
// outbound email — so it is worth rate-limiting even at landing-page volume).
// Same setNX one-attempt-per-window shape and same ip+email keying rationale
// as QUICK_SIGNUP_RATE_LIMIT_SECONDS above. 60s: long enough to stop a script
// hammering the endpoint, short enough that a person fixing a typo in their
// own message and resubmitting is not blocked.
export const CONTACT_RATE_LIMIT_SECONDS = 60

// ---------------------------------------------------------------------------
// Public chat abuse limits
// ---------------------------------------------------------------------------
//
// /api/chat is unauthenticated by design -- the widget serves anonymous
// visitors on a client's own website, so there is no session to require. The
// gap that leaves is not theoretical: botIds are public (GET
// /api/bots/:id/config needs no auth), and while
// MESSAGE_CEILING_PER_CONVERSATION bounds spend WITHIN one conversation,
// nothing bounded the NUMBER of conversations. A script could loop
// start -> N messages -> start and burn a client's OpenAI quota while reading
// their whole knowledge base back.
//
// CORS does not help here. Widget routes are origin '*' because they are
// embedded on arbitrary customer domains, and CORS is a browser courtesy
// anyway -- it is not sent or honoured by a script.
//
// Chosen to be invisible to humans and fatal to scripts. A real visitor opens
// one conversation and sends a handful of messages; these ceilings are an
// order of magnitude above that, so a shared office NAT stays comfortable
// while a scripted loop hits the wall in seconds.
export const CHAT_START_RATE_LIMIT_MAX = 10
export const CHAT_START_RATE_LIMIT_SECONDS = 300

export const CHAT_MESSAGE_RATE_LIMIT_MAX = 60
export const CHAT_MESSAGE_RATE_LIMIT_SECONDS = 60

