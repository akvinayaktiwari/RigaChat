#!/bin/bash
set -e

# Narrows the voice relay's inbound security-group rules to the minimum a box
# serving one service behind Caddy actually needs.
#
# DRY RUN BY DEFAULT. It prints every rule it would revoke and authorise and
# then stops. Nothing changes without --apply.
#
#   ./scripts/provision-voice-relay-sg.sh            report the diff, change nothing
#   ./scripts/provision-voice-relay-sg.sh --apply    apply it
#
# WHY THIS IS SAFE TO DO NOW, AND WAS NOT BEFORE
#
# Closing SSH used to mean losing the only way onto the box. It no longer does:
# scripts/provision-voice-relay-ssm.sh put the instance on SSM Run Command, and
# scripts/deploy-voice-relay.sh deploys through it. That is the whole reason the
# SSM work came first -- provision-voice-relay-ssm.sh says explicitly that it
# changes no security-group rule because shutting SSH while SSM is
# misconfigured leaves the box unreachable.
#
# SO: VERIFY SSM WORKS BEFORE RUNNING THIS WITH --apply.
#
#   aws ssm describe-instance-information --region ap-south-1 \
#     --filters "Key=InstanceIds,Values=<instance>" \
#     --query 'InstanceInformationList[0].PingStatus'
#
# It must say Online. The script checks this itself and refuses --apply if it
# does not, but check it yourself too -- Online means the agent is registered,
# not that a command has ever succeeded. `./scripts/deploy-voice-relay.sh
# --probe` is the real proof, because it actually runs one.
#
# THE MINIMUM SET, AND WHY EACH RULE IS IN IT
#
#   443/tcp  from anywhere  -- Caddy terminates TLS here and proxies to 3100.
#                              It cannot be narrowed to Plivo's ranges: the
#                              browser widget's WebSocket also arrives on 443,
#                              from whatever network the visitor is on.
#   80/tcp   from anywhere  -- Caddy's ACME HTTP-01 challenge and the redirect
#                              to 443. Closing it looks tidy and then the
#                              certificate silently fails to renew 60 days
#                              later, which takes browser voice and telephony
#                              down together. Leave it open unless you have
#                              confirmed Caddy is issuing over TLS-ALPN-01.
#
# Everything else goes. Specifically:
#
#   22/tcp   -- SSM replaces it. This is the rule the exercise is about.
#   3100/tcp -- the relay's own port. Caddy reaches it over loopback; an
#               inbound rule for it exposes the unterminated HTTP/WS listener
#               directly, bypassing TLS.
#   any other port, and any ICMP or all-traffic rule.
#
# Egress is left alone. The relay dials out to OpenAI, the Lambda Function URL,
# DynamoDB and Plivo's API, and restricting that to a set of addresses those
# four are free to change is a self-inflicted outage waiting for a Tuesday.

REGION="ap-south-1"
INSTANCE_TAG="${VOICE_RELAY_INSTANCE_TAG:-vyostra-voice-relay}"

APPLY=false
for ARG in "$@"; do
  case "$ARG" in
    --apply) APPLY=true ;;
    -h|--help)
      echo "Usage: $0 [--apply]"
      echo
      echo "  (no flag)  Print the rules that would be revoked and authorised."
      echo "  --apply    Actually change them. Requires SSM to be Online."
      echo
      echo "Overrides: VOICE_RELAY_INSTANCE_TAG, VOICE_RELAY_INSTANCE_ID,"
      echo "           VOICE_RELAY_SG_ID"
      exit 0
      ;;
    *) echo "Unknown argument: $ARG (try --help)"; exit 1 ;;
  esac
done

# Resolved by tag rather than hardcoded: this repo is public, and an instance id
# plus a public IP is a targeting aid nobody needs handed to them. It also
# survives the box being replaced, which a pinned id does not.
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

if [ -n "${VOICE_RELAY_SG_ID:-}" ]; then
  SG="$VOICE_RELAY_SG_ID"
else
  # One group expected. If the box has several, say so rather than silently
  # editing the first -- the others would keep whatever they allow, and the
  # report would claim a narrowing that did not happen.
  SG_LIST=$(aws ec2 describe-instances --region "$REGION" \
    --instance-ids "$INSTANCE" \
    --query 'Reservations[].Instances[].SecurityGroups[].GroupId' --output text)
  SG_COUNT=$(echo "$SG_LIST" | wc -w | tr -d ' ')
  if [ "$SG_COUNT" -ne 1 ]; then
    echo "The instance has ${SG_COUNT} security groups: ${SG_LIST}"
    echo "Inbound access is the union of all of them, so narrowing one proves"
    echo "nothing. Set VOICE_RELAY_SG_ID and run this once per group, or"
    echo "consolidate them first."
    exit 1
  fi
  SG="$SG_LIST"
fi

echo "==> Instance ${INSTANCE}, security group ${SG}"

# --- what it allows now -------------------------------------------------------
# One line per (protocol, from, to, cidr) so the diff below is a set operation
# on comparable strings rather than a JSON comparison. IPv6 ranges are read as
# well as IPv4: a v6 rule opening 22 is exactly as open as a v4 one, and reading
# only IpRanges is how a "closed" port stays reachable.
CURRENT=$(aws ec2 describe-security-groups --region "$REGION" --group-ids "$SG" \
  --query 'SecurityGroups[0].IpPermissions[]' --output json)

# Parsed in one shot into a variable, not straight into a loop: a
# command-substitution assignment fails the script under `set -e`, where a
# pipeline inside a while loop does not -- and a parser that dies quietly
# reports a wide-open group as having no rules at all, which reads as "already
# minimal". That exact failure happened while writing this.
PARSED=$(echo "$CURRENT" | python3 -c '
import json, sys
for perm in json.load(sys.stdin):
    proto = perm.get("IpProtocol")
    lo = perm.get("FromPort", "all")
    hi = perm.get("ToPort", "all")
    sources = (
        [("v4", r["CidrIp"]) for r in perm.get("IpRanges", [])]
        + [("v6", r["CidrIpv6"]) for r in perm.get("Ipv6Ranges", [])]
        + [("sg", g["GroupId"]) for g in perm.get("UserIdGroupPairs", [])]
        + [("pl", p["PrefixListId"]) for p in perm.get("PrefixListIds", [])]
    )
    for kind, source in sources:
        print("%s|%s|%s|%s|%s" % (proto, lo, hi, kind, source))
')

# An array via a while loop rather than `readarray`: this runs from a laptop,
# and macOS still ships bash 3.2, where readarray does not exist.
RULES=()
while IFS= read -r LINE; do
  [ -n "$LINE" ] && RULES+=("$LINE")
done <<< "$PARSED"

# --- what it should allow -----------------------------------------------------
KEEP=(
  "tcp|443|443|v4|0.0.0.0/0"
  "tcp|443|443|v6|::/0"
  "tcp|80|80|v4|0.0.0.0/0"
  "tcp|80|80|v6|::/0"
)

in_keep() {
  local rule="$1"
  for K in "${KEEP[@]}"; do
    [ "$K" = "$rule" ] && return 0
  done
  return 1
}

has_rule() {
  local rule="$1"
  for R in "${RULES[@]}"; do
    [ "$R" = "$rule" ] && return 0
  done
  return 1
}

describe_rule() {
  # tcp|22|22|v4|0.0.0.0/0 -> "tcp 22 from 0.0.0.0/0"
  local IFS='|'
  read -r proto lo hi _kind cidr <<< "$1"
  # -1 is how EC2 spells "every protocol", and printing it raw reads as a port.
  [ "$proto" = "-1" ] && proto="all-traffic"
  if [ "$lo" = "all" ]; then
    echo "${proto} all ports from ${cidr}"
  elif [ "$lo" = "$hi" ]; then
    echo "${proto} ${lo} from ${cidr}"
  else
    echo "${proto} ${lo}-${hi} from ${cidr}"
  fi
}

REVOKE=()
for R in "${RULES[@]}"; do
  in_keep "$R" || REVOKE+=("$R")
done

ADD=()
for K in "${KEEP[@]}"; do
  has_rule "$K" || ADD+=("$K")
done

echo
echo "==> Currently allowed inbound (${#RULES[@]} rules)"
for R in "${RULES[@]}"; do echo "    $(describe_rule "$R")"; done

echo
if [ ${#ADD[@]} -eq 0 ]; then
  echo "==> Would authorise: nothing (both serving ports already open)"
else
  echo "==> Would AUTHORISE ${#ADD[@]}"
  for R in "${ADD[@]}"; do echo "    + $(describe_rule "$R")"; done
fi

echo
if [ ${#REVOKE[@]} -eq 0 ]; then
  echo "==> Would revoke: nothing. The group is already at the minimum."
  exit 0
fi
echo "==> Would REVOKE ${#REVOKE[@]}"
for R in "${REVOKE[@]}"; do
  LABEL=""
  case "$R" in
    tcp\|22\|22\|*)     LABEL="  <- SSH. SSM replaces it; see the header." ;;
    tcp\|3100\|3100\|*) LABEL="  <- the relay's own port, exposed past Caddy's TLS." ;;
    *\|all\|all\|*)     LABEL="  <- every port, every protocol." ;;
  esac
  echo "    - $(describe_rule "$R")${LABEL}"
done

if [ "$APPLY" != true ]; then
  echo
  echo "Dry run. Nothing changed. Re-run with --apply to make these changes."
  echo "Before you do: confirm SSM works, because this closes SSH."
  echo "  ./scripts/deploy-voice-relay.sh --probe"
  exit 0
fi

# --- apply --------------------------------------------------------------------
# Checked rather than trusted: this is the step that removes the other way in.
# Online means the agent is registered; --probe above is the proof a command
# actually runs. Both are worth having before SSH goes.
echo
echo "==> Verifying SSM before closing SSH"
PING=$(aws ssm describe-instance-information --region "$REGION" \
  --filters "Key=InstanceIds,Values=${INSTANCE}" \
  --query 'InstanceInformationList[0].PingStatus' --output text 2>/dev/null || echo "None")
if [ "$PING" != "Online" ]; then
  echo "    SSM says: ${PING}"
  echo
  echo "Refusing to apply. Closing SSH with SSM unreachable leaves no way onto"
  echo "the box. Run ./scripts/provision-voice-relay-ssm.sh first."
  exit 1
fi
echo "    Online"

# Authorise before revoking, so a mistake in the KEEP set cannot leave the box
# serving nothing. The two ports are almost certainly already open, making this
# a no-op -- but the ordering is the guard.
for R in "${ADD[@]}"; do
  IFS='|' read -r proto lo hi kind cidr <<< "$R"
  if [ "$kind" = "v6" ]; then
    RANGE="IpProtocol=${proto},FromPort=${lo},ToPort=${hi},Ipv6Ranges=[{CidrIpv6=${cidr}}]"
  else
    RANGE="IpProtocol=${proto},FromPort=${lo},ToPort=${hi},IpRanges=[{CidrIp=${cidr}}]"
  fi
  echo "    + $(describe_rule "$R")"
  aws ec2 authorize-security-group-ingress --region "$REGION" \
    --group-id "$SG" --ip-permissions "$RANGE" >/dev/null
done

for R in "${REVOKE[@]}"; do
  IFS='|' read -r proto lo hi kind cidr <<< "$R"
  case "$kind" in
    v6) SOURCE="Ipv6Ranges=[{CidrIpv6=${cidr}}]" ;;
    sg) SOURCE="UserIdGroupPairs=[{GroupId=${cidr}}]" ;;
    pl) SOURCE="PrefixListIds=[{PrefixListId=${cidr}}]" ;;
    *)  SOURCE="IpRanges=[{CidrIp=${cidr}}]" ;;
  esac
  if [ "$lo" = "all" ]; then
    PERM="IpProtocol=${proto},${SOURCE}"
  else
    PERM="IpProtocol=${proto},FromPort=${lo},ToPort=${hi},${SOURCE}"
  fi
  echo "    - $(describe_rule "$R")"
  aws ec2 revoke-security-group-ingress --region "$REGION" \
    --group-id "$SG" --ip-permissions "$PERM" >/dev/null
done

echo
echo "Done. Verify from outside, not from the group's description:"
echo "  curl -sS -o /dev/null -w '%{http_code}\\n' https://<relay host>/   # expect 200"
echo "  ./scripts/deploy-voice-relay.sh --probe                            # SSM still works"
echo
echo "Rollback, if something served over a port this closed:"
echo "  aws ec2 authorize-security-group-ingress --region ${REGION} \\"
echo "    --group-id ${SG} --ip-permissions IpProtocol=tcp,FromPort=<p>,ToPort=<p>,IpRanges=[{CidrIp=0.0.0.0/0}]"
