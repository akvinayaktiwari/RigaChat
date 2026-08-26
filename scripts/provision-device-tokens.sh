#!/usr/bin/env bash
# Provisioning for feat/mobile-push-slice.
#
# One table. Derived from the code, not from docs:
#   - PK clientId   -- device-token-repository.ts's Key:{ clientId, deviceId }
#   - SK deviceId
#   - NO GSI        -- the only access pattern is getDeviceTokensForClient(),
#                      a Query on the partition key. Same reasoning as
#                      meta_deletion_requests: an index with no reader is a
#                      cost and a second thing to keep consistent.
#
# DELIBERATE DEVIATION FROM provision-lead-state.sh: that script has a step 3
# that sets DYNAMODB_TABLE_LEAD_STATE on three Lambdas. THIS SCRIPT HAS NO SUCH
# STEP, and must not grow one. Table names moved into lib/table-names.ts
# precisely to stop consuming Lambda environment bytes; rigachat-api sits at
# 3597 of 4096 (measured 2026-08-16, ceiling actually hit 2026-08-10).
# device_tokens is registered in TABLE_NAMES and resolves at call time, so it
# needs zero environment. Acceptance criterion 12 asserts the byte count is
# unchanged after this deploys -- adding a variable here would fail it.
#
# Idempotent: safe to re-run, and safe to run before or after a deploy, since
# table names resolve at call time.
set -euo pipefail

REGION="ap-south-1"
# Derived, never hardcoded: this repo is public, and an account id is a
# targeting aid nobody needs handed to them.
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
TABLE="device_tokens"

echo "==> 1/2 Creating the ${TABLE} table"
if aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" >/dev/null 2>&1; then
  echo "    $TABLE already exists, skipping"
else
  echo "    creating $TABLE (pk=clientId, sk=deviceId, no GSI)"
  aws dynamodb create-table --table-name "$TABLE" --region "$REGION" \
    --billing-mode PAY_PER_REQUEST \
    --attribute-definitions \
      AttributeName=clientId,AttributeType=S \
      AttributeName=deviceId,AttributeType=S \
    --key-schema \
      AttributeName=clientId,KeyType=HASH \
      AttributeName=deviceId,KeyType=RANGE \
    --output json >/dev/null
  echo "    waiting for $TABLE to become ACTIVE..."
  aws dynamodb wait table-exists --table-name "$TABLE" --region "$REGION"
  echo "    done"
fi

# No TTL. A row is retired by an explicit DELETE on sign-out, or by the push
# service when Expo reports DeviceNotRegistered. A time-based expiry would
# silently stop notifying a client who simply had a quiet month, which is the
# exact failure this whole feature exists to prevent.

echo "==> 2/2 Checking the Lambda roles can reach ${TABLE}"
# simulate-principal-policy, not a grep over inline policies: both roles carry
# AmazonDynamoDBFullAccess as an ATTACHED MANAGED policy, which a
# list-role-policies check never looks at. A false alarm here is worse than no
# check -- it sends you editing IAM that was already correct.
TABLE_ARN="arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/${TABLE}"
for ROLE in rigachat-api-role-4c9qsico rigachat-api-streaming-role-625vca9z; do
  DENIED=$(aws iam simulate-principal-policy \
    --policy-source-arn "arn:aws:iam::${ACCOUNT}:role/${ROLE}" \
    --action-names dynamodb:Query dynamodb:UpdateItem dynamodb:DeleteItem \
    --resource-arns "$TABLE_ARN" \
    --query "EvaluationResults[?EvalDecision!='allowed'].EvalActionName" \
    --output text 2>/dev/null || echo "SIMULATE_FAILED")

  if [ -z "$DENIED" ]; then
    echo "    $ROLE: Query/UpdateItem/DeleteItem allowed on $TABLE"
  elif [ "$DENIED" = "SIMULATE_FAILED" ]; then
    echo "    $ROLE: could not simulate (needs iam:SimulatePrincipalPolicy) -- check by hand"
  else
    echo "    $ROLE: DENIED $DENIED -- grant these on"
    echo "        $TABLE_ARN before deploying."
  fi
done

echo
echo "Done. NOTE: no Lambda environment variable was set, and none should be."
echo "Verify with:"
echo "  aws dynamodb describe-table --table-name ${TABLE} --region ${REGION} \\"
echo "    --query '{pk:KeySchema,gsi:GlobalSecondaryIndexes}' --output json"
echo "  # acceptance criterion 12 -- must still read 3597:"
echo "  aws lambda get-function-configuration --function-name rigachat-api --region ${REGION} \\"
echo "    --query 'Environment.Variables' --output json | wc -c"
