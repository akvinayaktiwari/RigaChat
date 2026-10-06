#!/usr/bin/env bash
# Routes https://<site>/v1/* to the API Lambda, so the developer API has a
# vyostra.com address instead of a raw Lambda Function URL.
#
# It copies the distribution's existing /api/* behaviour -- same origin, same
# cache and origin-request policies -- under the path /v1/*. Copying rather
# than restating matters: AllViewerExceptHostHeader is what carries the
# Authorization header through and keeps the Host header off the Lambda, and a
# second hand-written copy of those ids is a copy that drifts.
#
# The one difference is the viewer protocol policy: https-only, not
# redirect-to-https. A client following a redirect can drop its Authorization
# header, and a key sent over plain HTTP should fail, not be quietly upgraded.
#
# Changes nothing else on the distribution, and is safe to run twice.
#
#   ./scripts/add-v1-cloudfront-route.sh            # apply
#   ./scripts/add-v1-cloudfront-route.sh --dry-run  # print what would change
#
# Needs AWS credentials and jq.
set -euo pipefail

SITE_HOST="${SITE_HOST:-vyostra.com}"
DRY_RUN=false
[ "${1:-}" = "--dry-run" ] && DRY_RUN=true

command -v jq >/dev/null || { echo "jq is required (brew install jq)"; exit 1; }

DIST_ID="$(aws cloudfront list-distributions --output json \
  | jq -r --arg host "$SITE_HOST" \
    '[.DistributionList.Items[] | select((.Aliases.Items // []) | index($host))][0].Id // empty')"
[ -n "$DIST_ID" ] || { echo "No CloudFront distribution serves $SITE_HOST"; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

aws cloudfront get-distribution-config --id "$DIST_ID" --output json > "$WORK/current.json"
ETAG="$(jq -r '.ETag' "$WORK/current.json")"

if jq -e '.DistributionConfig.CacheBehaviors.Items // [] | any(.PathPattern == "/v1/*")' "$WORK/current.json" >/dev/null; then
  echo "$DIST_ID already routes /v1/* -- nothing to do."
  exit 0
fi

jq -e '.DistributionConfig.CacheBehaviors.Items // [] | any(.PathPattern == "/api/*")' "$WORK/current.json" >/dev/null \
  || { echo "$DIST_ID has no /api/* behaviour to copy. Refusing to guess."; exit 1; }

jq '.DistributionConfig
    | (.CacheBehaviors.Items[] | select(.PathPattern == "/api/*")) as $api
    | .CacheBehaviors.Items += [$api + {PathPattern: "/v1/*", ViewerProtocolPolicy: "https-only"}]
    | .CacheBehaviors.Quantity = (.CacheBehaviors.Items | length)' \
  "$WORK/current.json" > "$WORK/next.json"

echo "Distribution: $DIST_ID ($SITE_HOST)"
echo "Behaviours now:   $(jq -c '[.DistributionConfig.CacheBehaviors.Items[].PathPattern]' "$WORK/current.json")"
echo "Behaviours after: $(jq -c '[.CacheBehaviors.Items[].PathPattern]' "$WORK/next.json")"

if $DRY_RUN; then
  echo "Dry run: nothing changed."
  exit 0
fi

aws cloudfront update-distribution --id "$DIST_ID" --if-match "$ETAG" \
  --distribution-config "file://$WORK/next.json" --query 'Distribution.Status' --output text
echo "Waiting for the change to reach every edge (a few minutes)..."
aws cloudfront wait distribution-deployed --id "$DIST_ID"

# invalid_api_key, specifically: it proves the request reached the Lambda AND
# that the Authorization header came with it. missing_api_key here would mean
# the header was dropped on the way.
RESPONSE="$(curl -s "https://$SITE_HOST/v1/forms" -H 'Authorization: Bearer vy_live_notarealkey')"
echo "GET https://$SITE_HOST/v1/forms -> $RESPONSE"
case "$RESPONSE" in
  *invalid_api_key*) echo "OK: /v1 is live on $SITE_HOST." ;;
  *) echo "UNEXPECTED: the route did not answer as the API. Check the distribution."; exit 1 ;;
esac
