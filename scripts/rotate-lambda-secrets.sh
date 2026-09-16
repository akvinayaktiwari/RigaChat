#!/bin/bash
set -euo pipefail

# Replaces one or more secrets across all three Lambdas, safely.
#
# WHY THIS EXISTS. Rotating a credential means changing it at the provider AND
# in the Lambda environment. The second half is where the damage happens:
# `aws lambda update-function-configuration --environment` REPLACES the entire
# variable map, so a hand-rolled update deletes OPENAI_API_KEY, the Cognito ids
# and everything else on that function. This read-modify-writes instead, and
# refuses to finish if the variable count moved.
#
# It also never puts a secret on a command line or in terminal output. Values
# are read from a file, passed to the CLI through a 0600 temp file, and the
# CLI's stderr is captured rather than streamed -- because an AWS error quotes
# the parameter it rejected, which is exactly how a full environment dump ended
# up in a transcript on 2026-09-16.
#
# USAGE
#   umask 077
#   cat > ~/.rotate.env        # only the vars you are rotating, KEY=VALUE per line
#   NEW_OPENAI... etc are NOT used; use the REAL variable names:
#     OPENAI_API_KEY=sk-...
#     PINECONE_API_KEY=pcsk_...
#
#   ./scripts/rotate-lambda-secrets.sh ~/.rotate.env          # dry run
#   ./scripts/rotate-lambda-secrets.sh ~/.rotate.env --apply  # write
#
# Rotate at the provider FIRST, then run this. A Lambda holding a key the
# provider has already revoked fails every call until this runs.

REGION="${AWS_REGION:-ap-south-1}"
FUNCTIONS=(rigachat-api rigachat-api-streaming rigachat-crawler)
SOURCE_FILE="${1:-}"
APPLY=false
[[ "${2:-}" == "--apply" ]] && APPLY=true

command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

if [[ -z "$SOURCE_FILE" || ! -f "$SOURCE_FILE" ]]; then
  echo "Usage: $0 <env-file> [--apply]" >&2
  echo "  The env file holds KEY=VALUE lines for ONLY the variables being rotated." >&2
  exit 1
fi

# Refuse a world-readable file holding live credentials.
perms="$(stat -f '%Lp' "$SOURCE_FILE" 2>/dev/null || stat -c '%a' "$SOURCE_FILE")"
if [[ "$perms" != "600" ]]; then
  echo "$SOURCE_FILE is mode $perms — expected 600. Run: chmod 600 $SOURCE_FILE" >&2
  exit 1
fi

# Parse into JSON without ever echoing a value. Keys are validated so a stray
# line cannot inject an unexpected variable name.
updates="$(jq -Rn '
  [inputs
   | select(length > 0 and (startswith("#") | not))
   | capture("^(?<k>[A-Z0-9_]+)=(?<v>.*)$")
   | {(.k): .v}]
  | add // {}' < "$SOURCE_FILE")"

keys="$(jq -r 'keys[]' <<<"$updates")"
count="$(jq 'length' <<<"$updates")"
if [[ "$count" -eq 0 ]]; then
  echo "No KEY=VALUE lines found in $SOURCE_FILE." >&2
  exit 1
fi

echo "==> Rotating $count variable(s):"
printf '      %s\n' $keys

# Every key must already exist on every function. A typo would otherwise ADD a
# variable rather than replace one, leaving the real secret in place and the
# rotation silently incomplete.
echo "==> Checking each name already exists on all three functions"
missing=0
for fn in "${FUNCTIONS[@]}"; do
  current="$(aws lambda get-function-configuration --function-name "$fn" \
    --region "$REGION" --query 'Environment.Variables' --output json)"
  for k in $keys; do
    if ! jq -e --arg k "$k" 'has($k)' <<<"$current" >/dev/null; then
      echo "  MISSING  $fn has no $k — check the spelling" >&2
      missing=$((missing + 1))
    fi
  done
done
(( missing == 0 )) || { echo "==> $missing missing name(s). Nothing written." >&2; exit 1; }
echo "  ok    all names present"

if ! $APPLY; then
  echo
  echo "==> Dry run. Nothing written. Re-run with --apply to rotate."
  exit 0
fi

echo
echo "==> Writing to all three Lambdas"
for fn in "${FUNCTIONS[@]}"; do
  current="$(aws lambda get-function-configuration --function-name "$fn" \
    --region "$REGION" --query 'Environment.Variables' --output json)"
  before="$(jq 'length' <<<"$current")"

  payload="$(mktemp)"
  chmod 600 "$payload"
  jq -c --argjson updates "$updates" '{Variables: (. + $updates)}' <<<"$current" > "$payload"

  if ! err="$(aws lambda update-function-configuration --function-name "$fn" --region "$REGION" \
      --environment "file://$payload" 2>&1 >/dev/null)"; then
    rm -f "$payload"
    echo "  FAIL  $fn: update failed." >&2
    echo "        ${err%%$'\n'*}" | cut -c1-200 >&2
    exit 1
  fi
  rm -f "$payload"

  aws lambda wait function-updated --function-name "$fn" --region "$REGION"
  after_env="$(aws lambda get-function-configuration --function-name "$fn" \
    --region "$REGION" --query 'Environment.Variables' --output json)"
  after="$(jq 'length' <<<"$after_env")"

  if [[ "$after" -ne "$before" ]]; then
    echo "  FAIL  $fn: variable count went $before -> $after. Something was dropped." >&2
    exit 1
  fi

  # Confirm each value actually changed, without printing any of them.
  for k in $keys; do
    old_hash="$(jq -r --arg k "$k" '.[$k]' <<<"$current" | shasum | cut -c1-8)"
    new_hash="$(jq -r --arg k "$k" '.[$k]' <<<"$after_env" | shasum | cut -c1-8)"
    if [[ "$old_hash" == "$new_hash" ]]; then
      echo "  WARN  $fn: $k is unchanged — same value as before?" >&2
    fi
  done
  echo "  ok    $fn ($after vars)"
done

echo
echo "==> Cold-starting each function"
for fn in "${FUNCTIONS[@]}"; do
  aws lambda invoke --function-name "$fn" --payload '{}' --region "$REGION" \
    --cli-binary-format raw-in-base64-out "/tmp/rotate-$fn.json" >/dev/null
  if jq -e 'has("errorType")' "/tmp/rotate-$fn.json" >/dev/null 2>&1; then
    echo "  FAIL  $fn threw on invoke: $(jq -r '.errorMessage' "/tmp/rotate-$fn.json")" >&2
    exit 1
  fi
  echo "  ok    $fn"
done

cat <<'DONE'

==> Rotated. Then:
  - Delete the env file you passed in.
  - Exercise one real path per rotated credential (a chat message for OpenAI,
    a KB search for Pinecone, a payment for Razorpay). A key that is wrong
    fails at the provider, not at deploy time.
DONE
