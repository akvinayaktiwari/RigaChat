#!/usr/bin/env bash
#
# Meta-transport journey run — staged manual test.
#
# WHY THIS EXISTS
#   Journey phase 1 was proven end to end against real AWS on 2026-08-06, but on
#   the GUPSHUP transport. Commits 562697c..453413a swapped in Meta direct, and
#   no journey has ever run over it. Both halves are green; the seam between
#   them has never been exercised. This script exercises the seam.
#
#   Specifically it proves, or fails to prove, three joints:
#     J1  provider arbitration picks meta_direct for this client
#     J2  a send_message step reaches a real phone via the Meta template path,
#         outside the 24h session window
#     J3  an inbound reply arriving on the Meta webhook resolves the stored
#         callback token and advances the parked execution
#
# WHAT IT DELIBERATELY DOES NOT PROVE
#   That the agent converses. send_message delivers messageHint literally
#   (journey-executor-service.ts:77 — `event.messageHint ?? DEFAULT_...`). The
#   journey branches on a reply ARRIVING, not on what it says. A fully green run
#   here means the transport works, not that the product is conversational.
#
# USAGE
#   cp scripts/test-meta-journey-run.env.example .test.env && edit it
#   ./scripts/test-meta-journey-run.sh preflight   # read-only, run this first
#   ./scripts/test-meta-journey-run.sh arm         # clone + publish the journey
#   ./scripts/test-meta-journey-run.sh ignite      # capture a lead, start it
#   ./scripts/test-meta-journey-run.sh watch       # poll after each phone reply
#   ./scripts/test-meta-journey-run.sh optout      # verify STOP is honoured
#   ./scripts/test-meta-journey-run.sh teardown    # unpublish + delete
#
# Phases are separate on purpose: turns 2 and 3 need a human holding a phone,
# and there is no way to automate "a real person replies on WhatsApp."

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

ENV_FILE="${ENV_FILE:-.test.env}"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck source=/dev/null
  . "$ENV_FILE"
  set +a
fi

REGION="${AWS_REGION:-ap-south-1}"
LEAD_NAME="${LEAD_NAME:-Journey Seam Test}"

# Per-phase, not global. preflight is pure AWS reads and needs no dashboard
# credential at all -- demanding an ID_TOKEN to run a read-only check would push
# someone into minting an hour-lived token before they have learned whether the
# run is even worth doing. Validated lazily so a bare invocation prints usage.
requirements_for() {
  case "$1" in
    preflight) echo "CLIENT_ID BOT_ID" ;;
    arm)       echo "API_BASE ID_TOKEN CLIENT_ID BOT_ID" ;;
    ignite)    echo "API_BASE ID_TOKEN CLIENT_ID BOT_ID LEAD_PHONE" ;;
    watch)     echo "" ;;
    optout)    echo "LEAD_PHONE" ;;
    teardown)  echo "API_BASE ID_TOKEN BOT_ID" ;;
  esac
}

require_config() {
  local missing=() v
  for v in $(requirements_for "$1"); do
    [ -n "${!v:-}" ] || missing+=("$v")
  done
  if [ ${#missing[@]} -gt 0 ]; then
    printf 'missing config for %s: %s\n' "$1" "${missing[*]}" >&2
    printf 'cp scripts/test-meta-journey-run.env.example %s and fill it in\n' "$ENV_FILE" >&2
    exit 1
  fi
}
WABA_ID="${WABA_ID:-}"          # optional; enables the template-approval check
META_TOKEN="${META_TOKEN:-}"    # optional; same
GRAPH="https://graph.facebook.com/v21.0"

TEMPLATE_ID="real-estate-lead-qualification-v1"
STATE_FILE="${STATE_FILE:-.test-journey-state.json}"

# ---------------------------------------------------------------------------
# Output helpers. Every check prints PASS or FAIL with the value it saw, so a
# failed run is readable a week later without re-deriving what was expected.
# ---------------------------------------------------------------------------

pass() { printf '  \033[32mPASS\033[0m  %s\n' "$*"; }
fail() { printf '  \033[31mFAIL\033[0m  %s\n' "$*"; FAILED=1; }
warn() { printf '  \033[33mWARN\033[0m  %s\n' "$*"; }
info() { printf '        %s\n' "$*"; }
phase() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
gate() {
  printf '\n\033[1;35m>> MANUAL: %s\033[0m\n' "$*"
  read -r -p "   press enter when done (ctrl-c to stop) "
}

FAILED=0
AGENT_ID=""

api() {
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -sS -X "$method" "${API_BASE}${path}" \
      -H "Authorization: Bearer ${ID_TOKEN}" \
      -H 'Content-Type: application/json' \
      -d "$body"
  else
    curl -sS -X "$method" "${API_BASE}${path}" \
      -H "Authorization: Bearer ${ID_TOKEN}"
  fi
}

# Normalises the empty case. `aws dynamodb get-item` on a missing key exits 0
# and prints NOTHING -- not `{}` -- so a bare `|| echo '{}'` never fires and the
# caller pipes an empty string into jq, which then emits nothing at all. Every
# `// "default"` fallback downstream is silently skipped. That bug made `watch`
# report an OPEN WhatsApp session window for a lead who had never messaged us:
# the unsafe direction, since it claims free text will send when only a template
# can.
ddb_get() {
  local out
  out="$(aws dynamodb get-item --region "$REGION" --table-name "$1" --key "$2" --output json 2>/dev/null)" || out=''
  [ -n "$out" ] && printf '%s' "$out" || printf '{}'
}

state_get() { jq -r "$1 // empty" "$STATE_FILE" 2>/dev/null || true; }
state_set() {
  local tmp; tmp="$(mktemp)"
  [ -f "$STATE_FILE" ] || echo '{}' > "$STATE_FILE"
  jq "$1" "$STATE_FILE" > "$tmp" && mv "$tmp" "$STATE_FILE"
}

# ---------------------------------------------------------------------------
# preflight — read-only. Nothing here changes state. Run it and read every
# line before arming anything; three of these checks are the exact conditions
# that made the 2026-08-06 run fail on its first attempts.
# ---------------------------------------------------------------------------

preflight() {
  phase "PREFLIGHT 1/6 — AWS identity and region"
  local acct; acct="$(aws sts get-caller-identity --query Account --output text)"
  info "account=$acct region=$REGION"

  phase "PREFLIGHT 2/6 — journey tables exist"
  for t in journeys journey_executions journey_trigger_claims journey_pending_replies \
           scheduled_actions appointment_requests whatsapp_inbound_activity \
           agents agent_binding_lookup lead_state; do
    if aws dynamodb describe-table --table-name "$t" --region "$REGION" >/dev/null 2>&1; then
      pass "table $t"
    else
      fail "table $t MISSING — run scripts/provision-agent-journey.sh"
    fi
  done

  # TTL on journey_pending_replies is not cosmetic: a timed-out execution never
  # calls back to delete its own row, so without TTL the table only grows.
  local ttl
  ttl="$(aws dynamodb describe-time-to-live --table-name journey_pending_replies \
        --region "$REGION" --query 'TimeToLiveDescription.TimeToLiveStatus' --output text 2>/dev/null || echo NONE)"
  [ "$ttl" = "ENABLED" ] && pass "journey_pending_replies TTL enabled" \
                         || fail "journey_pending_replies TTL is $ttl, expected ENABLED"

  phase "PREFLIGHT 3/6 — J1: which WhatsApp provider will actually send"
  # whatsapp-service.ts:62 — activeWhatsappProvider ?? (whatsappConnection.connected ? 'gupshup' : null)
  # and line 192 deliberately does NOT flip an existing Gupshup client over when
  # Meta connects. A client with both connected still sends via Gupshup while
  # Meta's webhook receives the replies. That split is the single most likely
  # way this whole test lies to you.
  local client active meta_conn gup_conn phone_id
  client="$(ddb_get clients "{\"clientId\":{\"S\":\"$CLIENT_ID\"}}")"
  active="$(echo "$client"    | jq -r '.Item.activeWhatsappProvider.S // "unset"')"
  meta_conn="$(echo "$client" | jq -r '.Item.metaDirectWhatsAppConnection.M.connected.BOOL // false')"
  gup_conn="$(echo "$client"  | jq -r '.Item.whatsappConnection.M.connected.BOOL // false')"
  phone_id="$(echo "$client"  | jq -r '.Item.metaDirectWhatsAppConnection.M.phoneNumberId.S // "none"')"

  info "activeWhatsappProvider=$active  metaConnected=$meta_conn  gupshupConnected=$gup_conn  phoneNumberId=$phone_id"
  if [ "$active" = "meta_direct" ] && [ "$meta_conn" = "true" ]; then
    pass "sends will resolve to meta_direct — this is the transport under test"
  elif [ "$gup_conn" = "true" ]; then
    fail "this client resolves to GUPSHUP. The run would re-prove the 2026-08-06 path and prove nothing new."
    info "fix: set activeWhatsappProvider=meta_direct on this client, or test on a Meta-only client"
  else
    fail "no active WhatsApp provider resolves for this client — every send will no-op"
  fi

  phase "PREFLIGHT 4/6 — J2: the two templates this journey sends must be APPROVED on the Meta WABA"
  # greet uses lead_welcome_qualify_1, nudge uses lead_followup_nudge_1
  # (lib/journey-templates/real-estate-lead-qualification.ts:87,123). Approved on
  # the GUPSHUP app does not count — a template lives on one WABA.
  if [ -n "$WABA_ID" ] && [ -n "$META_TOKEN" ]; then
    local tpl
    tpl="$(curl -sS "${GRAPH}/${WABA_ID}/message_templates?fields=name,status,category,language&limit=200&access_token=${META_TOKEN}")"
    if echo "$tpl" | jq -e '.error' >/dev/null 2>&1; then
      fail "Graph API error: $(echo "$tpl" | jq -c '.error.message')"
    else
      for name in lead_welcome_qualify_1 lead_followup_nudge_1; do
        local status category
        status="$(echo "$tpl"   | jq -r --arg n "$name" '.data[] | select(.name==$n) | .status'   | head -1)"
        category="$(echo "$tpl" | jq -r --arg n "$name" '.data[] | select(.name==$n) | .category' | head -1)"
        if [ "$status" = "APPROVED" ]; then
          pass "$name APPROVED (category=$category)"
          # Meta reclassified lead_welcome_qualify_1 UTILITY->MARKETING on
          # 2026-08-15. Not a failure, but it changes what the send costs.
          [ "$name" = "lead_welcome_qualify_1" ] && [ "$category" = "MARKETING" ] && \
            info "reclassified to MARKETING as expected — budget accordingly"
        else
          fail "$name status=${status:-NOT_FOUND} — greet/nudge cannot send outside the 24h window"
          info "fix: npx tsx backend/scripts/create-whatsapp-templates.ts"
        fi
      done
    fi
  else
    warn "WABA_ID/META_TOKEN unset — skipping template check"
    info "if greet silently does not arrive in phase 'ignite', this is the first thing to check"
  fi

  phase "PREFLIGHT 5/6 — ignition will resolve to exactly one Agent"
  # This script ignites via a CHAT lead, and the chat branch of findAgentForLead
  # (lead-resolution-service.ts:239) has NO "client's only Agent" fallback -- it
  # requires a binding row on this exact botId and returns no_agent without one.
  # The single-Agent fallback exists only for form and Meta leads, which have no
  # bot to look up. So Agent COUNT is not the check here; the binding is, and a
  # client with 23 bots and 1 Agent can start a journey from exactly one of them.
  local agents count binding bound_agent
  agents="$(aws dynamodb query --region "$REGION" --table-name agents \
    --key-condition-expression 'clientId = :c' \
    --expression-attribute-values "{\":c\":{\"S\":\"$CLIENT_ID\"}}" \
    --output json 2>/dev/null || echo '{"Count":0}')"
  count="$(echo "$agents" | jq -r '.Count')"
  info "agents for this client: $count"

  binding="$(ddb_get agent_binding_lookup "{\"resourceId\":{\"S\":\"$BOT_ID\"}}")"
  bound_agent="$(echo "$binding" | jq -r '.Item.agentId.S // ""')"
  if [ -z "$bound_agent" ]; then
    fail "bot $BOT_ID has NO Agent binding — a chat lead on it resolves no_agent and nothing ignites"
    info "pick a bot that appears as a resourceId in agent_binding_lookup for this client"
  elif [ "$(echo "$binding" | jq -r '.Item.clientId.S // ""')" != "$CLIENT_ID" ]; then
    # A binding pointing at another tenant's Agent is refused rather than
    # followed across the boundary -- it reports as no_agent too.
    fail "bot $BOT_ID is bound to an Agent owned by a different client"
  else
    pass "bot $BOT_ID -> agent $bound_agent"
    AGENT_ID="$bound_agent"
  fi

  phase "PREFLIGHT 6/6 — no stale trigger claim on lead_captured"
  # Exactly one published bundle may own a trigger. A claim left over from an
  # earlier run points ignition at a bundle you are about to replace.
  # Both shapes checked: triggerClaimKey prefers agent:<id> and only falls back
  # to bot:<id> for an unbound bot, so a stale claim can exist under either.
  for key in "agent:${AGENT_ID:-none}#lead_captured" "bot:${BOT_ID}#lead_captured"; do
    local claim
    claim="$(ddb_get journey_trigger_claims "{\"claimKey\":{\"S\":\"$key\"}}")"
    if echo "$claim" | jq -e '.Item' >/dev/null 2>&1; then
      warn "existing claim $key -> bundle $(echo "$claim" | jq -r '.Item.bundleId.S')"
      info "run 'teardown' first, or publish will be refused"
    else
      pass "no claim on $key"
    fi
  done

  summary
}

# ---------------------------------------------------------------------------
# arm — clone the prebuilt template into a client-owned bundle and publish it.
# Publish is where the ASL is compiled and the trigger claimed; a compile error
# surfaces here, not at ignition.
# ---------------------------------------------------------------------------

arm() {
  phase "ARM 1/3 — clone $TEMPLATE_ID"
  local res bundle_id
  res="$(api POST "/api/journeys/from-template/${TEMPLATE_ID}" "{\"botId\":\"${BOT_ID}\"}")"
  echo "$res" | jq -e '.success == true' >/dev/null 2>&1 \
    || { fail "clone failed: $(echo "$res" | jq -c '.error // .')"; return 1; }
  bundle_id="$(echo "$res" | jq -r '.data.bundleId')"
  state_set ".bundleId = \"$bundle_id\""
  pass "bundle $bundle_id"

  phase "ARM 2/3 — publish"
  res="$(api POST "/api/journeys/${BOT_ID}/${bundle_id}/publish" '{}')"
  echo "$res" | jq -e '.success == true' >/dev/null 2>&1 \
    || { fail "publish failed: $(echo "$res" | jq -c '.error // .')"; return 1; }
  pass "published"

  phase "ARM 3/3 — verify what publish actually wrote"
  res="$(api GET "/api/journeys/${BOT_ID}/${bundle_id}")"
  local status vers arn
  status="$(echo "$res" | jq -r '.data.status')"
  vers="$(echo "$res"   | jq -r '.data.publishedVersion')"
  arn="$(echo "$res"    | jq -r '.data.compiledStateMachineVersionArn // "none"')"
  [ "$status" = "published" ] && pass "status=published" || fail "status=$status"

  # publishedVersion is parsed from the ARN AWS returns, not incremented
  # locally — Step Functions does not mint a new version for an unchanged
  # definition, and the old code claimed v2 while pointing at :1.
  if [ "$arn" != "none" ] && [ "${arn##*:}" = "$vers" ]; then
    pass "publishedVersion=$vers matches ARN suffix :${arn##*:}"
  else
    fail "version skew: publishedVersion=$vers but ARN=$arn"
  fi
  state_set ".stateMachineArn = \"$arn\" | .journeyVersion = $vers"

  # Every Task except the wait_and_recheck recheck once omitted ResultPath, so
  # a Task result REPLACED the execution context and journeys died at step two.
  # Assert it on the compiled definition rather than trusting the fix held.
  phase "ARM bonus — ResultPath present on every Task (the 2026-08-06 P0)"
  local unqualified defn missing
  unqualified="${arn%:*}"
  defn="$(aws stepfunctions describe-state-machine --region "$REGION" \
          --state-machine-arn "$arn" --query definition --output text 2>/dev/null || echo '{}')"
  missing="$(echo "$defn" | jq -r '[.States | to_entries[] | select(.value.Type=="Task") | select(.value.ResultPath == null) | .key] | join(", ")')"
  [ -z "$missing" ] && pass "all Task states carry ResultPath" \
                    || fail "Task states missing ResultPath: $missing — journey will die at step two"

  info "state machine: $unqualified"
  summary
}

# ---------------------------------------------------------------------------
# ignite — capture a lead the way the widget does, which is the only thing that
# starts a journey. Messaging the WhatsApp number directly ignites NOTHING:
# the trigger is lead_captured and the only callers of igniteJourneysForLead are
# lead-service (chat/form) and meta-lead-service (Meta Lead Ads).
# ---------------------------------------------------------------------------

ignite() {
  local bundle_id; bundle_id="$(state_get '.bundleId')"
  [ -n "$bundle_id" ] || { fail "no bundleId in $STATE_FILE — run 'arm' first"; return 1; }

  phase "IGNITE 1/3 — capture a lead (public route, no auth, exactly as the widget posts)"
  local conv_id res lead_id
  conv_id="seamtest-$(date +%s)"
  res="$(curl -sS -X POST "${API_BASE}/api/leads" -H 'Content-Type: application/json' -d "$(jq -nc \
    --arg b "$BOT_ID" --arg c "$conv_id" --arg n "$LEAD_NAME" --arg p "$LEAD_PHONE" \
    '{botId:$b, conversationId:$c, name:$n, phone:$p, email:"seam-test@example.com",
      propertyInterest:"Skyline Residences", budgetRange:"80L-1Cr",
      chatTranscript:"[seam test] Meta-transport journey run",
      sourceUrl:"https://vyostra.com/__seam-test"}')")"
  echo "$res" | jq -e '.success == true' >/dev/null 2>&1 \
    || { fail "capture failed: $(echo "$res" | jq -c '.error // .')"; return 1; }
  lead_id="$(echo "$res" | jq -r '.data.leadId')"
  state_set ".leadId = \"$lead_id\" | .conversationId = \"$conv_id\""
  pass "lead $lead_id"

  phase "IGNITE 2/3 — did ignition start an execution"
  # The ignition outcome is NOT in the API response. lead-service.ts:80 logs it
  # and ONLY when it is not 'started', so the log is an inverted signal: a
  # [ignition] line means something went wrong, silence means it fired. The
  # structured reasons are no_published_journey, journey_not_published,
  # ambiguous_agent, no_agent, agent_has_no_web_binding, lead_not_found.
  sleep 8
  local since ign_log
  since=$(( ($(date +%s) - 300) * 1000 ))
  ign_log="$(aws logs filter-log-events --region "$REGION" \
    --log-group-name /aws/lambda/rigachat-api --start-time "$since" \
    --filter-pattern '"[ignition]"' --query 'events[].message' --output text 2>/dev/null || true)"
  if [ -n "$ign_log" ]; then
    fail "ignition did not start:"
    echo "$ign_log" | sed 's/^/        /'
  else
    pass "no [ignition] failure logged — it started (silence is the success signal here)"
  fi

  local arn exec_arn
  arn="$(state_get '.stateMachineArn')"
  # Newest execution on the unqualified ARN. Execution names are deterministic
  # (executionNameFor), so a retried ignition reuses this one rather than
  # creating a second — picking the newest is safe.
  exec_arn="$(aws stepfunctions list-executions --region "$REGION" \
    --state-machine-arn "${arn%:*}" --max-results 20 --output json \
    | jq -r '[.executions[]] | sort_by(.startDate) | last | .executionArn // empty')"
  if [ -n "$exec_arn" ]; then
    pass "execution started"
    info "$exec_arn"
    state_set ".executionArn = \"$exec_arn\""
  else
    fail "no execution — ignition did not fire. Re-read the ignition field above."
    return 1
  fi

  phase "IGNITE 3/3 — J2: did greet actually reach the handset via the Meta template path"
  info "greet sends lead_welcome_qualify_1 with params [name, propertyInterest]"
  info "expected on the phone: \"Hi ${LEAD_NAME}, thanks for your interest in Skyline Residences.\""
  info "this lead has never messaged us, so the 24h window is SHUT and the"
  info "template is the only path through — free text here would be error 131047"
  gate "check the handset ${LEAD_PHONE}. Did the greet template arrive?"

  watch
}

# ---------------------------------------------------------------------------
# watch — where the execution is now, and whether it is parked on a callback
# token. Run this after each reply from the handset.
# ---------------------------------------------------------------------------

watch() {
  local exec_arn lead_id
  exec_arn="$(state_get '.executionArn')"
  lead_id="$(state_get '.leadId')"
  [ -n "$exec_arn" ] || { fail "no executionArn in $STATE_FILE"; return 1; }

  phase "WATCH — execution status"
  local d status
  d="$(aws stepfunctions describe-execution --region "$REGION" --execution-arn "$exec_arn" --output json)"
  status="$(echo "$d" | jq -r '.status')"
  info "status=$status  started=$(echo "$d" | jq -r '.startDate')"
  case "$status" in
    RUNNING)   pass "RUNNING" ;;
    SUCCEEDED) pass "SUCCEEDED — journey ran to a terminal step" ;;
    *)         fail "$status — $(echo "$d" | jq -r '.cause // .error // "no cause given"')" ;;
  esac

  phase "WATCH — step history"
  aws stepfunctions get-execution-history --region "$REGION" --execution-arn "$exec_arn" \
    --max-items 200 --output json \
    | jq -r '.events[] | select(.type|test("StateEntered|StateExited|TaskFailed|ExecutionFailed"))
             | "  \(.timestamp[11:19])  \(.type)  \(.stateEnteredEventDetails.name // .stateExitedEventDetails.name // .taskFailedEventDetails.error // .executionFailedEventDetails.error // "")"'

  phase "WATCH — J3: is a callback token parked for this lead"
  # An execution sitting on await_reply must have a row here. No row + RUNNING
  # means it parked without storing its token, and no reply will ever resume it.
  local pending
  pending="$(ddb_get journey_pending_replies "{\"leadId\":{\"S\":\"$lead_id\"}}")"
  if echo "$pending" | jq -e '.Item' >/dev/null 2>&1; then
    pass "token parked on step $(echo "$pending" | jq -r '.Item.stepId.S // "?"'), expires $(echo "$pending" | jq -r '.Item.expiresAt.N')"
    info "a reply from ${LEAD_PHONE} should now resolve this and advance the execution"
  else
    info "no parked token (expected if the execution is between steps or finished)"
  fi

  phase "WATCH — inbound session window"
  local activity last
  activity="$(ddb_get whatsapp_inbound_activity "{\"leadId\":{\"S\":\"$lead_id\"}}")"
  last="$(echo "$activity" | jq -r '.Item.lastInboundMessageAt.S // "never"')"
  info "lastInboundMessageAt=$last"
  if [ "$last" = "never" ]; then
    info "window SHUT — sends must use an approved template"
  else
    pass "window OPEN — sends go as free text (cheaper, reads better)"
    info "this row is written by meta-whatsapp-webhook-service.ts:84 — its presence"
    info "is itself proof the Meta inbound webhook reached our handler"
  fi

  cat <<'ENDNOTE'

  NEXT MANUAL TURN
    1. reply from the handset with a budget and an area, e.g.
       "around 90 lakhs, looking in Wakad"
    2. re-run:  ./scripts/test-meta-journey-run.sh watch
    3. expect:  await_qualification exited -> offer_visit entered, sent as
                FREE TEXT this time (the window is now open)
    4. reply with a day, e.g. "Saturday works"
    5. expect:  await_visit_time -> wait_for_booking

  Remember what a green run does and does not mean: offer_visit's text is the
  step's literal messageHint. It will not reference Wakad or 90 lakhs. That is
  the known composition gap, not a bug in this run.
ENDNOTE
  summary
}

# ---------------------------------------------------------------------------
# optout — the enforcement point is journey-executor-service.ts:58, checked
# before anything else in handleSendMessage. A 60-90 day nurture that keeps
# firing after someone said stop is the worst failure this system can have, so
# it gets its own phase rather than being assumed.
# ---------------------------------------------------------------------------

optout() {
  local lead_id; lead_id="$(state_get '.leadId')"
  gate "reply STOP from ${LEAD_PHONE}"

  phase "OPTOUT — flag recorded"
  sleep 5
  local activity
  activity="$(ddb_get whatsapp_inbound_activity "{\"leadId\":{\"S\":\"$lead_id\"}}")"
  echo "$activity" | jq -r '.Item'
  # Stored as optedOutAt (ISO timestamp), not a boolean —
  # isOptedOut() is Boolean(activity?.optedOutAt).
  local opted; opted="$(echo "$activity" | jq -r '.Item.optedOutAt.S // ""')"
  if [ -n "$opted" ]; then
    pass "lead flagged opted out at $opted"
  else
    fail "no optedOutAt — every later send in this journey will still fire"
  fi

  phase "OPTOUT — execution stopped"
  watch
  summary
}

# ---------------------------------------------------------------------------
# teardown — unpublish and delete, releasing the trigger claim. Leaving a claim
# behind blocks the next run's publish.
# ---------------------------------------------------------------------------

teardown() {
  local bundle_id exec_arn
  bundle_id="$(state_get '.bundleId')"
  exec_arn="$(state_get '.executionArn')"

  if [ -n "$exec_arn" ]; then
    phase "TEARDOWN — stop execution"
    aws stepfunctions stop-execution --region "$REGION" --execution-arn "$exec_arn" \
      --cause "seam test teardown" >/dev/null 2>&1 && pass "stopped" || info "already terminal"
  fi

  if [ -n "$bundle_id" ]; then
    phase "TEARDOWN — delete bundle $bundle_id"
    local res; res="$(api DELETE "/api/journeys/${BOT_ID}/${bundle_id}")"
    echo "$res" | jq -e '.success == true' >/dev/null 2>&1 && pass "deleted" \
      || fail "delete failed: $(echo "$res" | jq -c '.error // .')"
  fi

  # StopExecution does NOT call back, so an execution parked on await_reply
  # leaves its journey_pending_replies row behind. The TTL clears it within 24h,
  # but until then claimPendingReply's `attribute_not_exists(leadId)` guard
  # rejects any new journey that parks on the same lead --
  # PendingReplyConflictError, from a bundle that no longer exists. Observed on
  # the 2026-08-16 run: teardown reported clean while the token stayed parked.
  local lead_id; lead_id="$(state_get '.leadId')"
  if [ -n "$lead_id" ]; then
    phase "TEARDOWN — release the parked callback token"
    if aws dynamodb delete-item --region "$REGION" --table-name journey_pending_replies \
        --key "{\"leadId\":{\"S\":\"$lead_id\"}}" >/dev/null 2>&1; then
      pass "pending reply cleared for lead $lead_id"
    else
      warn "could not clear the pending reply row — it will TTL out within 24h"
    fi
  fi

  # The test lead itself CANNOT be removed — there is no delete path for a lead
  # anywhere in the codebase (see TODOS.md). It stays in the client's CRM
  # forever. Worth knowing before running this against a real account.
  [ -n "$lead_id" ] && warn "lead $lead_id is PERMANENT — no delete path exists (TODOS.md)"

  rm -f "$STATE_FILE"
  summary
}

summary() {
  if [ "$FAILED" = "1" ]; then
    printf '\n\033[31m✗ one or more checks failed — read them before continuing\033[0m\n'
    exit 1
  fi
  printf '\n\033[32m✓ phase clean\033[0m\n'
}

case "${1:-}" in
  preflight|arm|ignite|watch|optout|teardown) require_config "$1"; "$1" ;;
  *) sed -n '3,34p' "$0" | sed 's/^#\{1,\} \{0,1\}//'; exit 1 ;;
esac
