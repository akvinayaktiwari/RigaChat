#!/usr/bin/env bash
# Adds the bundleId-ts GSI to the existing lead_events table.
#
# WHY: every journey event already carried a bundleId -- journey_started,
# journey_step, tool_call, handoff, message_out all write one -- but the table
# is partitioned by leadId, so the data could only ever be read one lead at a
# time. Answering "what has this journey actually done" meant scanning the whole
# table by hand in the AWS console. This index is the entire read path for the
# executions view; nothing about how events are WRITTEN changes.
#
# SPARSE on purpose, like wamid-index. Only journey events carry a bundleId, so
# plain message and delivery-status rows never enter the index and DynamoDB
# charges nothing for them.
#
# Adds NO environment variables. Table names resolve from
# backend/src/lib/table-names.ts, and the Lambda environment is at 3597/4096
# bytes -- see the ceiling note in that file.
#
# Idempotent: re-running once the index exists is a no-op.
#
# NOTE: DynamoDB allows only ONE index creation at a time per table, and
# backfilling an existing table is asynchronous. The table stays fully readable
# and writable throughout; the new index just returns partial results until the
# backfill finishes. At current volume (~240 rows) that is seconds.
set -euo pipefail

REGION="${AWS_REGION:-ap-south-1}"
TABLE="${DYNAMODB_TABLE_PREFIX:-}lead_events"
BUNDLE_INDEX="bundleId-ts-index"

echo "==> Adding ${BUNDLE_INDEX} to ${TABLE}"

if ! aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" >/dev/null 2>&1; then
  echo "    ERROR: $TABLE does not exist. Run scripts/provision-lead-events.sh first." >&2
  exit 1
fi

EXISTING=$(aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" \
  --query "Table.GlobalSecondaryIndexes[?IndexName=='${BUNDLE_INDEX}'].IndexName | [0]" \
  --output text 2>/dev/null || echo "None")

if [ "$EXISTING" = "$BUNDLE_INDEX" ]; then
  echo "    $BUNDLE_INDEX already exists, skipping"
else
  echo "    creating $BUNDLE_INDEX (pk=bundleId, sk=ts, sparse)"
  aws dynamodb update-table --table-name "$TABLE" --region "$REGION" \
    --attribute-definitions \
      AttributeName=bundleId,AttributeType=S \
      AttributeName=ts,AttributeType=S \
    --global-secondary-index-updates "[{
      \"Create\": {
        \"IndexName\": \"${BUNDLE_INDEX}\",
        \"KeySchema\": [
          {\"AttributeName\": \"bundleId\", \"KeyType\": \"HASH\"},
          {\"AttributeName\": \"ts\", \"KeyType\": \"RANGE\"}
        ],
        \"Projection\": {\"ProjectionType\": \"ALL\"}
      }
    }]" >/dev/null

  echo "    waiting for the backfill to finish..."
  # No `aws dynamodb wait` exists for index creation, so poll the index status.
  for _ in $(seq 1 60); do
    STATUS=$(aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" \
      --query "Table.GlobalSecondaryIndexes[?IndexName=='${BUNDLE_INDEX}'].IndexStatus | [0]" \
      --output text 2>/dev/null || echo "UNKNOWN")
    [ "$STATUS" = "ACTIVE" ] && break
    printf '    index status: %s\n' "$STATUS"
    sleep 10
  done
fi

echo
echo "==> Done. Verify with:"
echo "    aws dynamodb describe-table --table-name $TABLE --region $REGION \\"
echo "      --query \"Table.GlobalSecondaryIndexes[].{name:IndexName,status:IndexStatus}\""
echo
echo "    IMPORTANT: journeys published BEFORE this change have no terminal"
echo "    state in their compiled state machine, so their runs will show as"
echo "    'running' forever. Republish each live journey to pick it up."
