#!/usr/bin/env bash
#
# Counts AI crawler hits on vyostra.com from CloudFront access logs.
#
# GA4 cannot answer this. GPTBot, OAI-SearchBot, PerplexityBot and the rest never
# run JavaScript, so they never fire a tag no matter what is added to the site.
# CloudFront standard logging (v2, delivery `vyostra-cf-access-logs` -> s3://vyostra-cf-logs)
# is the server-side record, and this reads it.
#
#   ./scripts/ai-crawler-hits.sh            # yesterday and today
#   ./scripts/ai-crawler-hits.sh 2026-09-18 # one day
#
# Logs arrive in batches, so the current hour is usually incomplete and a brand
# new delivery can take a few hours to write its first object. An empty result is
# "nothing delivered yet", which is not the same as "no crawler came".
set -euo pipefail

BUCKET="${CF_LOG_BUCKET:-vyostra-cf-logs}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

days=("$@")
if [ ${#days[@]} -eq 0 ]; then
  days=("$(date -u -v-1d +%Y/%m/%d 2>/dev/null || date -u -d yesterday +%Y/%m/%d)" "$(date -u +%Y/%m/%d)")
else
  days=("${days[@]//-//}")
fi

found=0
for day in "${days[@]}"; do
  # The delivery writes date-partitioned prefixes; sync only the days asked for
  # rather than pulling the whole bucket.
  if aws s3 cp "s3://$BUCKET/" "$WORK/" --recursive --exclude '*' --include "*${day}*" --only-show-errors 2>/dev/null; then
    found=1
  fi
done
[ "$found" -eq 1 ] || echo "No log objects matched ${days[*]} in s3://$BUCKET" >&2

files=$(find "$WORK" -type f | wc -l | tr -d ' ')
if [ "$files" -eq 0 ]; then
  echo "Nothing to read yet. Logs are delivered in batches; a new delivery can take a few hours."
  exit 0
fi

# gzip and plain are both possible depending on how the delivery is configured.
cat_logs() { find "$WORK" -type f -print0 | xargs -0 -I{} sh -c 'gzip -dc "{}" 2>/dev/null || cat "{}"'; }

echo "== AI crawler hits ($files log object(s), days: ${days[*]})"
cat_logs | grep -viE '^#' | grep -oiE 'GPTBot|OAI-SearchBot|ChatGPT-User|ClaudeBot|Claude-SearchBot|Claude-User|PerplexityBot|Google-Extended|Googlebot|bingbot|Applebot|CCBot|Bytespider' \
  | sort | uniq -c | sort -rn || echo "  none"

echo
echo "== Blog URLs those crawlers fetched"
cat_logs | grep -viE '^#' \
  | grep -iE 'GPTBot|OAI-SearchBot|ChatGPT-User|ClaudeBot|Claude-SearchBot|PerplexityBot|Googlebot|bingbot' \
  | grep -oE '/blog/[a-z0-9/-]*' | sort | uniq -c | sort -rn | head -20 || echo "  none"
