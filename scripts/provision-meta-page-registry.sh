#!/usr/bin/env bash
# Provisioning for M1 (issue #27) -- the Meta Page registry.
#
# `meta_page_lookup` ALREADY EXISTS and already holds live rows: it is the
# pageId -> clientId map the shared app-level webhook routes on. This script
# does NOT create it. It adds the one thing M1 needs that the table lacks:
#
#   GSI clientId-connectedAt-index  -- PK clientId, SK connectedAt
#
# Why an index at all: listPagesForClient() answers "which Pages does this
# client have connected", which is the read behind the Page list and the
# picker. Without the index that is a full-table Scan, which is exactly the
# per-message cost W1 exists to delete on the WhatsApp side. Not repeating it
# here.
#
# The three new ATTRIBUTES (pageName, pageAccessTokenEncrypted, lastVerifiedAt)
# need no provisioning -- DynamoDB is schemaless outside the keys. Only
# connectedAt is declared below, because it is now an index key.
#
# NO Lambda environment variable is added. Table names live in
# lib/table-names.ts and resolve at call time; rigachat-api's env sits close to
# the 4KB ceiling and adding to it is how that ceiling gets hit again.
#
# Idempotent: safe to re-run. Creating a GSI on a table that already has it is
# skipped, not an error.
set -euo pipefail

REGION="ap-south-1"
TABLE="meta_page_lookup"
INDEX="clientId-connectedAt-index"

if ! aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" >/dev/null 2>&1; then
  echo "ERROR: $TABLE does not exist." >&2
  echo "       This script extends the live registry; it does not create it." >&2
  exit 1
fi

echo "==> 1/2 Adding GSI ${INDEX} to ${TABLE}"
EXISTING="$(aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" \
  --query "Table.GlobalSecondaryIndexes[?IndexName=='${INDEX}'].IndexName | [0]" \
  --output text 2>/dev/null || echo "None")"

if [ "$EXISTING" = "$INDEX" ]; then
  echo "    $INDEX already exists, skipping"
else
  echo "    creating $INDEX (pk=clientId, sk=connectedAt)"
  aws dynamodb update-table --table-name "$TABLE" --region "$REGION" \
    --attribute-definitions \
      AttributeName=clientId,AttributeType=S \
      AttributeName=connectedAt,AttributeType=S \
    --global-secondary-index-updates \
      "[{\"Create\":{\"IndexName\":\"${INDEX}\",\"KeySchema\":[{\"AttributeName\":\"clientId\",\"KeyType\":\"HASH\"},{\"AttributeName\":\"connectedAt\",\"KeyType\":\"RANGE\"}],\"Projection\":{\"ProjectionType\":\"ALL\"}}}]" \
    --output json >/dev/null

  echo "    waiting for $INDEX to become ACTIVE (index backfill, can take minutes)..."
  until [ "$(aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" \
      --query "Table.GlobalSecondaryIndexes[?IndexName=='${INDEX}'].IndexStatus | [0]" \
      --output text)" = "ACTIVE" ]; do
    sleep 10
  done
  echo "    $INDEX is ACTIVE"
fi

echo "==> 2/2 Verifying"
aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" \
  --query "Table.{Table:TableName,Status:TableStatus,Indexes:GlobalSecondaryIndexes[].{Name:IndexName,Status:IndexStatus}}" \
  --output table

echo
echo "Done. Next: run the backfill so the existing rows carry their own Page token."
echo "  cd backend && npx tsx scripts/backfill-meta-page-registry.ts --dry-run"
