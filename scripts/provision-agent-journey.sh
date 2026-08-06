#!/usr/bin/env bash
# Provisioning for feature/agent-journey-scheduler (Journey / Scheduler / Agent / MCP).
# Derived from the branch's own code, not from docs:
#   - key schemas from each repository's Key:{} / KeyConditionExpression
#   - no GSIs: every one of the 8 tables is primary-key access only
#   - the 3 ARNs come from modules that THROW at import time when unset
#     (lib/eventbridge-scheduler.ts, services/journey-compiler-service.ts)
#
# Verified against account 291685935704 / ap-south-1 on 2026-08-06.
set -euo pipefail

REGION="ap-south-1"
ACCOUNT="291685935704"
LAMBDA_ARN="arn:aws:lambda:${REGION}:${ACCOUNT}:function:rigachat-api"
SCHED_ROLE="RigaChatSchedulerExecutionRole"
SCHED_ROLE_ARN="arn:aws:iam::${ACCOUNT}:role/${SCHED_ROLE}"

LAMBDAS=(rigachat-api rigachat-api-streaming rigachat-crawler)
LAMBDA_ROLES=(rigachat-api-role-4c9qsico rigachat-api-streaming-role-625vca9z)

# name : partition key : sort key ("-" = none)
TABLES=(
  "journeys:botId:bundleId"
  "journey_executions:leadId:stepId"
  "scheduled_actions:clientId:scheduleId"
  "appointment_requests:botId:requestId"
  "agents:clientId:agentId"
  "gupshup_app_lookup:appName:-"
  "whatsapp_inbound_activity:leadId:-"
  "agent_binding_lookup:resourceId:-"
)

echo "==> 1/4 Creating ${#TABLES[@]} DynamoDB tables"
for spec in "${TABLES[@]}"; do
  IFS=':' read -r NAME PK SK <<< "$spec"
  if aws dynamodb describe-table --table-name "$NAME" --region "$REGION" >/dev/null 2>&1; then
    echo "    $NAME already exists, skipping"
    continue
  fi
  if [ "$SK" = "-" ]; then
    ATTRS="AttributeName=${PK},AttributeType=S"
    KEYS="AttributeName=${PK},KeyType=HASH"
  else
    ATTRS="AttributeName=${PK},AttributeType=S AttributeName=${SK},AttributeType=S"
    KEYS="AttributeName=${PK},KeyType=HASH AttributeName=${SK},KeyType=RANGE"
  fi
  echo "    creating $NAME (pk=$PK sk=$SK)"
  # shellcheck disable=SC2086
  aws dynamodb create-table --table-name "$NAME" --region "$REGION" \
    --billing-mode PAY_PER_REQUEST \
    --attribute-definitions $ATTRS --key-schema $KEYS --output json >/dev/null
done

echo "    waiting for all tables to become ACTIVE..."
for spec in "${TABLES[@]}"; do
  IFS=':' read -r NAME _ _ <<< "$spec"
  aws dynamodb wait table-exists --table-name "$NAME" --region "$REGION"
done
echo "    done"

# EventBridge Scheduler assumes this role to invoke the Lambda. It does not
# exist in the account yet (verified: zero roles trusted by scheduler.amazonaws.com,
# zero schedules). scheduler-service.ts passes its ARN on every CreateSchedule.
echo "==> 2/4 Creating the EventBridge Scheduler execution role"
if aws iam get-role --role-name "$SCHED_ROLE" >/dev/null 2>&1; then
  echo "    $SCHED_ROLE already exists, skipping"
else
  aws iam create-role --role-name "$SCHED_ROLE" \
    --assume-role-policy-document '{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": {"Service": "scheduler.amazonaws.com"},
        "Action": "sts:AssumeRole",
        "Condition": {"StringEquals": {"aws:SourceAccount": "'"${ACCOUNT}"'"}}
      }]
    }' --output json >/dev/null
  echo "    created $SCHED_ROLE"
fi

aws iam put-role-policy --role-name "$SCHED_ROLE" \
  --policy-name InvokeRigaChatApi \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": "lambda:InvokeFunction",
      "Resource": ["'"${LAMBDA_ARN}"'", "'"${LAMBDA_ARN}"':*"]
    }]
  }'
echo "    attached InvokeRigaChatApi"

# The app itself creates/updates/deletes schedules, and must be allowed to hand
# the scheduler role to EventBridge (iam:PassRole) when it does.
echo "==> 3/4 Granting the Lambda roles scheduler access"
for ROLE in "${LAMBDA_ROLES[@]}"; do
  aws iam put-role-policy --role-name "$ROLE" \
    --policy-name JourneySchedulerPolicy \
    --policy-document '{
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Action": ["scheduler:CreateSchedule", "scheduler:UpdateSchedule", "scheduler:DeleteSchedule", "scheduler:GetSchedule"],
          "Resource": "*"
        },
        {
          "Effect": "Allow",
          "Action": "iam:PassRole",
          "Resource": "'"${SCHED_ROLE_ARN}"'",
          "Condition": {"StringEquals": {"iam:PassedToService": "scheduler.amazonaws.com"}}
        }
      ]
    }'
  echo "    $ROLE"
done

# Merges onto existing Environment.Variables — update-function-configuration
# replaces the whole map, so a naive call would wipe every other var.
echo "==> 4/4 Setting 11 env vars on ${#LAMBDAS[@]} Lambdas"
for FN in "${LAMBDAS[@]}"; do
  echo "    ${FN}"
  MERGED=$(aws lambda get-function-configuration \
    --function-name "$FN" --region "$REGION" \
    --query 'Environment.Variables' --output json | jq \
    --arg lambda_arn "$LAMBDA_ARN" \
    --arg sched_role "$SCHED_ROLE_ARN" \
    '. + {
      DYNAMODB_TABLE_JOURNEYS: "journeys",
      DYNAMODB_TABLE_JOURNEY_EXECUTIONS: "journey_executions",
      DYNAMODB_TABLE_SCHEDULED_ACTIONS: "scheduled_actions",
      DYNAMODB_TABLE_APPOINTMENT_REQUESTS: "appointment_requests",
      DYNAMODB_TABLE_AGENTS: "agents",
      DYNAMODB_TABLE_AGENT_BINDING_LOOKUP: "agent_binding_lookup",
      DYNAMODB_TABLE_GUPSHUP_APP_LOOKUP: "gupshup_app_lookup",
      DYNAMODB_TABLE_WHATSAPP_INBOUND_ACTIVITY: "whatsapp_inbound_activity",
      SCHEDULER_TARGET_LAMBDA_ARN: $lambda_arn,
      JOURNEY_EXECUTOR_LAMBDA_ARN: $lambda_arn,
      SCHEDULER_EXECUTION_ROLE_ARN: $sched_role
    }')
  aws lambda update-function-configuration \
    --function-name "$FN" --region "$REGION" \
    --environment "{\"Variables\":${MERGED}}" --output json >/dev/null
  aws lambda wait function-updated --function-name "$FN" --region "$REGION"
done

echo
echo "Done. Verify with:"
echo "  aws dynamodb list-tables --region ${REGION} --output json | jq -r '.TableNames[]'"
echo "  aws lambda get-function-configuration --function-name rigachat-api --region ${REGION} \\"
echo "    --query 'Environment.Variables' --output json | jq 'with_entries(select(.key|test(\"JOURNEY|SCHEDUL|AGENT|GUPSHUP|WHATSAPP_INBOUND\")))'"
echo
echo "NOTE: this provisions infra only. The branch is still 22 commits behind main"
echo "and must be rebased before it can be deployed."
