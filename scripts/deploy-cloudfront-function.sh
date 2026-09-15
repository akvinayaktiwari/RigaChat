#!/bin/bash
set -euo pipefail

# Ships deploy/cloudfront/viewer-request.js to the vyostra.com distribution's
# viewer-request function, but only after it passes the routing cases below
# against CloudFront's own runtime.
#
# This function decides what every page on vyostra.com serves -- which paths are
# real files, which are prerendered pages, which get the SPA shell -- and until
# 2026-09-16 its only copy lived in AWS. Neither CI nor scripts/deploy.sh ships
# it; this script is the one way it changes.
#
# ORDER MATTERS. Whatever this function points a path at must already be in the
# bucket before it publishes: /app-shell.html for client-rendered routes, and
# <route>/index.html for every PRERENDERED_PREFIXES entry -- deploy the build
# that writes those files first, or the route 404s.
#
#   ./scripts/deploy-cloudfront-function.sh --test   upload to DEVELOPMENT and test, publish nothing
#   ./scripts/deploy-cloudfront-function.sh          test, then publish to LIVE
#
# `aws cloudfront test-function` runs the real runtime but does NOT model
# response-phase restrictions (see the note in the function). Viewer-request
# rewrites, which is all this function does, test faithfully.

FUNCTION_NAME="${CLOUDFRONT_FUNCTION_NAME:-vyostra-www-to-apex-redirect}"
SOURCE="$(cd "$(dirname "$0")/.." && pwd)/deploy/cloudfront/viewer-request.js"
TEST_ONLY=false
[[ "${1:-}" == "--test" ]] && TEST_ONLY=true

command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

etag_of() {
  aws cloudfront describe-function --name "$FUNCTION_NAME" --stage DEVELOPMENT --query ETag --output text
}

event_for() {
  local host="$1" uri="$2"
  jq -n --arg host "$host" --arg uri "$uri" '{
    version: "1.0",
    context: { eventType: "viewer-request" },
    viewer: { ip: "198.51.100.1" },
    request: { method: "GET", uri: $uri, querystring: {}, headers: { host: { value: $host } }, cookies: {} }
  }'
}

# expect <host> <uri> <jq filter over FunctionOutput> <expected value>
FAILURES=0
expect() {
  local host="$1" uri="$2" filter="$3" want="$4"
  local event_file output got
  # A file, not an inline string: CLI v2 reads blob arguments as base64.
  event_file="$(mktemp)"
  event_for "$host" "$uri" > "$event_file"
  output="$(aws cloudfront test-function --name "$FUNCTION_NAME" --if-match "$(etag_of)" \
    --stage DEVELOPMENT --event-object "fileb://$event_file" --query 'TestResult.FunctionOutput' --output text)"
  rm -f "$event_file"
  got="$(printf '%s' "$output" | jq -r "$filter")"
  if [[ "$got" == "$want" ]]; then
    echo "  ok    $host$uri -> $got"
  else
    echo "  FAIL  $host$uri: expected $want, got $got" >&2
    FAILURES=$((FAILURES + 1))
  fi
}

echo "==> Uploading $SOURCE to $FUNCTION_NAME (DEVELOPMENT stage)"
CONFIG="$(aws cloudfront describe-function --name "$FUNCTION_NAME" --query 'FunctionSummary.FunctionConfig' --output json)"
aws cloudfront update-function --name "$FUNCTION_NAME" --if-match "$(etag_of)" \
  --function-config "$CONFIG" --function-code "fileb://$SOURCE" >/dev/null

echo "==> Testing routing against the CloudFront runtime"
expect www.vyostra.com /pricing '.response.statusCode'                         '301'
expect www.vyostra.com /pricing '.response.headers.location.value'             'https://vyostra.com/pricing'
expect vyostra.com     /        '.request.uri'                                 '/'
expect vyostra.com     /help    '.request.uri'                                 '/app-shell.html'
expect vyostra.com     /dashboard/leads '.request.uri'                         '/app-shell.html'
expect vyostra.com     /robots.txt '.request.uri'                              '/robots.txt'
expect vyostra.com     /assets/index-abc.js '.request.uri'                     '/assets/index-abc.js'
# Prerendered directories: the slash form is served, the bare form 301s to it.
expect vyostra.com     /features/ '.request.uri'                               '/features/'
expect vyostra.com     /features/crm/ '.request.uri'                           '/features/crm/'
expect vyostra.com     /features '.response.statusCode'                        '301'
expect vyostra.com     /features/crm '.response.headers.location.value'        '/features/crm/'
expect vyostra.com     /blog    '.response.headers.location.value'             '/blog/'
expect vyostra.com     /privacy-policy '.response.statusCode'                  '301'
# A path that merely STARTS with a prerendered prefix is not one.
expect vyostra.com     /blogging '.request.uri'                                '/app-shell.html'
expect vyostra.com     /featuresx '.request.uri'                               '/app-shell.html'

if (( FAILURES > 0 )); then
  echo "==> $FAILURES case(s) failed. LIVE is unchanged; DEVELOPMENT holds the failing code." >&2
  exit 1
fi

if $TEST_ONLY; then
  echo "==> All cases pass. --test given, so LIVE is unchanged."
  exit 0
fi

echo "==> Publishing to LIVE"
aws cloudfront publish-function --name "$FUNCTION_NAME" --if-match "$(etag_of)" >/dev/null
echo "==> Published. Propagation to edge locations takes a few minutes."
