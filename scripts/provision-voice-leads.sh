#!/usr/bin/env bash
# Provisioning for the voice lead source (feat/voice-agent-telephony).
#
# One table. Derived from the code, not from docs:
#   - PK clientId    -- voice-lead-repository.ts's Key:{ clientId, leadId }
#   - SK leadId
#   - GSI clientId-createdAt-index -- the inbox lists newest-first per client
#
# Partitioned by clientId, NOT by agentId, deliberately matching meta_leads.
# LeadRef carries the agentId as a DISCRIMINATOR, never as an address. Getting
# this backwards is not a lookup that returns nothing -- DynamoDB rejects a Key
# built from a non-key attribute outright, which is exactly how every Meta lead
# detail page came to throw while the list beside it worked.
#
# Sets no Lambda environment variable and must not grow one: voice_leads is
# registered in lib/table-names.ts and resolves at call time. rigachat-api sits
# at 3597 of 4096 environment bytes.
#
# Idempotent: safe to re-run.
set -euo pipefail

REGION="ap-south-1"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
TABLE="voice_leads"

echo "==> 1/2 Creating the ${TABLE} table"
if aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" >/dev/null 2>&1; then
  echo "    $TABLE already exists, skipping"
else
  echo "    creating $TABLE (pk=clientId, sk=leadId, GSI clientId-createdAt-index)"
  aws dynamodb create-table --table-name "$TABLE" --region "$REGION" \
    --billing-mode PAY_PER_REQUEST \
    --attribute-definitions \
      AttributeName=clientId,AttributeType=S \
      AttributeName=leadId,AttributeType=S \
      AttributeName=createdAt,AttributeType=S \
    --key-schema \
      AttributeName=clientId,KeyType=HASH \
      AttributeName=leadId,KeyType=RANGE \
    --global-secondary-indexes \
      '[{"IndexName":"clientId-createdAt-index","KeySchema":[{"AttributeName":"clientId","KeyType":"HASH"},{"AttributeName":"createdAt","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}}]' \
    --output json >/dev/null
  echo "    waiting for $TABLE to become ACTIVE..."
  aws dynamodb wait table-exists --table-name "$TABLE" --region "$REGION"
  echo "    done"
fi

# No TTL. This is a CRM record of a real person who called a real business.

echo "==> 2/2 Checking the Lambda roles can reach ${TABLE}"
TABLE_ARN="arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/${TABLE}"
for ROLE in rigachat-api-role-4c9qsico rigachat-api-streaming-role-625vca9z; do
  DENIED=$(aws iam simulate-principal-policy \
    --policy-source-arn "arn:aws:iam::${ACCOUNT}:role/${ROLE}" \
    --action-names dynamodb:GetItem dynamodb:PutItem dynamodb:Query dynamodb:DeleteItem \
    --resource-arns "$TABLE_ARN" "${TABLE_ARN}/index/clientId-createdAt-index" \
    --query "EvaluationResults[?EvalDecision!='allowed'].EvalActionName" \
    --output text 2>/dev/null || echo "SIMULATE_FAILED")

  if [ -z "$DENIED" ]; then
    echo "    $ROLE: GetItem/PutItem/Query/DeleteItem allowed on $TABLE"
  elif [ "$DENIED" = "SIMULATE_FAILED" ]; then
    echo "    $ROLE: could not simulate (needs iam:SimulatePrincipalPolicy) -- check by hand"
  else
    echo "    $ROLE: DENIED $DENIED -- grant these on $TABLE_ARN before deploying."
  fi
done

echo
echo "NOTE: the voice relay WRITES here too, under its own EC2 instance role --"
echo "      not a Lambda role. Confirm it has PutItem/Query on:"
echo "        $TABLE_ARN"
echo "      Without it every call fails to record a lead, and the failure is"
echo "      swallowed so the call itself survives -- so nothing will look broken."
