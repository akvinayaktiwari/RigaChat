#!/usr/bin/env bash
# Provisioning for feat/lead-state-and-unified-inbox.
#
# One table. Derived from the code, not from docs:
#   - PK leadId          -- lead-state-repository.ts's Key:{ leadId }
#   - GSI clientId-updatedAt-index
#                        -- getLeadStatesForClient()'s IndexName + KeyCondition
#
# The GSI is keyed on updatedAt, NOT nextActionAt. A nextActionAt-keyed index
# would be sparse, so every lead without a scheduled follow-up -- which is most
# of them -- would silently drop out of the inbox. Queue ordering happens in
# lead-inbox-service.ts after the merge, not in DynamoDB.
#
# Idempotent: safe to re-run, and safe to run before or after a deploy, since
# table names resolve at call time (see commit 4a3a3a9).
set -euo pipefail

REGION="ap-south-1"
ACCOUNT="291685935704"
TABLE="lead_state"
INDEX="clientId-updatedAt-index"
LAMBDAS=(rigachat-api rigachat-api-streaming rigachat-crawler)

echo "==> 1/3 Creating the ${TABLE} table"
if aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" >/dev/null 2>&1; then
  echo "    $TABLE already exists, skipping"
else
  echo "    creating $TABLE (pk=leadId, gsi=${INDEX})"
  aws dynamodb create-table --table-name "$TABLE" --region "$REGION" \
    --billing-mode PAY_PER_REQUEST \
    --attribute-definitions \
      AttributeName=leadId,AttributeType=S \
      AttributeName=clientId,AttributeType=S \
      AttributeName=updatedAt,AttributeType=S \
    --key-schema AttributeName=leadId,KeyType=HASH \
    --global-secondary-indexes "[{
      \"IndexName\": \"${INDEX}\",
      \"KeySchema\": [
        {\"AttributeName\": \"clientId\", \"KeyType\": \"HASH\"},
        {\"AttributeName\": \"updatedAt\", \"KeyType\": \"RANGE\"}
      ],
      \"Projection\": {\"ProjectionType\": \"ALL\"}
    }]" --output json >/dev/null
  echo "    waiting for $TABLE to become ACTIVE..."
  aws dynamodb wait table-exists --table-name "$TABLE" --region "$REGION"
  echo "    done"
fi

# No TTL. Lead state outlives the lead's active period on purpose -- a closed
# lead's outcome and notes are the only record of why it closed.

echo "==> 2/3 Checking the Lambda roles can reach ${TABLE}"
# The existing roles carry a broad DynamoDB policy rather than per-table grants,
# so a new table normally needs no IAM change. This verifies that assumption
# instead of assuming it: a Resource that names tables explicitly would silently
# deny the new one at runtime, which surfaces as a 500 on /api/leads/inbox.
for ROLE in rigachat-api-role-4c9qsico rigachat-api-streaming-role-625vca9z; do
  RESOURCES=$(aws iam list-role-policies --role-name "$ROLE" --query 'PolicyNames[]' --output text 2>/dev/null || echo "")
  COVERED="no"
  for POLICY in $RESOURCES; do
    DOC=$(aws iam get-role-policy --role-name "$ROLE" --policy-name "$POLICY" \
      --query 'PolicyDocument' --output json 2>/dev/null || echo '{}')
    if echo "$DOC" | grep -q 'dynamodb' && echo "$DOC" | grep -qE '"\*"|table/\*'; then
      COVERED="yes"
      break
    fi
  done
  if [ "$COVERED" = "yes" ]; then
    echo "    $ROLE: wildcard DynamoDB access, no change needed"
  else
    echo "    $ROLE: NO wildcard DynamoDB grant found -- add ${TABLE} and its"
    echo "        index (arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/${TABLE},"
    echo "        .../table/${TABLE}/index/${INDEX}) to its policy before deploying."
  fi
done

# Merges onto existing Environment.Variables -- update-function-configuration
# replaces the whole map, so a naive call would wipe every other var.
echo "==> 3/3 Setting DYNAMODB_TABLE_LEAD_STATE on ${#LAMBDAS[@]} Lambdas"
for FN in "${LAMBDAS[@]}"; do
  echo "    ${FN}"
  MERGED=$(aws lambda get-function-configuration \
    --function-name "$FN" --region "$REGION" \
    --query 'Environment.Variables' --output json | jq \
    '. + { DYNAMODB_TABLE_LEAD_STATE: "lead_state" }')
  aws lambda update-function-configuration \
    --function-name "$FN" --region "$REGION" \
    --environment "{\"Variables\":${MERGED}}" --output json >/dev/null
  aws lambda wait function-updated --function-name "$FN" --region "$REGION"
done

echo
echo "Done. Verify with:"
echo "  aws dynamodb describe-table --table-name ${TABLE} --region ${REGION} \\"
echo "    --query '{pk:KeySchema,gsi:GlobalSecondaryIndexes[].IndexName}' --output json"
echo "  aws lambda get-function-configuration --function-name rigachat-api --region ${REGION} \\"
echo "    --query 'Environment.Variables.DYNAMODB_TABLE_LEAD_STATE' --output text"
