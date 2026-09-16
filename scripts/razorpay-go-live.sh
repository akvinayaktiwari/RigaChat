#!/bin/bash
set -euo pipefail

# Switches all three Lambdas from Razorpay TEST to LIVE, in one all-or-nothing
# step. Read docs/RAZORPAY_GO_LIVE_TEST_PLAN.md first — this script is Step 3,
# and Steps 0-2 (international payments enabled, live USD plans, live webhook)
# are dashboard work it cannot do for you.
#
# WHY A SCRIPT. `aws lambda update-function-configuration --environment`
# REPLACES the entire variable map. A hand-rolled update deletes OPENAI_API_KEY,
# the Cognito ids and everything else on that function. This read-modify-writes
# instead, and fails loudly if the count of variables changes.
#
# WHY ALL THREE. lib/razorpay.ts reads the key at MODULE LOAD and throws when it
# is absent, and rigachat-api, rigachat-api-streaming and rigachat-crawler all
# run the same bundle. Miss one and that Lambda dies at cold start entirely —
# chat, leads and crawling included, not only billing.
#
#   ./scripts/razorpay-go-live.sh            dry run: verifies everything, writes nothing
#   ./scripts/razorpay-go-live.sh --apply    writes all three Lambdas
#
# It deliberately does NOT create plans. A plan is a priced, immutable object in
# a payment account: make it in the dashboard where you can see it, then pass
# the ids here.

REGION="${AWS_REGION:-ap-south-1}"
FUNCTIONS=(rigachat-api rigachat-api-streaming rigachat-crawler)
APPLY=false
[[ "${1:-}" == "--apply" ]] && APPLY=true

command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

require() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing \$$name — see docs/RAZORPAY_GO_LIVE_TEST_PLAN.md §2" >&2
    exit 1
  fi
}
require RAZORPAY_LIVE_KEY_ID
require RAZORPAY_LIVE_KEY_SECRET
require RAZORPAY_LIVE_WEBHOOK_SECRET
require RAZORPAY_LIVE_PLAN_ID_STARTER
require RAZORPAY_LIVE_PLAN_ID_GROWTH
require RAZORPAY_LIVE_PLAN_ID_AGENCY

# A test key here is the single most likely mistake, and it would take the site
# live pointing at plans that cannot charge anyone.
if [[ "$RAZORPAY_LIVE_KEY_ID" != rzp_live_* ]]; then
  echo "RAZORPAY_LIVE_KEY_ID is '$RAZORPAY_LIVE_KEY_ID' — expected rzp_live_…" >&2
  exit 1
fi

echo "==> Checking the three plans resolve in live mode, in USD"
EXPECTED_AMOUNTS=(4900 12900 34900)   # smallest unit: $49 / $129 / $349
PLAN_IDS=("$RAZORPAY_LIVE_PLAN_ID_STARTER" "$RAZORPAY_LIVE_PLAN_ID_GROWTH" "$RAZORPAY_LIVE_PLAN_ID_AGENCY")
PLAN_NAMES=(Starter Growth Agency)

for i in "${!PLAN_IDS[@]}"; do
  plan="$(curl -sf -u "$RAZORPAY_LIVE_KEY_ID:$RAZORPAY_LIVE_KEY_SECRET" \
    "https://api.razorpay.com/v1/plans/${PLAN_IDS[$i]}")" || {
    echo "  FAIL  ${PLAN_NAMES[$i]} (${PLAN_IDS[$i]}) did not resolve with the live key." >&2
    echo "        A test-mode plan id is invisible in live mode — check the mode switch." >&2
    exit 1
  }
  amount="$(jq -r '.item.amount' <<<"$plan")"
  currency="$(jq -r '.item.currency' <<<"$plan")"
  period="$(jq -r '.period' <<<"$plan")"
  echo "  ${PLAN_NAMES[$i]}: $amount $currency / $period"
  if [[ "$currency" != "USD" || "$amount" != "${EXPECTED_AMOUNTS[$i]}" ]]; then
    echo "  FAIL  expected ${EXPECTED_AMOUNTS[$i]} USD — the site shows \$$((${EXPECTED_AMOUNTS[$i]} / 100))." >&2
    echo "        Fix the plan (they are immutable: make a new one) or the price on the site." >&2
    exit 1
  fi
  [[ "$period" == "monthly" ]] || { echo "  FAIL  period is '$period', expected monthly" >&2; exit 1; }
done

if ! $APPLY; then
  echo
  echo "==> Dry run. Nothing written. Would set on ${FUNCTIONS[*]}:"
  echo "      RAZORPAY_KEY_ID=$RAZORPAY_LIVE_KEY_ID"
  echo "      RAZORPAY_KEY_SECRET=***  RAZORPAY_WEBHOOK_SECRET=***"
  echo "      RAZORPAY_PLAN_ID_STARTER/GROWTH/AGENCY=${PLAN_IDS[*]}"
  echo "    Re-run with --apply to write."
  exit 0
fi

echo
echo "==> Writing live values to all three Lambdas"
for fn in "${FUNCTIONS[@]}"; do
  current="$(aws lambda get-function-configuration --function-name "$fn" \
    --region "$REGION" --query 'Environment.Variables' --output json)"
  before="$(jq 'length' <<<"$current")"

  updated="$(jq \
    --arg key "$RAZORPAY_LIVE_KEY_ID" \
    --arg secret "$RAZORPAY_LIVE_KEY_SECRET" \
    --arg hook "$RAZORPAY_LIVE_WEBHOOK_SECRET" \
    --arg starter "$RAZORPAY_LIVE_PLAN_ID_STARTER" \
    --arg growth "$RAZORPAY_LIVE_PLAN_ID_GROWTH" \
    --arg agency "$RAZORPAY_LIVE_PLAN_ID_AGENCY" \
    '.RAZORPAY_KEY_ID=$key | .RAZORPAY_KEY_SECRET=$secret | .RAZORPAY_WEBHOOK_SECRET=$hook
     | .RAZORPAY_PLAN_ID_STARTER=$starter | .RAZORPAY_PLAN_ID_GROWTH=$growth | .RAZORPAY_PLAN_ID_AGENCY=$agency' \
    <<<"$current")"

  aws lambda update-function-configuration --function-name "$fn" --region "$REGION" \
    --environment "Variables=$(jq -c . <<<"$updated")" >/dev/null

  # Re-read rather than trusting the write: this is the step where a replaced
  # map silently loses variables, and the count is what exposes it.
  aws lambda wait function-updated --function-name "$fn" --region "$REGION"
  after_env="$(aws lambda get-function-configuration --function-name "$fn" \
    --region "$REGION" --query 'Environment.Variables' --output json)"
  after="$(jq 'length' <<<"$after_env")"
  landed_key="$(jq -r '.RAZORPAY_KEY_ID' <<<"$after_env")"

  if [[ "$after" -ne "$before" ]]; then
    echo "  FAIL  $fn: variable count went $before -> $after. Something was dropped." >&2
    exit 1
  fi
  [[ "$landed_key" == rzp_live_* ]] || { echo "  FAIL  $fn: key is '$landed_key'" >&2; exit 1; }
  echo "  ok    $fn ($after vars, key $landed_key)"
done

echo
echo "==> Cold-starting each function (a missing var throws on import, not on request)"
for fn in "${FUNCTIONS[@]}"; do
  aws lambda invoke --function-name "$fn" --payload '{}' --region "$REGION" \
    --cli-binary-format raw-in-base64-out "/tmp/go-live-$fn.json" >/dev/null
  if jq -e 'has("errorType")' "/tmp/go-live-$fn.json" >/dev/null 2>&1; then
    echo "  FAIL  $fn threw on invoke: $(jq -r '.errorMessage' "/tmp/go-live-$fn.json")" >&2
    exit 1
  fi
  echo "  ok    $fn"
done

cat <<'DONE'

==> Live. Two things left, and neither is optional:

  1. Signature check still rejects a bad one:
       curl -s -X POST https://vyostra.com/api/webhooks/razorpay \
         -H 'X-Razorpay-Signature: bogus' -d '{}'
       # expect {"message":"Invalid signature"}

  2. ONE REAL PAYMENT — Starter, your own card — then confirm the subscriptions
     row went active, a payment_history row was written, and CloudWatch shows
     subscription.charged + subscription.activated. Refund it afterwards.

     Do not skip it. Everything upstream can look correct while the webhook
     still fails; that is exactly what happened for a month in test mode.
DONE
