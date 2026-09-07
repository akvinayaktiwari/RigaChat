#!/bin/bash
set -e

# The EC2 voice relay's IAM role, brought up to what the telephony path
# actually does.
#
# WHY THIS EXISTS
#
# The role was created when the relay only answered browser calls: it read
# voice_agents and wrote one row per call to voice_call_logs, so
# AmazonDynamoDBReadOnlyAccess plus a single-table write policy was exactly
# right. Telephony changed that. A phone call now resolves the caller to a
# lead, writes the lead, and appends every turn of the conversation to
# lead_events.
#
# None of those writes are permitted today, and NONE OF THEM FAIL LOUDLY.
# VoiceSession deliberately swallows CRM errors so a DynamoDB problem cannot
# drop a live call (see resolveIdentity and withIdentity in
# voice-relay/session.ts). The result without this policy: the phone rings, the
# agent answers, the caller is helped, and no record of any of it is ever
# written. The dashboard shows nothing and nothing errors.
#
# Read access is left to the managed read-only policy already attached. Only
# the writes are enumerated here, and only for the tables the call path
# actually writes to.

REGION="ap-south-1"
# Derived, never hardcoded: this repo is public, and an account id is a
# targeting aid nobody needs handed to them.
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
ROLE="vyostra-voice-relay-role"
POLICY_NAME="voice-relay-crm-writes"

# voice_call_logs is included even though the existing inline policy
# voice-call-logs-write already covers it: this policy should describe
# everything the call path writes, so that older single-purpose one can be
# deleted once this is verified, rather than leaving the truth split in two.
TABLES=(voice_leads lead_events lead_state voice_call_logs)

echo "==> 1/3 Building the write policy for ${ROLE}"

RESOURCES=""
for T in "${TABLES[@]}"; do
  RESOURCES="${RESOURCES}\"arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/${T}\","
done
# lead_events is read back through its GSIs by the identity join, and a Query
# against an index needs the index ARN as well as the table's.
RESOURCES="${RESOURCES}\"arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/lead_events/index/*\""

POLICY_DOC=$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "VoiceRelayCrmWrites",
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:GetItem",
        "dynamodb:Query"
      ],
      "Resource": [${RESOURCES}]
    }
  ]
}
JSON
)

echo "$POLICY_DOC" | python3 -m json.tool > /dev/null || {
  echo "    generated policy is not valid JSON, refusing to apply"
  exit 1
}

echo "==> 2/3 Attaching it as an inline policy"
aws iam put-role-policy \
  --role-name "$ROLE" \
  --policy-name "$POLICY_NAME" \
  --policy-document "$POLICY_DOC"
echo "    ${POLICY_NAME} written to ${ROLE}"

echo "==> 3/3 Verifying the writes are now allowed"
# simulate-principal-policy rather than trusting the put: IAM is eventually
# consistent, and a policy that reads correctly can still evaluate to a deny
# if something else denies explicitly.
FAILED=0
for T in "${TABLES[@]}"; do
  DECISION=$(aws iam simulate-principal-policy \
    --policy-source-arn "arn:aws:iam::${ACCOUNT}:role/${ROLE}" \
    --action-names dynamodb:PutItem \
    --resource-arns "arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/${T}" \
    --query "EvaluationResults[0].EvalDecision" --output text)
  if [ "$DECISION" = "allowed" ]; then
    echo "    ${T}: allowed"
  else
    echo "    ${T}: ${DECISION}  <-- still denied"
    FAILED=1
  fi
done

if [ "$FAILED" = "1" ]; then
  echo
  echo "Some writes are still denied. IAM is eventually consistent -- wait a"
  echo "few seconds and re-run before investigating."
  exit 1
fi

echo
echo "Done. The relay can now record a call against a lead."
echo
echo "Restart the relay process afterwards: the instance role's credentials"
echo "are cached by the SDK for the lifetime of the process, so a running"
echo "relay keeps using the old ones."
