#!/usr/bin/env bash
# Provisioning for feature/agent-journey-scheduler (Journey / Scheduler / Agent / MCP).
# Derived from the branch's own code, not from docs:
#   - key schemas from each repository's Key:{} / KeyConditionExpression
#   - no GSIs: every one of the 10 tables is primary-key access only
#   - the 4 ARNs come from lib/eventbridge-scheduler.ts, lib/step-functions.ts
#     and services/journey-compiler-service.ts
#
# Env vars are now resolved at CALL time rather than at module load, so a
# missing one breaks only its own feature instead of 500-ing every route. That
# makes this script safe to run before or after a deploy, in either order.
#
# Verified against ap-south-1 on 2026-08-06.
set -euo pipefail

REGION="ap-south-1"
# Derived, never hardcoded: this repo is public, and an account id is a
# targeting aid nobody needs handed to them. Also makes the script work
# against any account rather than only the one it was written on.
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
LAMBDA_ARN="arn:aws:lambda:${REGION}:${ACCOUNT}:function:rigachat-api"
SCHED_ROLE="RigaChatSchedulerExecutionRole"
SCHED_ROLE_ARN="arn:aws:iam::${ACCOUNT}:role/${SCHED_ROLE}"
# Step Functions assumes this to invoke the journey executor Lambda. Separate
# from SCHED_ROLE because the trust policy names a different principal
# (states.amazonaws.com vs scheduler.amazonaws.com) -- one role cannot serve both.
SFN_ROLE="RigaChatJourneyStateMachineRole"
SFN_ROLE_ARN="arn:aws:iam::${ACCOUNT}:role/${SFN_ROLE}"

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
  # Exactly one published bundle owns an (Agent, trigger). Also the ignition
  # index: "which journey runs for this lead" is a point read on this table.
  "journey_trigger_claims:claimKey:-"
  # Step Functions callback tokens for executions parked on an await_reply step,
  # keyed by lead so the inbound WhatsApp handler can find them. TTL is enabled
  # on expiresAt below -- a timed-out execution has no callback to tell us to
  # delete its row, so nothing else would ever clean these up.
  "journey_pending_replies:leadId:-"
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

# Only journey_pending_replies has a TTL. Its rows point at Step Functions
# callback tokens, and an execution that times out never calls back, so without
# this the table would accumulate dead tokens forever.
TTL_STATUS=$(aws dynamodb describe-time-to-live --table-name journey_pending_replies --region "$REGION" \
  --query 'TimeToLiveDescription.TimeToLiveStatus' --output text 2>/dev/null || echo NONE)
if [ "$TTL_STATUS" = "ENABLED" ] || [ "$TTL_STATUS" = "ENABLING" ]; then
  echo "    TTL already $TTL_STATUS on journey_pending_replies, skipping"
else
  echo "    enabling TTL on journey_pending_replies (expiresAt)"
  aws dynamodb update-time-to-live --table-name journey_pending_replies --region "$REGION" \
    --time-to-live-specification "Enabled=true,AttributeName=expiresAt" --output json >/dev/null
fi

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

# Step Functions assumes this role to invoke the journey executor Lambda from a
# compiled Task state. Same shape as the scheduler role above, different trust
# principal.
if aws iam get-role --role-name "$SFN_ROLE" >/dev/null 2>&1; then
  echo "    $SFN_ROLE already exists, skipping"
else
  echo "    creating $SFN_ROLE"
  aws iam create-role --role-name "$SFN_ROLE" \
    --assume-role-policy-document '{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": {"Service": "states.amazonaws.com"},
        "Action": "sts:AssumeRole"
      }]
    }' --output json >/dev/null
fi

aws iam put-role-policy --role-name "$SFN_ROLE" \
  --policy-name InvokeRigaChatApi \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": "lambda:InvokeFunction",
      "Resource": "'"${LAMBDA_ARN}"'"
    }]
  }'
echo "    attached InvokeRigaChatApi to $SFN_ROLE"

# The app itself creates/updates/deletes schedules and state machines, and must
# be allowed to hand each service its own role (iam:PassRole) when it does.
echo "==> 3/4 Granting the Lambda roles scheduler + Step Functions access"
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
  # publishJourneyBundle creates/updates a state machine and publishes an
  # immutable version; igniteJourneysForLead starts executions against it.
  # DescribeStateMachine is not used by the app but makes manual debugging in
  # the console possible without another policy edit.
  aws iam put-role-policy --role-name "$ROLE" \
    --policy-name JourneyStateMachinePolicy \
    --policy-document '{
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Action": [
            "states:CreateStateMachine",
            "states:UpdateStateMachine",
            "states:DeleteStateMachine",
            "states:DescribeStateMachine",
            "states:PublishStateMachineVersion",
            "states:ListStateMachineVersions",
            "states:StartExecution",
            "states:DescribeExecution",
            "states:StopExecution",
            "states:TagResource",
            "states:SendTaskSuccess",
            "states:SendTaskFailure",
            "states:SendTaskHeartbeat"
          ],
          "Resource": "*"
        },
        {
          "Effect": "Allow",
          "Action": "iam:PassRole",
          "Resource": "'"${SFN_ROLE_ARN}"'",
          "Condition": {"StringEquals": {"iam:PassedToService": "states.amazonaws.com"}}
        }
      ]
    }'
  echo "    $ROLE"
done

# Merges onto existing Environment.Variables — update-function-configuration
# replaces the whole map, so a naive call would wipe every other var.
echo "==> 4/4 Setting 14 env vars on ${#LAMBDAS[@]} Lambdas"
for FN in "${LAMBDAS[@]}"; do
  echo "    ${FN}"
  MERGED=$(aws lambda get-function-configuration \
    --function-name "$FN" --region "$REGION" \
    --query 'Environment.Variables' --output json | jq \
    --arg lambda_arn "$LAMBDA_ARN" \
    --arg sched_role "$SCHED_ROLE_ARN" \
    --arg sfn_role "$SFN_ROLE_ARN" \
    '. + {
      DYNAMODB_TABLE_JOURNEYS: "journeys",
      DYNAMODB_TABLE_JOURNEY_EXECUTIONS: "journey_executions",
      DYNAMODB_TABLE_JOURNEY_TRIGGER_CLAIMS: "journey_trigger_claims",
      DYNAMODB_TABLE_JOURNEY_PENDING_REPLIES: "journey_pending_replies",
      DYNAMODB_TABLE_SCHEDULED_ACTIONS: "scheduled_actions",
      DYNAMODB_TABLE_APPOINTMENT_REQUESTS: "appointment_requests",
      DYNAMODB_TABLE_AGENTS: "agents",
      DYNAMODB_TABLE_AGENT_BINDING_LOOKUP: "agent_binding_lookup",
      DYNAMODB_TABLE_GUPSHUP_APP_LOOKUP: "gupshup_app_lookup",
      DYNAMODB_TABLE_WHATSAPP_INBOUND_ACTIVITY: "whatsapp_inbound_activity",
      SCHEDULER_TARGET_LAMBDA_ARN: $lambda_arn,
      JOURNEY_EXECUTOR_LAMBDA_ARN: $lambda_arn,
      SCHEDULER_EXECUTION_ROLE_ARN: $sched_role,
      JOURNEY_STATE_MACHINE_ROLE_ARN: $sfn_role
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
echo "NOTE: this provisions infra only. Walk the post-provisioning checklist in"
echo "docs/DEPLOYMENT.md next -- check env vars by exact name, not by regex."
