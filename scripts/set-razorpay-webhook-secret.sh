#!/usr/bin/env bash
# Sets RAZORPAY_WEBHOOK_SECRET to the same value on all three Lambdas.
#
# WHY A SCRIPT AND NOT A ONE-LINER:
#   `aws lambda update-function-configuration --environment` REPLACES the entire
#   variable map. Passing just the one key silently deletes every other variable
#   -- which for this stack means OPENAI_API_KEY, the Cognito ids, the Pinecone
#   keys, everything. This reads the current map, changes exactly one key, and
#   writes it back, verifying the variable count is unchanged afterwards.
#
#   It also refuses to write if the result would approach Lambda's hard 4KB env
#   ceiling. See backend/src/lib/table-names.ts for why that ceiling is tight
#   here -- the 30 DYNAMODB_TABLE_* vars were removed on 2026-08-16 to free it.
#
# The secret must be IDENTICAL to the one set on the webhook in the Razorpay
# dashboard (Settings -> Webhooks), or every delivery fails signature
# verification with "Razorpay webhook rejected: invalid or missing signature"
# and paid subscriptions never activate. Test and live modes have separate
# webhooks with separate secrets.
#
# Usage:
#   ./scripts/set-razorpay-webhook-secret.sh <secret>
#   ./scripts/set-razorpay-webhook-secret.sh "$(openssl rand -hex 32)"
#
# The secret is never echoed; only a short fingerprint is printed so you can
# confirm all three match without exposing the value in your shell history.

set -euo pipefail

SECRET="${1:-}"
if [ -z "$SECRET" ]; then
  echo "usage: $0 <secret>" >&2
  exit 1
fi

KEY="RAZORPAY_WEBHOOK_SECRET"
FUNCTIONS=("rigachat-api" "rigachat-api-streaming" "rigachat-crawler")

FINGERPRINT=$(printf '%s' "$SECRET" | shasum -a 256 | cut -c1-12)
echo "secret fingerprint: ${FINGERPRINT}  (length ${#SECRET})"
echo

for FN in "${FUNCTIONS[@]}"; do
  ENV_JSON=$(aws lambda get-function-configuration --function-name "$FN" \
    --query 'Environment.Variables' --output json)

  UPDATED=$(SECRET="$SECRET" KEY="$KEY" python3 -c '
import json,os,sys
env=json.load(sys.stdin)
key=os.environ["KEY"]
if key not in env:
    print("MISSING", file=sys.stderr); raise SystemExit(1)
before=len(env)
env[key]=os.environ["SECRET"]
size=sum(len(k)+len(v) for k,v in env.items())
if size>4000:
    print(f"TOOBIG {size}", file=sys.stderr); raise SystemExit(1)
print(json.dumps({"Variables":env,"_before":before,"_size":size}))
' <<<"$ENV_JSON")

  BEFORE=$(python3 -c 'import json,sys;print(json.load(sys.stdin)["_before"])' <<<"$UPDATED")
  SIZE=$(python3 -c 'import json,sys;print(json.load(sys.stdin)["_size"])' <<<"$UPDATED")
  PAYLOAD=$(python3 -c 'import json,sys;d=json.load(sys.stdin);print(json.dumps({"Variables":d["Variables"]}))' <<<"$UPDATED")

  AFTER=$(aws lambda update-function-configuration --function-name "$FN" \
    --environment "$PAYLOAD" \
    --query 'length(Environment.Variables)' --output text)

  if [ "$AFTER" = "$BEFORE" ]; then
    echo "  $FN: OK  (${AFTER} vars preserved, env ${SIZE}B / 4096B)"
  else
    echo "  $FN: WARNING variable count changed ${BEFORE} -> ${AFTER}" >&2
  fi
done

echo
echo "Done. Now confirm the SAME secret is saved on the Razorpay dashboard webhook."
