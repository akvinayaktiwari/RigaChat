#!/usr/bin/env bash
# Provisioning for feat/developer-api-keys.
#
# One table. Derived from the code, not from docs:
#   - PK keyHash -- api-key-repository.ts's Key:{ keyHash }. A /v1 request
#                   arrives carrying a key and no clientId, so authenticating it
#                   has to be a point read on the key's hash.
#   - NO SK
#   - GSI clientId-createdAt-index -- the Settings page's "which keys does this
#                   account have?", newest first. Never on the request path.
#
# Like provision-voice-phone-lookup.sh, THIS SCRIPT SETS NO LAMBDA ENVIRONMENT
# VARIABLE and must not grow one. api_keys is registered in lib/table-names.ts
# and resolves at call time.
#
# RUN THIS BEFORE THE CODE DEPLOYS. Nothing reads the table until someone opens
# Settings or calls /v1, but once they do, a missing table is a 500 on both.
#
# Idempotent: safe to re-run.
set -euo pipefail

REGION="ap-south-1"
# Derived, never hardcoded: this repo is public, and an account id is a
# targeting aid nobody needs handed to them.
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
TABLE="${DYNAMODB_TABLE_PREFIX:-}api_keys"

echo "==> 1/2 Creating the ${TABLE} table"
if aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" >/dev/null 2>&1; then
  echo "    $TABLE already exists, skipping"
else
  echo "    creating $TABLE (pk=keyHash, no sk, GSI clientId-createdAt-index)"
  aws dynamodb create-table --table-name "$TABLE" --region "$REGION" \
    --billing-mode PAY_PER_REQUEST \
    --attribute-definitions \
      AttributeName=keyHash,AttributeType=S \
      AttributeName=clientId,AttributeType=S \
      AttributeName=createdAt,AttributeType=S \
    --key-schema \
      AttributeName=keyHash,KeyType=HASH \
    --global-secondary-indexes \
      "IndexName=clientId-createdAt-index,KeySchema=[{AttributeName=clientId,KeyType=HASH},{AttributeName=createdAt,KeyType=RANGE}],Projection={ProjectionType=ALL}" \
    --output json >/dev/null
  echo "    waiting for $TABLE to become ACTIVE..."
  aws dynamodb wait table-exists --table-name "$TABLE" --region "$REGION"
  echo "    done"
fi

# No TTL. The row IS the key: it is deleted when the key is revoked, and a key
# that expired on a timer would take a customer's integration down with no
# action on anyone's part.

echo "==> 2/2 Checking the Lambda roles can reach ${TABLE}"
# simulate-principal-policy, not a grep over inline policies -- see
# provision-voice-phone-lookup.sh for why. The index ARN is checked too: Query
# on a GSI is authorised against the index resource, not the table.
TABLE_ARN="arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/${TABLE}"
for ROLE in rigachat-api-role-4c9qsico rigachat-api-streaming-role-625vca9z; do
  DENIED=$(aws iam simulate-principal-policy \
    --policy-source-arn "arn:aws:iam::${ACCOUNT}:role/${ROLE}" \
    --action-names dynamodb:GetItem dynamodb:PutItem dynamodb:UpdateItem dynamodb:DeleteItem dynamodb:Query \
    --resource-arns "$TABLE_ARN" "${TABLE_ARN}/index/clientId-createdAt-index" \
    --query "EvaluationResults[?EvalDecision!='allowed'].EvalActionName" \
    --output text 2>/dev/null || echo "SIMULATE_FAILED")

  if [ -z "$DENIED" ]; then
    echo "    $ROLE: all five actions allowed on $TABLE and its index"
  elif [ "$DENIED" = "SIMULATE_FAILED" ]; then
    echo "    $ROLE: could not simulate (needs iam:SimulatePrincipalPolicy) -- check by hand"
  else
    echo "    $ROLE: DENIED $DENIED -- grant these on"
    echo "        $TABLE_ARN (and /index/*) before deploying."
  fi
done

echo
echo "Done. NOTE: no Lambda environment variable was set, and none should be."
echo "Verify with:"
echo "  aws dynamodb describe-table --table-name ${TABLE} --region ${REGION} \\"
echo "    --query '{pk:Table.KeySchema,gsi:Table.GlobalSecondaryIndexes[].IndexName}' --output json"
