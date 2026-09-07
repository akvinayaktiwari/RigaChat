#!/bin/bash
set -e

# Makes the voice relay box deployable without SSH keys.
#
# WHY SSM RATHER THAN SSH
#
# The relay has always been deployed by hand -- no script in this repo ships
# dist/voice-relay.js anywhere (see docs/INFRASTRUCTURE.md). The two ways to
# fix that are SSH with the existing key pair, or SSM Run Command. SSM wins for
# one reason that matters more than convenience: it needs no long-lived private
# key sitting in a CI secret for an internet-facing box. An IAM role is enough,
# and access is logged per command.
#
# Run this ONCE. After it, scripts/deploy-voice-relay.sh works from any machine
# with AWS credentials, and later from CI with nothing but a role.
#
# What it changes:
#   - attaches AmazonSSMManagedInstanceCore to the instance role
#   - creates a private artifact bucket (SSM Run Command cannot carry a 3.5MB
#     bundle in a command parameter, so the file goes via S3)
#   - grants the role read on that bucket only
#
# It does NOT change any security group rule. Narrowing inbound access once SSM
# works is a good follow-up, but it is a separate, riskier decision -- if SSM is
# misconfigured and SSH is shut at the same time, the box is unreachable.

REGION="ap-south-1"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
INSTANCE_TAG="${VOICE_RELAY_INSTANCE_TAG:-vyostra-voice-relay}"
ROLE="vyostra-voice-relay-role"
BUCKET="${VOICE_RELAY_ARTIFACT_BUCKET:-vyostra-deploy-artifacts-${ACCOUNT}}"
POLICY_NAME="voice-relay-artifact-read"

# Resolved by tag rather than hardcoded: this repo is public, and an instance id
# plus a public IP is a targeting aid nobody needs handed to them -- the same
# reason the account id above is derived. It also survives the box being
# replaced, which a pinned id does not.
resolve_instance() {
  if [ -n "${VOICE_RELAY_INSTANCE_ID:-}" ]; then
    echo "$VOICE_RELAY_INSTANCE_ID"
    return
  fi
  aws ec2 describe-instances --region "$REGION" \
    --filters "Name=tag:Name,Values=${INSTANCE_TAG}" \
              "Name=instance-state-name,Values=running" \
    --query 'Reservations[].Instances[0].InstanceId' --output text 2>/dev/null | head -1
}

INSTANCE="$(resolve_instance)"
if [ -z "$INSTANCE" ] || [ "$INSTANCE" = "None" ]; then
  echo "No running instance tagged Name=${INSTANCE_TAG} in ${REGION}."
  echo "Set VOICE_RELAY_INSTANCE_ID if the host is tagged differently."
  exit 1
fi

echo "==> 1/5 Target instance"
echo "    ${INSTANCE} (tagged ${INSTANCE_TAG})"

echo "==> 2/5 Attaching AmazonSSMManagedInstanceCore to ${ROLE}"
# Idempotent: attach-role-policy on an already-attached policy is a no-op.
aws iam attach-role-policy \
  --role-name "$ROLE" \
  --policy-arn "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
echo "    attached"

echo "==> 3/5 Creating the artifact bucket ${BUCKET}"
if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "    already exists, skipping"
else
  aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION" >/dev/null
  # Public access blocked explicitly rather than relying on the account
  # default: this bucket holds deployable code, and a readable one is a
  # supply-chain problem, not just an information leak.
  aws s3api put-public-access-block --bucket "$BUCKET" \
    --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
  # Versioning so a bad deploy can be rolled back to the exact previous bundle
  # rather than to whatever a rebuild of an older commit happens to produce.
  aws s3api put-bucket-versioning --bucket "$BUCKET" \
    --versioning-configuration Status=Enabled
  echo "    created, private, versioned"
fi

echo "==> 4/5 Granting ${ROLE} read on that bucket only"
aws iam put-role-policy \
  --role-name "$ROLE" \
  --policy-name "$POLICY_NAME" \
  --policy-document "$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadDeployArtifacts",
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::${BUCKET}/voice-relay/*"
    },
    {
      "Sid": "ListDeployArtifacts",
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::${BUCKET}",
      "Condition": { "StringLike": { "s3:prefix": "voice-relay/*" } }
    }
  ]
}
JSON
)"
echo "    ${POLICY_NAME} written"

echo "==> 5/5 Waiting for the SSM agent to register"
# The agent ships preinstalled on Canonical's Ubuntu 24.04 images but only
# registers once the instance profile lets it. That is a poll, not an instant:
# credentials propagate and the agent retries on its own schedule.
echo "    (preinstalled on Ubuntu 24.04; it registers once credentials reach it)"
for I in $(seq 1 30); do
  PING=$(aws ssm describe-instance-information --region "$REGION" \
    --filters "Key=InstanceIds,Values=${INSTANCE}" \
    --query 'InstanceInformationList[0].PingStatus' --output text 2>/dev/null || echo "None")
  if [ "$PING" = "Online" ]; then
    echo "    registered and Online after ~$((I * 10))s"
    echo
    echo "Done. Next:"
    echo "  ./scripts/deploy-voice-relay.sh --probe    # learn the box's layout"
    echo "  ./scripts/deploy-voice-relay.sh            # build, ship, restart"
    exit 0
  fi
  sleep 10
done

echo
echo "The agent has not registered after 5 minutes. The IAM changes above are"
echo "still correct and safe to leave in place. Check on the box:"
echo "  sudo snap services amazon-ssm-agent"
echo "  sudo snap restart amazon-ssm-agent"
echo "A restart is often all it needs -- the agent caches a failed credential"
echo "lookup from before the role was attached."
exit 1
