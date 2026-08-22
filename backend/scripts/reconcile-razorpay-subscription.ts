// Repairs an account whose Razorpay payment succeeded but whose webhook never
// arrived, leaving the customer paid-but-inactive.
//
// WHY THIS IS NEEDED:
//   On 2026-08-22 the Razorpay webhook was found pointing at a dead domain that
//   returned HTTP 200 (a CloudFront SPA), so Razorpay marked every event
//   delivered and retried nothing. A customer paid Rs 5,499, Razorpay activated
//   the subscription, and the local row stayed `pending_activation` on the free
//   plan with no payment_history entry. Fixing the webhook does not repair the
//   accounts already stranded by it.
//
// WHAT IT WRITES:
//   Exactly what webhook-service.ts's `subscription.charged` branch would have
//   written, and nothing else -- status, plan (from the subscription's
//   notes.tier), currentPeriodEnd, a payment_history row per paid invoice, and
//   an entitlements cache invalidation. It reuses the same repositories rather
//   than reimplementing the writes, so the two cannot drift.
//
//   Razorpay is treated as the source of truth: the script refuses to activate
//   anything the Razorpay API does not report as genuinely active and paid.
//
// SAFETY:
//   - Dry run by default. Pass --apply to write.
//   - Refuses unless the Razorpay subscription is active/completed AND
//     paid_count > 0.
//   - Refuses unless the local row's providerSubscriptionId matches the
//     subscription being reconciled -- the same cross-check the webhook handler
//     performs before touching an account.
//   - Skips a payment already present in payment_history, so re-running (or a
//     late webhook retry landing afterwards) cannot double-record a charge.
//
// Usage, from backend/:
//   TS_NODE_TRANSPILE_ONLY=true node --env-file=.env --loader ts-node/esm \
//     scripts/reconcile-razorpay-subscription.ts <clientId> [--apply]

import { razorpayProvider } from '../src/providers/razorpay-provider.js'
import { getByAccountId, updatePartial } from '../src/repositories/subscription-repository.js'
import { getPaymentHistory, logPayment } from '../src/repositories/payment-history-repository.js'
import { invalidateEntitlementsCache } from '../src/services/entitlement-service.js'
import type { PlanTier, Subscription } from '../src/types/index.js'

const BILLABLE_TIERS: ReadonlySet<string> = new Set(['starter', 'growth', 'agency'])
const PAID_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set(['active', 'completed'])

function fail(message: string): never {
  console.error(`REFUSING: ${message}`)
  process.exit(1)
}

async function main(): Promise<void> {
  const clientId = process.argv[2]
  const apply = process.argv.includes('--apply')
  if (!clientId || clientId.startsWith('--')) {
    console.error('usage: reconcile-razorpay-subscription.ts <clientId> [--apply]')
    process.exit(1)
  }

  const local = await getByAccountId(clientId)
  if (!local) fail(`no local subscription row for ${clientId}`)
  if (!local.providerSubscriptionId) fail(`local row for ${clientId} has no providerSubscriptionId`)

  const remote = await razorpayProvider.fetchSubscription(local.providerSubscriptionId)

  console.log(`account ${clientId}`)
  console.log(`  local :  status=${local.status}  plan=${local.plan}  sub=${local.providerSubscriptionId}`)
  console.log(`  remote:  status=${remote.status}  paid_count=${remote.paid_count}  notes.tier=${remote.notes?.tier}`)

  if (remote.id !== local.providerSubscriptionId) {
    fail(`subscription id mismatch: local ${local.providerSubscriptionId}, remote ${remote.id}`)
  }
  if (!PAID_SUBSCRIPTION_STATUSES.has(remote.status)) {
    fail(`Razorpay reports status "${remote.status}" - only ${[...PAID_SUBSCRIPTION_STATUSES].join('/')} may be activated`)
  }
  if (remote.paid_count < 1) {
    fail(`Razorpay reports paid_count=${remote.paid_count} - nothing was actually paid`)
  }

  const updates: Partial<Omit<Subscription, 'accountId' | 'createdAt'>> = { status: 'active' }

  const tier = remote.notes?.tier
  if (tier && BILLABLE_TIERS.has(tier)) {
    updates.plan = tier as PlanTier
  } else {
    console.warn(`  WARNING: notes.tier=${tier ?? 'absent'} is not billable - plan will stay "${local.plan}"`)
  }

  if (remote.current_end) {
    updates.currentPeriodEnd = new Date(remote.current_end * 1000).toISOString()
  }

  // One payment_history row per paid invoice, skipping any already recorded.
  const existing = new Set((await getPaymentHistory(clientId)).map((p) => p.paymentId))
  const invoices = await razorpayProvider.fetchInvoicesForSubscription(remote.id)
  const toRecord = invoices.filter((i) => i.status === 'paid' && i.payment_id && !existing.has(i.payment_id))

  console.log(`\n  updates: ${JSON.stringify(updates)}`)
  console.log(`  invoices: ${invoices.length} total, ${toRecord.length} payment(s) to record, ${existing.size} already present`)

  if (!apply) {
    console.log('\nDRY RUN - nothing written. Re-run with --apply.')
    return
  }

  for (const invoice of toRecord) {
    const payment = await razorpayProvider.fetchPayment(invoice.payment_id as string)
    await logPayment({
      accountId: clientId,
      paidAt: new Date().toISOString(),
      paymentId: payment.id,
      subscriptionId: remote.id,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      invoiceUrl: invoice.short_url,
    })
    console.log(`  recorded ${payment.id}  ${payment.amount / 100} ${payment.currency}  ${payment.status}`)
  }

  await updatePartial(clientId, updates)
  await invalidateEntitlementsCache(clientId)
  console.log('\nReconciled.')
}

main().catch((error: unknown) => {
  console.error('reconcile-razorpay-subscription failed:', error)
  process.exit(1)
})
