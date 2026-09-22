#!/usr/bin/env bash
#
# Point the dashboard bucket's website ErrorDocument at the prerendered 404 page.
#
# The bucket shipped with ErrorDocument=index.html. Since the homepage became
# prerendered (2026-09-16) that file is the full landing page, so every real 404
# -- a missing bundle, a mistyped asset path -- answers with a 404 status and a
# body that reads like a working homepage. dist/404.html is the NotFound page,
# which says what happened and carries robots noindex.
#
# Run this AFTER a deploy has put 404.html in the bucket: naming a key that does
# not exist yet turns every error response into S3's own XML.
#
# Idempotent -- setting the same document twice is the same end state.
set -euo pipefail

BUCKET="${BUCKET:-rigachat-dashboard}"
REGION="${AWS_REGION:-ap-south-1}"
INDEX_DOCUMENT="index.html"
ERROR_DOCUMENT="404.html"

echo "Bucket: s3://${BUCKET} (${REGION})"

if ! aws s3api head-object --bucket "$BUCKET" --key "$ERROR_DOCUMENT" --region "$REGION" >/dev/null 2>&1; then
  echo "ERROR: s3://${BUCKET}/${ERROR_DOCUMENT} does not exist." >&2
  echo "Deploy the frontend first (npm run build writes dist/${ERROR_DOCUMENT})." >&2
  exit 1
fi

echo "Current website configuration:"
aws s3api get-bucket-website --bucket "$BUCKET" --region "$REGION" || echo "  (none)"

aws s3api put-bucket-website \
  --bucket "$BUCKET" \
  --region "$REGION" \
  --website-configuration "{
    \"IndexDocument\": {\"Suffix\": \"${INDEX_DOCUMENT}\"},
    \"ErrorDocument\": {\"Key\": \"${ERROR_DOCUMENT}\"}
  }"

echo "Updated website configuration:"
aws s3api get-bucket-website --bucket "$BUCKET" --region "$REGION"

echo
echo "Verify against the live site (expect 404 plus the not-found page, not the homepage):"
echo "  curl -sI https://vyostra.com/assets/does-not-exist.js | head -1"
