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
