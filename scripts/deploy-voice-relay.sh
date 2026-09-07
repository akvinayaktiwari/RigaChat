#!/bin/bash
set -e

# Ships backend/dist/voice-relay.js to the EC2 voice relay and restarts it.
#
# This is the deploy that did not exist. `npm run build:relay` has always
# produced the bundle and nothing has ever shipped it -- not scripts/deploy.sh,
# not backend/scripts/deploy.js, not CI. Whatever is running on that box was
# put there by hand.
#
# Requires scripts/provision-voice-relay-ssm.sh to have been run once.
#
# RESTARTING DROPS EVERY CALL IN PROGRESS. Sessions live in memory in a single
# Node process; there is no draining and no second instance to fail over to.
# Deploy when the line is quiet, or accept that anyone mid-call is cut off.
#
#   ./scripts/deploy-voice-relay.sh --probe   inspect the box, change nothing
#   ./scripts/deploy-voice-relay.sh           build, ship, restart, verify
#   ./scripts/deploy-voice-relay.sh --yes     same, without the confirmation

REGION="ap-south-1"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
INSTANCE_TAG="${VOICE_RELAY_INSTANCE_TAG:-vyostra-voice-relay}"
BUCKET="${VOICE_RELAY_ARTIFACT_BUCKET:-vyostra-deploy-artifacts-${ACCOUNT}}"

# Confirmed against the box with --probe on 2026-09-07. Every one of these was
# wrong when guessed from the primer, which is why the probe exists.
#
# RUN_AS matters more than it looks. SSM's RunShellScript executes as root, and
# the relay is a PM2 process owned by ubuntu, in ubuntu's own PM2 home. Root has
# its own empty PM2 registry, so `pm2 restart voice-relay` as root finds no such
# process, exits 0 having done nothing, and leaves the old code serving -- while
# a health check still answers 200 from the process that never restarted. That
# is the exact failure this script is supposed to make impossible, so the
# verification below compares the PID rather than trusting an exit code.
REMOTE_DIR="${VOICE_RELAY_REMOTE_DIR:-/home/ubuntu}"
RUN_AS="${VOICE_RELAY_RUN_AS:-ubuntu}"
PM2_APP="${VOICE_RELAY_PM2_APP:-voice-relay}"

# Wrapped so it runs in the owner's login environment: PM2 resolves its home
# from $HOME, and `sudo -u` alone keeps root's.
as_owner() { echo "sudo -iu ${RUN_AS} bash -lc '$1'"; }

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

PROBE=false
ASSUME_YES=false
for ARG in "$@"; do
  case "$ARG" in
    --probe) PROBE=true ;;
    --yes|-y) ASSUME_YES=true ;;
    -h|--help)
      echo "Usage: $0 [--probe] [--yes]"
      echo
      echo "  --probe   Report the box's layout and the running relay, then stop."
      echo "            Run this first: REMOTE_DIR and RESTART_CMD are guesses"
      echo "            until you have seen its output."
      echo "  --yes     Skip the 'this drops live calls' confirmation."
      echo
      echo "Overrides: VOICE_RELAY_INSTANCE_TAG, VOICE_RELAY_INSTANCE_ID,"
      echo "           VOICE_RELAY_ARTIFACT_BUCKET, VOICE_RELAY_REMOTE_DIR,"
      echo "           VOICE_RELAY_RUN_AS, VOICE_RELAY_PM2_APP"
      exit 0
      ;;
    *) echo "Unknown argument: $ARG (try --help)"; exit 1 ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Runs a command on the box and returns its output, failing loudly. send-command
# is asynchronous: it returns an id, and the result has to be collected
# separately, so "did it work" is a poll rather than an exit code.
run_remote() {
  local DESCRIPTION="$1"
  local SCRIPT="$2"

  # The parameters go in as a JSON file rather than the `commands=[...]`
  # shorthand. That shorthand does its own comma and bracket parsing before the
  # value ever reaches the API, so any script containing a double quote or a
  # newline -- which is every useful one -- is mangled into a parse error.
  local PARAM_FILE
  PARAM_FILE=$(mktemp)
  SCRIPT="$SCRIPT" python3 -c 'import json, os; print(json.dumps({"commands": [os.environ["SCRIPT"]]}))' > "$PARAM_FILE"

  local CMD_ID
  CMD_ID=$(aws ssm send-command \
    --region "$REGION" \
    --instance-ids "$INSTANCE" \
    --document-name "AWS-RunShellScript" \
    --comment "$DESCRIPTION" \
    --parameters "file://${PARAM_FILE}" \
    --query 'Command.CommandId' --output text)
  rm -f "$PARAM_FILE"

  # The invocation does not exist for a moment after send-command returns, so a
  # get-command-invocation immediately after can 404 on a command that is fine.
  sleep 2

  local STATUS="Pending"
  for _ in $(seq 1 60); do
    STATUS=$(aws ssm get-command-invocation --region "$REGION" \
      --command-id "$CMD_ID" --instance-id "$INSTANCE" \
      --query 'Status' --output text 2>/dev/null || echo "Pending")
    case "$STATUS" in
      Success|Failed|Cancelled|TimedOut) break ;;
    esac
    sleep 2
  done

  local STDOUT STDERR
  STDOUT=$(aws ssm get-command-invocation --region "$REGION" \
    --command-id "$CMD_ID" --instance-id "$INSTANCE" \
    --query 'StandardOutputContent' --output text 2>/dev/null || echo "")
  STDERR=$(aws ssm get-command-invocation --region "$REGION" \
    --command-id "$CMD_ID" --instance-id "$INSTANCE" \
    --query 'StandardErrorContent' --output text 2>/dev/null || echo "")

  if [ "$STATUS" != "Success" ]; then
    echo "    remote command '${DESCRIPTION}' ended as ${STATUS}" >&2
    [ -n "$STDOUT" ] && echo "$STDOUT" | sed 's/^/      /' >&2
    [ -n "$STDERR" ] && echo "$STDERR" | sed 's/^/      /' >&2
    return 1
  fi

  echo "$STDOUT"
}

echo "==> Checking the relay is reachable over SSM"
PING=$(aws ssm describe-instance-information --region "$REGION" \
  --filters "Key=InstanceIds,Values=${INSTANCE}" \
  --query 'InstanceInformationList[0].PingStatus' --output text 2>/dev/null || echo "None")
if [ "$PING" != "Online" ]; then
  echo "    ${INSTANCE} is not registered with SSM (ping status: ${PING})"
  echo "    run ./scripts/provision-voice-relay-ssm.sh first"
  exit 1
fi
echo "    Online"

if [ "$PROBE" = true ]; then
  echo
  echo "==> Probing the box (changing nothing)"
  # Every command here runs as the process owner. Running `pm2 list` as root
  # instead does not just report the wrong thing -- it SPAWNS a second PM2
  # daemon under /root/.pm2 that was not there before, which is a side effect a
  # probe has no business having.
  run_remote "voice-relay probe" "$(cat <<REMOTE
echo '--- node process serving the relay ---'
ps -eo pid,ppid,user,args | grep -i "voice-relay" | grep -v grep || echo '(none found)'
echo
echo '--- what is listening on 3100 ---'
(ss -lntp 2>/dev/null || netstat -lntp 2>/dev/null) | grep 3100 || echo '(nothing on 3100)'
echo
echo "--- pm2 registry for ${RUN_AS} ---"
$(as_owner "pm2 list 2>/dev/null") || echo 'no pm2 for ${RUN_AS}'
echo
echo '--- pm2 boot persistence ---'
systemctl is-enabled pm2-${RUN_AS} 2>/dev/null || echo 'pm2-${RUN_AS} not enabled: the relay will NOT come back after a reboot'
echo
echo "--- ${REMOTE_DIR} ---"
ls -la ${REMOTE_DIR} 2>/dev/null | grep -iE 'voice-relay|ecosystem|\.env|node_modules|^total|^d.*\.$' || echo '(not found)'
echo
echo '--- reverse proxy ---'
command -v caddy >/dev/null && echo 'caddy present' || echo 'caddy not installed'
command -v nginx >/dev/null && echo 'nginx present' || echo 'nginx not installed'
echo
echo '--- health on localhost ---'
curl -s -o /dev/null -w 'GET localhost:3100/ -> %{http_code}\n' http://localhost:3100/ || echo 'no response on 3100'
REMOTE
)"
  echo
  echo "Current settings (override with the env vars in --help):"
  echo "  REMOTE_DIR = ${REMOTE_DIR}"
  echo "  RUN_AS     = ${RUN_AS}"
  echo "  PM2_APP    = ${PM2_APP}"
  exit 0
fi

echo "==> Verifying the remote layout before touching anything"
# A wrong REMOTE_DIR is the failure that looks like success: the file lands
# somewhere nothing reads, the restart works, and the old code keeps serving.
if ! run_remote "check remote dir" "test -d ${REMOTE_DIR} && echo ok" | grep -q ok; then
  echo "    ${REMOTE_DIR} does not exist on the box."
  echo "    Run '$0 --probe' to find the real one, then set VOICE_RELAY_REMOTE_DIR."
  exit 1
fi
echo "    ${REMOTE_DIR} exists"

# Checks the app is in THIS user's PM2 registry, not merely that a pm2 binary
# exists somewhere. Root has its own empty registry, so the weaker check passes
# while the restart silently does nothing.
BEFORE_PID=$(run_remote "read current relay pid" \
  "$(as_owner "pm2 pid ${PM2_APP} 2>/dev/null")" | tr -d '[:space:]')
if [ -z "$BEFORE_PID" ] || [ "$BEFORE_PID" = "0" ]; then
  echo "    '${PM2_APP}' is not a running app in ${RUN_AS}'s PM2 registry."
  echo "    Run '$0 --probe' to see what actually manages the relay, then set"
  echo "    VOICE_RELAY_RUN_AS / VOICE_RELAY_PM2_APP."
  exit 1
fi
echo "    ${PM2_APP} is online as ${RUN_AS}, pid ${BEFORE_PID}"

# Everything that can refuse the deploy runs BEFORE the confirmation prompt.
# Asking someone to accept dropped calls and only then discovering the deploy
# was never going to work wastes the one thing the prompt is protecting.
echo "==> 1/6 Building the relay bundle"
(cd "${REPO_ROOT}/backend" && npm run build:relay >/dev/null)
BUNDLE="${REPO_ROOT}/backend/dist/voice-relay.js"
if [ ! -f "$BUNDLE" ]; then
  echo "    build produced no ${BUNDLE}"
  exit 1
fi
echo "    $(du -h "$BUNDLE" | cut -f1) at dist/voice-relay.js"

# Stamped into the object key so a deploy is traceable to a commit, and so two
# deploys from the same commit are still distinguishable.
GIT_SHA="$(cd "$REPO_ROOT" && git rev-parse --short HEAD)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
KEY="voice-relay/${STAMP}-${GIT_SHA}.js"

echo "==> 2/6 Checking the box has every module the bundle needs"
# build:relay externalises @aws-sdk/*, so those are resolved from the box's own
# node_modules at runtime, not from the bundle. A missing one is not a
# degraded feature: the require is at module load, so the process dies
# immediately and PM2 restart-loops it. The relay goes DOWN, including browser
# calls that have nothing to do with the new code.
#
# This is not hypothetical. The relay's package.json lists client-dynamodb,
# lib-dynamodb and ws; telephony pulled in kms, sesv2, sfn and sqs, because
# lead-identity-service reaches lead-service and from there the whole services
# layer. See TODOS.md.
# Every bare specifier, not just @aws-sdk -- the first version of this check
# looked only at those and would have missed anything else the bundle started
# externalising. node: builtins and relative paths are dropped; the two
# allowlisted names are ws's optional native speedups, required inside a
# try/catch, which fall back to JS when absent and must not fail a deploy.
REQUIRED=$(grep -oE 'require\("[^"./][^"]*"\)' "$BUNDLE" \
  | sed 's/require("//;s/")//' \
  | grep -v '^node:' \
  | grep -vE '^(bufferutil|utf-8-validate)$' \
  | sort -u \
  | tr '\n' ' ')
# Flattened to one line above: SSM runs this through sh, and a newline inside
# the `for` list splits the statement rather than separating two words.

# Resolved by node itself, from the relay's own directory, so this answers the
# question that actually matters -- "will the require succeed at load" -- rather
# than guessing from a directory listing.
CHECK_SCRIPT="cd ${REMOTE_DIR}; for M in ${REQUIRED}; do node -e \"require.resolve('\$M')\" >/dev/null 2>&1 || echo \"MISSING \$M\"; done; echo DONE"
RESOLVED=$(run_remote "resolve bundle dependencies" "$CHECK_SCRIPT")
MISSING=$(echo "$RESOLVED" | grep '^MISSING ' | awk '{print $2}' | tr '\n' ' ')

if ! echo "$RESOLVED" | grep -q DONE; then
  echo "    could not verify dependencies on the box"
  exit 1
fi

if [ -n "$(echo "$MISSING" | tr -d '[:space:]')" ]; then
  echo "    MISSING on the box: ${MISSING}"
  echo
  echo "Refusing to deploy. These are require()d at load, so the relay would"
  echo "crash on start and PM2 would restart-loop it -- taking browser voice"
  echo "down too, not just telephony."
  echo
  echo "Install them first, then re-run:"
  echo "  ssh <box> 'cd ${REMOTE_DIR} && npm install --omit=dev ${MISSING}'"
  exit 1
fi
echo "    all $(echo "$REQUIRED" | wc -w | tr -d ' ') external modules present"

if [ "$ASSUME_YES" != true ]; then
  echo
  echo "Restarting the relay DROPS EVERY CALL IN PROGRESS -- sessions are held"
  echo "in memory in one process, with no draining and nothing to fail over to."
  read -r -p "Continue? [y/N] " REPLY
  case "$REPLY" in
    y|Y|yes|YES) ;;
    *) echo "Aborted."; exit 1 ;;
  esac
fi

echo "==> 3/6 Uploading to s3://${BUCKET}/${KEY}"
aws s3 cp "$BUNDLE" "s3://${BUCKET}/${KEY}" --region "$REGION" >/dev/null
echo "    uploaded"

echo "==> 4/6 Installing it on the box"
# The previous bundle is kept next to the new one. Rolling back is then a copy,
# not a rebuild of an older commit -- which is the difference between a
# 10-second recovery and a 10-minute one while calls go unanswered.
run_remote "install voice-relay bundle" \
  "set -e; cd ${REMOTE_DIR}; if [ -f voice-relay.js ]; then cp voice-relay.js voice-relay.js.prev; fi; aws s3 cp s3://${BUCKET}/${KEY} voice-relay.js --region ${REGION}; node --check voice-relay.js && echo INSTALLED" \
  | sed 's/^/    /'

echo "==> 5/6 Restarting"
run_remote "restart voice-relay" "$(as_owner "pm2 restart ${PM2_APP} --update-env")" \
  | tail -3 | sed 's/^/    /'

echo "==> 6/6 Verifying it came back"
sleep 3

# The PID must have CHANGED. A restart that quietly did nothing leaves the old
# process serving, and it answers a health check perfectly -- so "200" alone
# would report success for a deploy that shipped nothing.
AFTER_PID=$(run_remote "read new relay pid" \
  "$(as_owner "pm2 pid ${PM2_APP} 2>/dev/null")" | tr -d '[:space:]')

# From the box itself rather than the public hostname: this checks the relay,
# not DNS and TLS in front of it. Those failing is a different problem with a
# different fix, and conflating them sends you debugging the wrong layer.
HEALTH=$(run_remote "relay health check" \
  "curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:3100/ || echo 000")
HEALTH="$(echo "$HEALTH" | tr -d '[:space:]')"

ROLLBACK="$(as_owner "cd ${REMOTE_DIR} && cp voice-relay.js.prev voice-relay.js && pm2 restart ${PM2_APP}")"

if [ "$HEALTH" = "200" ] && [ -n "$AFTER_PID" ] && [ "$AFTER_PID" != "0" ] && [ "$AFTER_PID" != "$BEFORE_PID" ]; then
  echo "    pid ${BEFORE_PID} -> ${AFTER_PID}, localhost:3100/ -> 200"
  echo
  echo "Deployed ${GIT_SHA}."
  echo "Roll back:  ${ROLLBACK}"
  exit 0
fi

if [ "$AFTER_PID" = "$BEFORE_PID" ]; then
  echo "    pid is still ${BEFORE_PID} -- the process DID NOT restart."
  echo "    The new bundle is on disk but the old code is still serving."
  echo "    Check VOICE_RELAY_RUN_AS (${RUN_AS}) and VOICE_RELAY_PM2_APP (${PM2_APP})."
else
  echo "    pid ${BEFORE_PID} -> ${AFTER_PID:-none}, localhost:3100/ -> ${HEALTH}"
  echo "    The relay is not answering."
fi

echo
echo "The previous bundle is on the box as ${REMOTE_DIR}/voice-relay.js.prev."
echo "Roll back:  ${ROLLBACK}"
exit 1
