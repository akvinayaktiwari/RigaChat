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
INSTANCE="${VOICE_RELAY_INSTANCE_ID:-i-034aa3c81d171a763}"
BUCKET="${VOICE_RELAY_ARTIFACT_BUCKET:-vyostra-deploy-artifacts-${ACCOUNT}}"

# The two facts about the box this script cannot derive. They are GUESSES until
# --probe confirms them, so every path below verifies before it writes rather
# than trusting the default -- a wrong REMOTE_DIR would otherwise scatter a
# bundle somewhere nothing reads, and report success.
REMOTE_DIR="${VOICE_RELAY_REMOTE_DIR:-/opt/voice-relay}"
RESTART_CMD="${VOICE_RELAY_RESTART_CMD:-pm2 restart voice-relay}"

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
      echo "Overrides: VOICE_RELAY_INSTANCE_ID, VOICE_RELAY_ARTIFACT_BUCKET,"
      echo "           VOICE_RELAY_REMOTE_DIR, VOICE_RELAY_RESTART_CMD"
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

  local CMD_ID
  CMD_ID=$(aws ssm send-command \
    --region "$REGION" \
    --instance-ids "$INSTANCE" \
    --document-name "AWS-RunShellScript" \
    --comment "$DESCRIPTION" \
    --parameters "commands=[\"$SCRIPT\"]" \
    --query 'Command.CommandId' --output text)

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
  run_remote "voice-relay probe" "$(cat <<'REMOTE'
echo '--- node process serving the relay ---'
ps -eo pid,args | grep -i "voice-relay" | grep -v grep || echo '(none found)'
echo
echo '--- what is listening on 3100 ---'
(ss -lntp 2>/dev/null || netstat -lntp 2>/dev/null) | grep 3100 || echo '(nothing on 3100)'
echo
echo '--- process manager ---'
command -v pm2 >/dev/null && (pm2 list 2>/dev/null || true) || echo 'pm2 not installed'
systemctl list-units --type=service --no-pager 2>/dev/null | grep -i -E 'voice|relay' || echo '(no matching systemd unit)'
echo
echo '--- likely install dirs ---'
for D in /opt/voice-relay /opt/relay /home/ubuntu/voice-relay /home/ubuntu/relay /srv/voice-relay; do
  [ -d "$D" ] && echo "FOUND $D" && ls -la "$D" | head -20
done
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
  echo "Set VOICE_RELAY_REMOTE_DIR and VOICE_RELAY_RESTART_CMD from the above"
  echo "if they differ from the defaults:"
  echo "  REMOTE_DIR  = ${REMOTE_DIR}"
  echo "  RESTART_CMD = ${RESTART_CMD}"
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

RESTART_BIN="${RESTART_CMD%% *}"
if ! run_remote "check restart command" "command -v ${RESTART_BIN} >/dev/null && echo ok" | grep -q ok; then
  echo "    '${RESTART_BIN}' is not on the box's PATH."
  echo "    Run '$0 --probe' to see what manages the process, then set"
  echo "    VOICE_RELAY_RESTART_CMD."
  exit 1
fi
echo "    ${RESTART_BIN} is available"

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

echo "==> 1/5 Building the relay bundle"
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

echo "==> 2/5 Uploading to s3://${BUCKET}/${KEY}"
aws s3 cp "$BUNDLE" "s3://${BUCKET}/${KEY}" --region "$REGION" >/dev/null
echo "    uploaded"

echo "==> 3/5 Installing it on the box"
# The previous bundle is kept next to the new one. Rolling back is then a copy,
# not a rebuild of an older commit -- which is the difference between a
# 10-second recovery and a 10-minute one while calls go unanswered.
run_remote "install voice-relay bundle" \
  "set -e; cd ${REMOTE_DIR}; if [ -f voice-relay.js ]; then cp voice-relay.js voice-relay.js.prev; fi; aws s3 cp s3://${BUCKET}/${KEY} voice-relay.js --region ${REGION}; node --check voice-relay.js && echo INSTALLED" \
  | sed 's/^/    /'

echo "==> 4/5 Restarting"
run_remote "restart voice-relay" "${RESTART_CMD}" | sed 's/^/    /'

echo "==> 5/5 Verifying it came back"
# From the box itself rather than the public hostname: this checks the relay,
# not DNS and TLS in front of it. Those failing is a different problem with a
# different fix, and conflating them sends you debugging the wrong layer.
sleep 3
HEALTH=$(run_remote "relay health check" \
  "curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:3100/ || echo 000")
HEALTH="$(echo "$HEALTH" | tr -d '[:space:]')"

if [ "$HEALTH" = "200" ]; then
  echo "    localhost:3100/ -> 200"
  echo
  echo "Deployed ${GIT_SHA}."
  echo "Roll back with:  aws ssm send-command --instance-ids ${INSTANCE} \\"
  echo "  --document-name AWS-RunShellScript --region ${REGION} \\"
  echo "  --parameters 'commands=[\"cd ${REMOTE_DIR} && cp voice-relay.js.prev voice-relay.js && ${RESTART_CMD}\"]'"
else
  echo "    localhost:3100/ -> ${HEALTH}"
  echo
  echo "The relay is NOT answering. The previous bundle is on the box as"
  echo "${REMOTE_DIR}/voice-relay.js.prev -- roll back with:"
  echo "  cd ${REMOTE_DIR} && cp voice-relay.js.prev voice-relay.js && ${RESTART_CMD}"
  exit 1
fi
