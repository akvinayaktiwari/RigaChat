#!/usr/bin/env bash
# Provisioning for feat/voice-agent-telephony.
#
# One table. Derived from the code, not from docs:
#   - PK phoneNumber -- voice-phone-lookup-repository.ts's Key:{ phoneNumber }
#   - NO SK          -- every access is a point read on the dialled number
#   - NO GSI         -- the inbound-call path is a GetItem by phoneNumber, and
#                       nothing today lists an agent's numbers. Same reasoning
#                       as meta_deletion_requests and device_tokens: an index
#                       with no reader is a cost and a second thing to keep
#                       consistent. Add one WHEN a "list this agent's numbers"
#                       screen actually exists, not before.
#
# Like provision-device-tokens.sh and unlike provision-lead-state.sh, THIS
# SCRIPT SETS NO LAMBDA ENVIRONMENT VARIABLE and must not grow one.
# voice_phone_lookup is registered in lib/table-names.ts and resolves at call
# time. rigachat-api sits at 3597 of 4096 environment bytes (measured
# 2026-08-16, ceiling actually hit 2026-08-10).
#
# READER THAT IS NOT A LAMBDA: the inbound-call read runs in the voice relay,
# which is a SEPARATE process on EC2 with its own instance role -- not one of
# the Lambda roles checked below. Step 3 prints what that role needs; confirm
# it by hand, because this script does not know the instance profile's name and
# guessing one would print a reassuring check of something that isn't the real
# principal.
#
# Idempotent: safe to re-run, and safe to run before or after a deploy, since
# table names resolve at call time.
set -euo pipefail

REGION="ap-south-1"
# Derived, never hardcoded: this repo is public, and an account id is a
# targeting aid nobody needs handed to them.
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
TABLE="voice_phone_lookup"

echo "==> 1/3 Creating the ${TABLE} table"
if aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" >/dev/null 2>&1; then
  echo "    $TABLE already exists, skipping"
else
  echo "    creating $TABLE (pk=phoneNumber, no sk, no GSI)"
  aws dynamodb create-table --table-name "$TABLE" --region "$REGION" \
    --billing-mode PAY_PER_REQUEST \
    --attribute-definitions \
      AttributeName=phoneNumber,AttributeType=S \
    --key-schema \
      AttributeName=phoneNumber,KeyType=HASH \
    --output json >/dev/null
  echo "    waiting for $TABLE to become ACTIVE..."
  aws dynamodb wait table-exists --table-name "$TABLE" --region "$REGION"
  echo "    done"
fi

# No TTL. The row IS the assignment: it is deleted when a number is released.
# A time-based expiry would silently stop routing calls to a number the client
# still pays Plivo for every month, and the symptom (calls ring nowhere) is
# exactly the failure this feature exists to prevent.

echo "==> 2/3 Checking the Lambda roles can reach ${TABLE}"
# simulate-principal-policy, not a grep over inline policies: both roles carry
# AmazonDynamoDBFullAccess as an ATTACHED MANAGED policy, which a
# list-role-policies check never looks at. A false alarm here is worse than no
# check -- it sends you editing IAM that was already correct.
TABLE_ARN="arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/${TABLE}"
for ROLE in rigachat-api-role-4c9qsico rigachat-api-streaming-role-625vca9z; do
  DENIED=$(aws iam simulate-principal-policy \
    --policy-source-arn "arn:aws:iam::${ACCOUNT}:role/${ROLE}" \
    --action-names dynamodb:GetItem dynamodb:PutItem dynamodb:DeleteItem \
    --resource-arns "$TABLE_ARN" \
    --query "EvaluationResults[?EvalDecision!='allowed'].EvalActionName" \
    --output text 2>/dev/null || echo "SIMULATE_FAILED")

  if [ -z "$DENIED" ]; then
    echo "    $ROLE: GetItem/PutItem/DeleteItem allowed on $TABLE"
  elif [ "$DENIED" = "SIMULATE_FAILED" ]; then
    echo "    $ROLE: could not simulate (needs iam:SimulatePrincipalPolicy) -- check by hand"
  else
    echo "    $ROLE: DENIED $DENIED -- grant these on"
    echo "        $TABLE_ARN before deploying."
  fi
done

echo "==> 3/3 The voice relay's own principal (MANUAL)"
echo "    The inbound-call read runs on the EC2 voice relay, not in a Lambda."
echo "    Confirm its instance role has dynamodb:GetItem on:"
echo "        $TABLE_ARN"
echo "    Find the role with:"
echo "      aws ec2 describe-instances --region ${REGION} \\"
echo "        --filters Name=instance-state-name,Values=running \\"
echo "        --query 'Reservations[].Instances[].{id:InstanceId,profile:IamInstanceProfile.Arn}' \\"
echo "        --output table"
echo "    Then simulate it the same way step 2 does. Without GetItem here every"
echo "    inbound call fails lookup and is rejected -- the dashboard will look"
echo "    fine and no call will ever connect."

echo
echo "Done. NOTE: no Lambda environment variable was set, and none should be."
echo "Verify with:"
echo "  aws dynamodb describe-table --table-name ${TABLE} --region ${REGION} \\"
echo "    --query '{pk:KeySchema,gsi:GlobalSecondaryIndexes}' --output json"
echo "  # must still read 3597:"
echo "  aws lambda get-function-configuration --function-name rigachat-api --region ${REGION} \\"
echo "    --query 'Environment.Variables' --output json | wc -c"
