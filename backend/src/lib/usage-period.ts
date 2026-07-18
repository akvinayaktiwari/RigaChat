import type { Subscription } from '../types/index.js'

// Trial usage is not billing-cycle-anchored yet — currentPeriodStart/End
// are null pre-Razorpay integration, so the entire trial + grace window
// shares one fixed "trial" bucket instead of resetting monthly. Switch this
// to real billing-cycle anchoring once the payment integration module
// populates currentPeriodStart/End.
export function getPeriodKey(subscription: Subscription): string {
  if (subscription.status === 'trialing' || subscription.status === 'trial_expired') {
    return 'trial'
  }

  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}
