export const TRIAL = {
  durationDays: 14,
  graceDays: 3, // post-trial grace before degrade
  agents: 1,
  leads: 25,
  chat: { conversations: 50 },
} as const

// null = unlimited
export const PLANS = {
  free: { agents: 1, leads: 25, chat: { conversations: 50 } },
  starter: { agents: 1, leads: 50, chat: { conversations: 500 } },
  growth: { agents: 3, leads: null, chat: { conversations: 2000 } },
  agency: { agents: null, leads: null, chat: { conversations: null } },
} as const

export const FEATURES = {
  voice: { subscribable: true, defaultLimits: { minutes: 300 } },
} as const

export const POST_TRIAL_BEHAVIOR = 'grace_then_degrade' as const
export const LEAD_CAP_TYPE = 'stock' as const // cumulative, not per-period
