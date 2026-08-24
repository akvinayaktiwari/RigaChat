#!/usr/bin/env bash
#
# Razorpay go-live: create the live-mode Plans, then point every Lambda at
# live mode. Implements Steps 1 and 3 of docs/RAZORPAY_GO_LIVE_TEST_PLAN.md.
#
# Step 2 (the webhook itself) is NOT here and cannot be: Razorpay's webhook
# create/edit API is Partner-only, so a standard key gets `404 no Route
# matched` on PATCH /v1/webhooks. The webhook URL and its events have to be
# set in the dashboard by hand. This script only consumes the secret that
# dashboard work produces.
#
# Usage:
#   export RAZORPAY_LIVE_KEY_ID=rzp_live_xxx
#   export RAZORPAY_LIVE_KEY_SECRET=xxx
#   export RAZORPAY_LIVE_WEBHOOK_SECRET=xxx      # from the LIVE webhook, dashboard
#
#   ./scripts/razorpay-go-live.sh                # dry run: create/find plans, print, change nothing
#   ./scripts/razorpay-go-live.sh --apply        # also write env vars to all three Lambdas
#
set -euo pipefail

FUNCTIONS=(rigachat-api rigachat-api-streaming rigachat-crawler)
APPLY=false
[[ "${1:-}" == "--apply" ]] && APPLY=true

die() { echo "ERROR: $*" >&2; exit 1; }

: "${RAZORPAY_LIVE_KEY_ID:?set RAZORPAY_LIVE_KEY_ID}"
: "${RAZORPAY_LIVE_KEY_SECRET:?set RAZORPAY_LIVE_KEY_SECRET}"

[[ "$RAZORPAY_LIVE_KEY_ID" == rzp_live_* ]] \
  || die "RAZORPAY_LIVE_KEY_ID is '${RAZORPAY_LIVE_KEY_ID:0:9}…' — expected rzp_live_. Refusing to 'go live' with a test key."

AUTH="$RAZORPAY_LIVE_KEY_ID:$RAZORPAY_LIVE_KEY_SECRET"

# --apply without the live webhook secret is the exact failure this whole
# exercise is about: live keys taking real money while the webhook secret is
# still the test one, so every delivery is rejected and no subscription ever
# activates. Refuse rather than half-migrate.
if $APPLY && [[ -z "${RAZORPAY_LIVE_WEBHOOK_SECRET:-}" ]]; then
  die "--apply needs RAZORPAY_LIVE_WEBHOOK_SECRET (the LIVE webhook's secret from the dashboard).
       Without it the Lambdas would hold live keys but a test webhook secret, and every
       delivery would be rejected with 'invalid or missing signature'."
fi

echo "==> Preflight: live credentials"
PREFLIGHT=$(curl -s -u "$AUTH" "https://api.razorpay.com/v1/plans?count=100" --max-time 30)
if echo "$PREFLIGHT" | python3 -c "import json,sys; sys.exit(0 if 'error' in json.load(sys.stdin) else 1)" 2>/dev/null; then
  echo "$PREFLIGHT" | python3 -c "import json,sys; e=json.load(sys.stdin)['error']; print('  Razorpay rejected the live key:', e.get('description'))"
  die "live credentials not usable (is live mode / KYC activated on this account?)"
fi
echo "  ok — live API reachable"

# Mirrors the test-mode plans exactly (verified against plan_TFl5GSmRUtfMdr /
# plan_TFl6Ni0ElGMJ53 / plan_TFl7V2GGsEeYPV): monthly, interval 1, INR, amounts
# in paise. Keep in step with PRICING_TIERS in frontend/src/lib/pricingTiers.ts.
declare -a TIERS=("STARTER:Starter:199900" "GROWTH:Growth:549900" "AGENCY:Agency:1499900")

declare -A PLAN_IDS

echo "==> Step 1: live-mode Plans"
for spec in "${TIERS[@]}"; do
  IFS=':' read -r key name amount <<< "$spec"

  # Idempotent: reuse a live plan that already matches name+amount+monthly
  # rather than creating a duplicate every run.
  existing=$(echo "$PREFLIGHT" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for p in d.get('items',[]):
    i=p.get('item',{})
    if i.get('name')=='$name' and i.get('amount')==$amount and p.get('period')=='monthly' and p.get('interval')==1:
        print(p['id']); break
")

  if [[ -n "$existing" ]]; then
    PLAN_IDS[$key]="$existing"
    echo "  $name: reusing $existing"
    continue
  fi

  if ! $APPLY; then
    PLAN_IDS[$key]="<would create>"
    echo "  $name: would CREATE (₹$((amount/100))/mo) — dry run, not created"
    continue
  fi

  created=$(curl -s -u "$AUTH" -X POST "https://api.razorpay.com/v1/plans" \
    -H "Content-Type: application/json" --max-time 30 \
    -d "{\"period\":\"monthly\",\"interval\":1,\"item\":{\"name\":\"$name\",\"amount\":$amount,\"currency\":\"INR\"}}")

  id=$(echo "$created" | python3 -c "
import json,sys
d=json.load(sys.stdin)
if 'error' in d: print('ERR:'+str(d['error'].get('description')))
else: print(d['id'])
")
  [[ "$id" == ERR:* ]] && die "creating $name plan: ${id#ERR:}"
  PLAN_IDS[$key]="$id"
  echo "  $name: created $id"
done

echo
echo "==> Plan ids"
for key in STARTER GROWTH AGENCY; do printf '  RAZORPAY_PLAN_ID_%-8s = %s\n' "$key" "${PLAN_IDS[$key]}"; done

if ! $APPLY; then
  echo
  echo "Dry run — no plans created, no Lambda touched."
  echo "Re-run with --apply (and RAZORPAY_LIVE_WEBHOOK_SECRET set) to go live."
  exit 0
fi

echo
echo "==> Step 3: Lambda env vars"
for fn in "${FUNCTIONS[@]}"; do
  echo "  $fn"

  # Read-modify-write. A bare `aws lambda update-function-configuration
  # --environment` REPLACES the whole map, so the existing vars must be read
  # and merged or the function loses all 40 of them.
  current=$(aws lambda get-function-configuration --function-name "$fn" \
    --query "Environment.Variables" --output json)

  before=$(echo "$current" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))")

  merged=$(echo "$current" | python3 -c "
import json,sys,os
v=json.load(sys.stdin)
v['RAZORPAY_KEY_ID']=os.environ['RAZORPAY_LIVE_KEY_ID']
v['RAZORPAY_KEY_SECRET']=os.environ['RAZORPAY_LIVE_KEY_SECRET']
v['RAZORPAY_WEBHOOK_SECRET']=os.environ['RAZORPAY_LIVE_WEBHOOK_SECRET']
v['RAZORPAY_PLAN_ID_STARTER']=os.environ['PLAN_STARTER']
v['RAZORPAY_PLAN_ID_GROWTH']=os.environ['PLAN_GROWTH']
v['RAZORPAY_PLAN_ID_AGENCY']=os.environ['PLAN_AGENCY']
budget=sum(len(k)+len(str(x)) for k,x in v.items())
if budget > 4096: raise SystemExit(f'env would be {budget} bytes, over the 4KB Lambda ceiling')
print(json.dumps({'Variables':v}))
" PLAN_STARTER="${PLAN_IDS[STARTER]}" PLAN_GROWTH="${PLAN_IDS[GROWTH]}" PLAN_AGENCY="${PLAN_IDS[AGENCY]}")

  aws lambda update-function-configuration --function-name "$fn" \
    --environment "$merged" --output json >/dev/null

  aws lambda wait function-updated --function-name "$fn"

  after=$(aws lambda get-function-configuration --function-name "$fn" \
    --query "Environment.Variables" --output json \
    | python3 -c "
import json,sys
v=json.load(sys.stdin)
assert v['RAZORPAY_KEY_ID'].startswith('rzp_live_'), 'key did not land as live'
print(len(v))
")
  [[ "$before" == "$after" ]] || die "$fn: var count changed $before -> $after (expected no new vars)"
  echo "    ok — live key set, $after vars intact"
done

echo
echo "Done. Verify before trusting it:"
echo "  1. curl -s -o /dev/null -w '%{http_code}\\n' -X POST https://vyostra.com/api/webhooks/razorpay \\"
echo "       -H 'x-razorpay-signature: bogus' -H 'x-razorpay-event-id: probe' -d '{}'   # expect 400, NOT 200"
echo "  2. Make one real ₹1,999 payment and confirm the subscription flips to active."
echo "     A signature mismatch shows up as 'Razorpay webhook rejected: invalid or missing signature'."
