#!/usr/bin/env bash
# Provisioning for #9 (lead_events append-only log).
#
# One table, two GSIs. Derived from the code, not from docs:
#   - PK leadId, SK ts            -- lead-event-repository.ts's KeyCondition
#   - GSI clientId-ts-index       -- getClientEvents()'s IndexName
#   - GSI wamid-index (SPARSE)    -- getEventByWamid()'s IndexName
#
# The wamid index is sparse on purpose. Only message_out rows carry a wamid, so
# only they appear in it, and DynamoDB charges nothing for the rest. It exists
# because a Meta delivery-status webhook gives you a wamid and a recipient and
# NO leadId. Without this index a "delivered" tick can never be attached to the
# message it belongs to, which is most of what the timeline in #13 is for.
#
# NO TTL, unlike journey_pending_replies. This is the audit record; expiring it
# would defeat the purpose.
#
# Adds NO environment variables. Table names now resolve from
# backend/src/lib/table-names.ts, so nothing here touches the Lambdas' 4KB
# environment. See scripts/consolidate-table-env.sh for the deletion runbook
# that frees the space the old variables occupy.
#
# Idempotent: safe to re-run, and safe to run before or after a deploy, since
# table names resolve at call time.
set -euo pipefail

REGION="${AWS_REGION:-ap-south-1}"
TABLE="lead_events"
CLIENT_INDEX="clientId-ts-index"
WAMID_INDEX="wamid-index"

echo "==> 1/2 Creating the ${TABLE} table"
if aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" >/dev/null 2>&1; then
  echo "    $TABLE already exists, skipping"
else
  echo "    creating $TABLE (pk=leadId, sk=ts, gsi=${CLIENT_INDEX}, sparse gsi=${WAMID_INDEX})"
  aws dynamodb create-table --table-name "$TABLE" --region "$REGION" \
    --billing-mode PAY_PER_REQUEST \
    --attribute-definitions \
      AttributeName=leadId,AttributeType=S \
      AttributeName=ts,AttributeType=S \
      AttributeName=clientId,AttributeType=S \
      AttributeName=wamid,AttributeType=S \
    --key-schema \
      AttributeName=leadId,KeyType=HASH \
      AttributeName=ts,KeyType=RANGE \
    --global-secondary-indexes "[
      {
        \"IndexName\": \"${CLIENT_INDEX}\",
        \"KeySchema\": [
          {\"AttributeName\": \"clientId\", \"KeyType\": \"HASH\"},
          {\"AttributeName\": \"ts\", \"KeyType\": \"RANGE\"}
        ],
        \"Projection\": {\"ProjectionType\": \"ALL\"}
      },
      {
        \"IndexName\": \"${WAMID_INDEX}\",
        \"KeySchema\": [
          {\"AttributeName\": \"wamid\", \"KeyType\": \"HASH\"}
        ],
        \"Projection\": {\"ProjectionType\": \"ALL\"}
      }
    ]" >/dev/null
  echo "    waiting for $TABLE to become ACTIVE"
  aws dynamodb wait table-exists --table-name "$TABLE" --region "$REGION"
fi

echo "==> 2/2 Verifying"
STATUS=$(aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" \
  --query 'Table.TableStatus' --output text)
INDEXES=$(aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" \
  --query 'Table.GlobalSecondaryIndexes[].IndexName' --output text)
echo "    status : $STATUS"
echo "    indexes: ${INDEXES:-none}"

for want in "$CLIENT_INDEX" "$WAMID_INDEX"; do
  case "$INDEXES" in
    *"$want"*) echo "    ok     : $want present" ;;
    *) echo "    MISSING: $want" >&2; exit 1 ;;
  esac
done

echo
echo "Done. No environment variables were added or required."
