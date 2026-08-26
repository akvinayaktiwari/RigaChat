#!/usr/bin/env bash
# Provisioning for the Meta data-deletion callback.
#
# One table. Derived from the code, not from docs:
#   - PK confirmationCode -- meta-deletion-request-repository.ts's
#                            Key:{ confirmationCode }
#
# No GSI. Every read is a point lookup by confirmation code: Meta hands the
# code to the user, the user brings it back to /data-deletion-status. Nothing
# lists these by date, and the ops path is "follow the link in the email".
#
# No TTL, deliberately. A deletion request is the record that someone asked --
# expiring it would destroy the only evidence we handled the request, which is
# exactly what a regulator or a Meta reviewer would ask to see.
#
# Idempotent: safe to re-run, and safe to run before or after a deploy, since
# table names resolve at call time (see commit 4a3a3a9).
set -euo pipefail

REGION="ap-south-1"
# Derived, never hardcoded: this repo is public, and an account id is a
# targeting aid nobody needs handed to them. Also makes the script work
# against any account rather than only the one it was written on.
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
TABLE="meta_deletion_requests"
LAMBDAS=(rigachat-api rigachat-api-streaming rigachat-crawler)

echo "==> 1/3 Creating the ${TABLE} table"
if aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" >/dev/null 2>&1; then
  echo "    $TABLE already exists, skipping"
else
  echo "    creating $TABLE (pk=confirmationCode)"
  aws dynamodb create-table --table-name "$TABLE" --region "$REGION" \
    --billing-mode PAY_PER_REQUEST \
    --attribute-definitions AttributeName=confirmationCode,AttributeType=S \
    --key-schema AttributeName=confirmationCode,KeyType=HASH \
    --output json >/dev/null
  echo "    waiting for $TABLE to become ACTIVE..."
  aws dynamodb wait table-exists --table-name "$TABLE" --region "$REGION"
  echo "    done"
fi

echo "==> 2/3 Checking the Lambda roles can reach ${TABLE}"
# simulate-principal-policy rather than grepping inline policies: these roles
# carry AmazonDynamoDBFullAccess as an ATTACHED MANAGED policy, which a
# list-role-policies check never sees. See provision-lead-state.sh.
TABLE_ARN="arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/${TABLE}"
PERMS_OK=true
for ROLE in rigachat-api-role-4c9qsico rigachat-api-streaming-role-625vca9z; do
  DENIED=$(aws iam simulate-principal-policy \
    --policy-source-arn "arn:aws:iam::${ACCOUNT}:role/${ROLE}" \
    --action-names dynamodb:PutItem dynamodb:GetItem dynamodb:UpdateItem \
    --resource-arns "$TABLE_ARN" \
    --query "EvaluationResults[?EvalDecision!='allowed'].EvalActionName" \
    --output text 2>/dev/null || echo "SIMULATE_FAILED")

  if [ -z "$DENIED" ]; then
    echo "    $ROLE: PutItem/GetItem/UpdateItem allowed"
  elif [ "$DENIED" = "SIMULATE_FAILED" ]; then
    echo "    $ROLE: could not simulate (needs iam:SimulatePrincipalPolicy) -- check by hand"
  else
    echo "    $ROLE: DENIED $DENIED -- grant these on"
    echo "        $TABLE_ARN before deploying."
    PERMS_OK=false
  fi
done

# provision-lead-state.sh prints the same warning and then carries on to print
# "Done." A denied role means the callback 500s at runtime, so treat it as the
# failure it is rather than setting the env var and declaring success.
if [ "$PERMS_OK" = false ]; then
  echo
  echo "Aborting before the env-var step: at least one role cannot reach ${TABLE}."
  echo "Grant the actions above, then re-run. The table itself is already created,"
  echo "so a re-run will skip straight to the permission check."
  exit 1
fi

# Merges onto existing Environment.Variables -- update-function-configuration
# replaces the whole map, so a naive call would wipe every other var.
echo "==> 3/3 Setting DYNAMODB_TABLE_META_DELETION_REQUESTS on ${#LAMBDAS[@]} Lambdas"
for FN in "${LAMBDAS[@]}"; do
  echo "    ${FN}"
  MERGED=$(aws lambda get-function-configuration \
    --function-name "$FN" --region "$REGION" \
    --query 'Environment.Variables' --output json | jq \
    '. + { DYNAMODB_TABLE_META_DELETION_REQUESTS: "meta_deletion_requests" }')
  aws lambda update-function-configuration \
    --function-name "$FN" --region "$REGION" \
    --environment "{\"Variables\":${MERGED}}" --output json >/dev/null
  aws lambda wait function-updated --function-name "$FN" --region "$REGION"
done

echo
echo "Done. Verify with:"
echo "  aws dynamodb describe-table --table-name ${TABLE} --region ${REGION} \\"
echo "    --query 'Table.KeySchema' --output json"
echo "  aws lambda get-function-configuration --function-name rigachat-api --region ${REGION} \\"
echo "    --query 'Environment.Variables.DYNAMODB_TABLE_META_DELETION_REQUESTS' --output text"
