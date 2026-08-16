#!/usr/bin/env bash
#
# Deletes the 30 DYNAMODB_TABLE_* variables from the Lambdas, after the code
# that stopped reading them is live.
#
# ORDER IS THE WHOLE POINT. `getTableName` used to throw on a missing variable,
# and this backend is a single Lambda, so deleting first means every request
# 500s until the code catches up. Deploying first means the variables sit there
# ignored, which is harmless. Therefore:
#
#   1. Merge and deploy the code that resolves names from lib/table-names.ts
#   2. Verify in production that real reads still work (see --verify below)
#   3. Only then run this with --delete
#   4. Rollback, if ever needed: re-add the variables (this script prints the
#      exact restore command before it deletes anything)
#
# CI cannot do this. Its environment step is `get-function-configuration | jq
# '. + {…}'`, which only ever ADDS keys. That is also why deletion is durable:
# no later deploy silently puts them back.
#
# Usage from the repo root:
#   ./scripts/consolidate-table-env.sh --verify     # read-only, check prod is healthy
#   ./scripts/consolidate-table-env.sh              # dry run, show what would go
#   ./scripts/consolidate-table-env.sh --delete     # do it (writes a backup first)

set -euo pipefail

REGION="${AWS_REGION:-ap-south-1}"
FUNCTIONS=(rigachat-api rigachat-api-streaming rigachat-crawler)
# OUTSIDE THE REPO, deliberately. These backups are a full dump of each Lambda's
# environment, which includes OPENAI_API_KEY, PINECONE_API_KEY, META_APP_SECRET,
# RAZORPAY_KEY_SECRET and every other production credential. Writing them under
# the working tree means one `git add -A` away from committing the lot -- which
# is exactly what happened on 2026-08-16, caught by the pre-push secret scanner
# rather than by anyone noticing.
BACKUP_DIR="${BACKUP_DIR:-$HOME/.rigachat/table-env-backup}"

MODE="dryrun"
case "${1:-}" in
  --delete) MODE="delete" ;;
  --verify) MODE="verify" ;;
  "") ;;
  *) echo "unknown argument: $1" >&2; exit 1 ;;
esac

pass() { printf '  \033[32mPASS\033[0m  %s\n' "$*"; }
fail() { printf '  \033[31mFAIL\033[0m  %s\n' "$*"; }
info() { printf '        %s\n' "$*"; }
phase() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

# ---------------------------------------------------------------------------
# --verify: does production still work? Run this AFTER deploying the code and
# BEFORE deleting anything. It exercises endpoints that read real tables, so a
# pass means name resolution is genuinely working, not just that the code
# compiled.
# ---------------------------------------------------------------------------
if [ "$MODE" = "verify" ]; then
  API="${API_BASE:?set API_BASE to the Lambda Function URL}"
  BOT_ID="${BOT_ID:?set BOT_ID to a real bot id}"

  phase "VERIFY 1/2 — a public read that hits the bots table"
  CODE=$(curl -sS -o /tmp/verify-bot.json -w '%{http_code}' "$API/api/bots/public/$BOT_ID")
  if [ "$CODE" = "200" ] && grep -q '"success":true' /tmp/verify-bot.json; then
    pass "bots table resolves ($(grep -o '"name":"[^"]*"' /tmp/verify-bot.json | head -1))"
  else
    fail "bot config read returned $CODE — do NOT delete anything"
    exit 1
  fi
  rm -f /tmp/verify-bot.json

  phase "VERIFY 2/2 — an auth-required route responds (routes are wired)"
  CODE=$(curl -sS -o /dev/null -w '%{http_code}' "$API/api/journeys/templates")
  if [ "$CODE" = "401" ]; then
    pass "protected route reachable and rejecting anonymous ($CODE)"
  else
    fail "expected 401, got $CODE"
    exit 1
  fi

  phase "NEXT"
  info "Production looks healthy on the new code."
  info "Re-run with --delete to remove the variables."
  exit 0
fi

# ---------------------------------------------------------------------------
# Dry run and delete both start by reading the current state.
# ---------------------------------------------------------------------------
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
TOTAL_FREED=0

for FN in "${FUNCTIONS[@]}"; do
  phase "$FN"

  ENV_JSON=$(aws lambda get-function-configuration --function-name "$FN" --region "$REGION" \
    --query 'Environment.Variables' --output json 2>/dev/null) || {
    fail "could not read $FN (skipping)"
    continue
  }

  KEEP=$(echo "$ENV_JSON" | jq 'with_entries(select(.key | startswith("DYNAMODB_TABLE_") | not))')
  DROP=$(echo "$ENV_JSON" | jq 'with_entries(select(.key | startswith("DYNAMODB_TABLE_")))')
  DROP_COUNT=$(echo "$DROP" | jq 'length')

  BEFORE=$(echo "$ENV_JSON" | jq -r 'to_entries | map((.key|length) + (.value|length)) | add')
  AFTER=$(echo "$KEEP" | jq -r 'to_entries | map((.key|length) + (.value|length)) | add')
  FREED=$(( BEFORE - AFTER ))
  TOTAL_FREED=$(( TOTAL_FREED + FREED ))

  info "vars: $(echo "$ENV_JSON" | jq 'length') -> $(echo "$KEEP" | jq 'length')   bytes: $BEFORE -> $AFTER (frees $FREED)"

  if [ "$DROP_COUNT" = "0" ]; then
    pass "already consolidated, nothing to delete"
    continue
  fi

  # The backup IS the rollback. Written before any mutation, every time.
  BACKUP_FILE="$BACKUP_DIR/$FN-$(date +%Y%m%d-%H%M%S).json"
  echo "$ENV_JSON" > "$BACKUP_FILE"
  info "backup: $BACKUP_FILE"

  if [ "$MODE" = "dryrun" ]; then
    info "would delete $DROP_COUNT vars:"
    echo "$DROP" | jq -r 'keys[]' | sed 's/^/          /'
    continue
  fi

  aws lambda update-function-configuration --function-name "$FN" --region "$REGION" \
    --environment "{\"Variables\":$KEEP}" >/dev/null
  aws lambda wait function-updated --function-name "$FN" --region "$REGION"
  pass "deleted $DROP_COUNT vars, freed $FREED bytes"
  info "rollback: aws lambda update-function-configuration --function-name $FN --region $REGION --environment \"{\\\"Variables\\\":\$(cat $BACKUP_FILE)}\""
done

phase "SUMMARY"
if [ "$MODE" = "dryrun" ]; then
  info "DRY RUN — nothing changed. Total that would be freed: $TOTAL_FREED bytes."
  info "Run --verify against production first, then --delete."
else
  info "Freed $TOTAL_FREED bytes total."
  info "Smoke-test production now. If anything is wrong, restore from $BACKUP_DIR."
fi
