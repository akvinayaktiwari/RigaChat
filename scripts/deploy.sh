#!/bin/bash
set -e

# --backend-only exists because that is the deploy that was actually safe
# during the 2026-08-06 GitHub Actions outage: the Lambda half never touches
# env vars. Without this flag the frontend config check below would abort the
# whole script when gh is unreachable -- blocking the one path that was never
# the problem.
#
# It used to be true that this half called update-function-code and nothing
# else. Step 4b now also sets memory-size, deliberately narrowly: a single
# scalar, written only when it differs, and never Environment -- which is the
# setting that must be sent whole and can therefore be wiped by a partial
# write. The safety property the flag depends on is "cannot destroy config",
# not "makes exactly one kind of API call".
BACKEND_ONLY=false
for ARG in "$@"; do
  case "$ARG" in
    --backend-only) BACKEND_ONLY=true ;;
    -h|--help)
      echo "Usage: $0 [--backend-only]"
      echo
      echo "  --backend-only   Build and deploy the 3 Lambdas, skip the"
      echo "                   frontend build, S3 sync and CloudFront"
      echo "                   invalidation. Needs no VITE_* values."
      exit 0
      ;;
    *) echo "Unknown argument: $ARG (try --help)"; exit 1 ;;
  esac
done

# All infra values default to the current RigaChat AWS setup but can be
# overridden by exporting the same-named env var before running this script.
AWS_REGION="${AWS_REGION:-ap-south-1}"
LAMBDA_FUNCTION_NAME="${LAMBDA_FUNCTION_NAME:-rigachat-api}"
LAMBDA_STREAMING_FUNCTION_NAME="${LAMBDA_STREAMING_FUNCTION_NAME:-rigachat-api-streaming}"
LAMBDA_CRAWLER_FUNCTION_NAME="${LAMBDA_CRAWLER_FUNCTION_NAME:-rigachat-crawler}"
S3_BUCKET_FRONTEND="${S3_BUCKET_FRONTEND:-rigachat-dashboard}"
S3_BUCKET_WIDGET="${S3_BUCKET_WIDGET:-rigachat-widget}"
# Deliberately NOT defaulted. Two CloudFront distributions serve the
# rigachat-dashboard bucket -- E24Z9D4G4FY8PH (alias beepboop.drsyeta.in, the
# retired domain) and E2ZWB77M7V8J9X (alias vyostra.com, live). The old default
# here was the retired one, so a manual deploy uploaded new files to S3 and
# then invalidated the wrong distribution: vyostra.com kept serving stale HTML
# while the script printed "Deployment complete!". Resolved by alias at Step 9
# instead; export CLOUDFRONT_DISTRIBUTION_ID to override.
CLOUDFRONT_DISTRIBUTION_ID="${CLOUDFRONT_DISTRIBUTION_ID:-}"
CLOUDFRONT_WIDGET_DISTRIBUTION_ID="${CLOUDFRONT_WIDGET_DISTRIBUTION_ID:-E2KNENIBJEZYTF}"
VOICE_WS_URL="${VOICE_WS_URL:-}"

# Memory is set here because nothing else records it. update-function-code does
# not touch it, so a function RECREATED from scratch comes back at Lambda's
# 128 MB default -- which is where rigachat-api actually was until 2026-08-26,
# reporting "Max Memory Used: 128 MB" against a 128 MB ceiling on every single
# invocation. It was not using exactly its limit, it was being clamped by it:
# raising it to 256 showed a true working set of 185 MB.
#
# 256 stays inside the always-free tier by a wide margin. At the traffic that
# prompted this (4,467 invocations / 3,444s over 30 days) it is 861 of the
# 400,000 free GB-seconds, and the 1M request limit binds long before memory.
LAMBDA_MEMORY_MB="${LAMBDA_MEMORY_MB:-256}"
# The crawler fetches and parses whole pages and was provisioned at 512
# deliberately; this script must not quietly halve it.
LAMBDA_CRAWLER_MEMORY_MB="${LAMBDA_CRAWLER_MEMORY_MB:-512}"

# Before anything reads repo state. `gh variable list` infers the repository
# from the working directory, so running this script by absolute path from
# somewhere else (the likely thing to do when CI is down and you are in a
# hurry) made every VITE_* resolve empty and aborted the deploy on a machine
# that was authenticated the whole time.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# --- Frontend build config -------------------------------------------------
#
# Skipped entirely under --backend-only: none of these values are read.
#
# These used to be hardcoded defaults, and they drifted: VITE_COGNITO_REDIRECT_URI
# still pointed at the retired beepboop.drsyeta.in, and the two staff-console
# variables were missing entirely, so a frontend built by this script logged
# users into the wrong domain and left the staff console with no Cognito config
# at all. The script is the documented fallback for a GitHub Actions outage --
# it shipped a broken dashboard precisely when nobody could afford one.
#
# So nothing here is hardcoded any more. Values come from the SAME GitHub repo
# variables the CI workflow reads, which makes drift structurally impossible.
# When gh is unavailable (or the outage is GitHub-wide), an exported env var
# wins; when neither exists the script ABORTS rather than guessing. A loud
# failure before the build is the whole point -- a silent stale value is what
# broke this before.
if [ "$BACKEND_ONLY" = false ]; then
GH_VARS_JSON=""
if command -v gh &>/dev/null && command -v jq &>/dev/null && gh auth status &>/dev/null; then
  GH_VARS_JSON="$(gh variable list --json name,value 2>/dev/null || echo "")"
elif command -v gh &>/dev/null && ! command -v jq &>/dev/null; then
  # Without this the abort below would tell you to run `gh auth login` when gh
  # is already authenticated and jq is the actual missing piece.
  echo "Note: gh is installed but jq is not, so repo variables cannot be read."
  echo "      Install jq (brew install jq) or export the VITE_* vars by hand."
fi

# Resolution order: exported env var > GitHub repo variable > abort.
resolve_var() {
  local name="$1"
  local from_env="${!name:-}"

  if [ -n "$from_env" ]; then
    printf '%s' "$from_env"
    return
  fi

  if [ -n "$GH_VARS_JSON" ]; then
    local from_gh
    from_gh="$(printf '%s' "$GH_VARS_JSON" | jq -r --arg n "$name" \
      '.[] | select(.name == $n) | .value' 2>/dev/null || echo "")"
    if [ -n "$from_gh" ] && [ "$from_gh" != "null" ]; then
      printf '%s' "$from_gh"
      return
    fi
  fi

  # Deliberately prints nothing. Each call runs in a command substitution
  # subshell, so appending to MISSING_VARS here would be invisible to the
  # caller -- the loop below re-derives the list in the current shell instead.
}

VITE_API_URL="$(resolve_var VITE_API_URL)"
VITE_COGNITO_DOMAIN="$(resolve_var VITE_COGNITO_DOMAIN)"
VITE_COGNITO_CLIENT_ID="$(resolve_var VITE_COGNITO_CLIENT_ID)"
VITE_COGNITO_REDIRECT_URI="$(resolve_var VITE_COGNITO_REDIRECT_URI)"
VITE_CDN_URL="$(resolve_var VITE_CDN_URL)"
VITE_STAFF_COGNITO_CLIENT_ID="$(resolve_var VITE_STAFF_COGNITO_CLIENT_ID)"
VITE_STAFF_COGNITO_REGION="$(resolve_var VITE_STAFF_COGNITO_REGION)"
# The RESPONSE_STREAM Function URL, used by /api/chat/message alone. Deliberately
# NOT in the required list below: an unset value falls back to VITE_API_URL in
# both the widget and DemoChat, which is exactly how chat behaved before this
# existed. A missing stream URL should cost word-by-word rendering, never a
# deploy.
VITE_STREAM_URL="$(resolve_var VITE_STREAM_URL)"

MISSING_VARS=()
for VAR in VITE_API_URL VITE_COGNITO_DOMAIN VITE_COGNITO_CLIENT_ID \
           VITE_COGNITO_REDIRECT_URI VITE_CDN_URL \
           VITE_STAFF_COGNITO_CLIENT_ID VITE_STAFF_COGNITO_REGION; do
  [ -z "${!VAR:-}" ] && MISSING_VARS+=("$VAR")
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
  echo "=============================="
  echo "Cannot build the frontend: ${#MISSING_VARS[@]} required value(s) unresolved."
  echo "=============================="
  for VAR in "${MISSING_VARS[@]}"; do echo "  $VAR"; done
  echo
  echo "They live in GitHub repo variables (Settings -> Secrets and variables"
  echo "-> Actions -> Variables). Either authenticate gh:"
  echo "    gh auth login"
  echo "or export them by hand before re-running, e.g.:"
  echo "    export ${MISSING_VARS[0]}='...'"
  echo
  echo "Refusing to fall back to hardcoded defaults -- that is what shipped a"
  echo "broken login the last time this script was reached for."
  exit 1
fi

# The widgets are injected with the same backend the dashboard talks to. CI
# keeps these as two separate settings (secrets.BACKEND_URL and
# vars.VITE_API_URL) that happen to hold the same value; coupling them here
# removes one more thing that can silently diverge.
BACKEND_URL="${BACKEND_URL:-$VITE_API_URL}"
fi

trap 'code=$?; rm -f frontend/.env.production; if [ $code -ne 0 ]; then echo "=============================="; echo "Deployment failed."; echo "=============================="; fi' EXIT


echo "==> Step 1: Checking AWS CLI installation..."
if ! command -v aws &> /dev/null; then
  echo "AWS CLI not found. Installing..."
  curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "/tmp/AWSCLIV2.pkg"
  sudo installer -pkg /tmp/AWSCLIV2.pkg -target /
fi
aws --version

echo "==> Step 2: Checking AWS credentials..."
if ! aws sts get-caller-identity --region "$AWS_REGION" &> /dev/null; then
  echo "AWS credentials not configured. Run: aws configure"
  echo "You will need:"
  echo "  AWS Access Key ID"
  echo "  AWS Secret Access Key"
  echo "  Default region: $AWS_REGION"
  exit 1
fi

echo "==> Step 3: Building backend..."
cd backend
npm ci
npm run build
cd ..
if [ ! -f backend/dist/index.js ]; then
  echo "Build failed: backend/dist/index.js not found."
  exit 1
fi

# Reads before it writes, for two reasons. An update-function-configuration
# call puts the function in Pending and forces another wait, so skipping the
# no-op keeps a repeat deploy as fast as it was. More importantly it keeps this
# script's promise intact: --backend-only is documented as safe during a CI
# outage BECAUSE it only ever calls update-function-code. This is the one
# exception, it touches memory-size and NOTHING else -- never Environment,
# which is the setting that has to be sent whole and can therefore be wiped.
ensure_lambda_memory() {
  local function_name="$1"
  local desired_mb="$2"

  local current_mb
  current_mb="$(aws lambda get-function-configuration \
    --function-name "$function_name" \
    --region "$AWS_REGION" \
    --query MemorySize --output text)"

  if [ "$current_mb" = "$desired_mb" ]; then
    echo "    ${function_name}: memory already ${desired_mb} MB"
    return 0
  fi

  echo "    ${function_name}: memory ${current_mb} MB -> ${desired_mb} MB"
  aws lambda update-function-configuration \
    --function-name "$function_name" \
    --memory-size "$desired_mb" \
    --region "$AWS_REGION" >/dev/null
  aws lambda wait function-updated \
    --function-name "$function_name" \
    --region "$AWS_REGION"
}

echo "==> Step 4: Deploying backend to Lambda..."
cd backend/dist
zip -r ../function.zip index.js
cd ../..

echo "Deploying to $LAMBDA_FUNCTION_NAME..."
aws lambda update-function-code \
  --function-name "$LAMBDA_FUNCTION_NAME" \
  --zip-file fileb://backend/function.zip \
  --region "$AWS_REGION"

echo "Waiting for $LAMBDA_FUNCTION_NAME update..."
aws lambda wait function-updated \
  --function-name "$LAMBDA_FUNCTION_NAME" \
  --region "$AWS_REGION"

echo "Deploying to $LAMBDA_STREAMING_FUNCTION_NAME..."
aws lambda update-function-code \
  --function-name "$LAMBDA_STREAMING_FUNCTION_NAME" \
  --zip-file fileb://backend/function.zip \
  --region "$AWS_REGION"

echo "Waiting for $LAMBDA_STREAMING_FUNCTION_NAME update..."
aws lambda wait function-updated \
  --function-name "$LAMBDA_STREAMING_FUNCTION_NAME" \
  --region "$AWS_REGION"

echo "Deploying to $LAMBDA_CRAWLER_FUNCTION_NAME..."
aws lambda update-function-code \
  --function-name "$LAMBDA_CRAWLER_FUNCTION_NAME" \
  --zip-file fileb://backend/function.zip \
  --region "$AWS_REGION"

echo "Waiting for $LAMBDA_CRAWLER_FUNCTION_NAME update..."
aws lambda wait function-updated \
  --function-name "$LAMBDA_CRAWLER_FUNCTION_NAME" \
  --region "$AWS_REGION"

# After the code updates, never between them: Lambda rejects a configuration
# change while a code update is still Pending (ResourceConflictException), and
# the waits above are what guarantee it is not.
echo "==> Step 4b: Enforcing Lambda memory sizes..."
ensure_lambda_memory "$LAMBDA_FUNCTION_NAME" "$LAMBDA_MEMORY_MB"
ensure_lambda_memory "$LAMBDA_STREAMING_FUNCTION_NAME" "$LAMBDA_MEMORY_MB"
ensure_lambda_memory "$LAMBDA_CRAWLER_FUNCTION_NAME" "$LAMBDA_CRAWLER_MEMORY_MB"

if [ "$BACKEND_ONLY" = true ]; then
  echo "=============================="
  echo "Backend deployed (--backend-only)."
  echo "=============================="
  echo "Skipped: frontend build, S3 sync, CloudFront invalidation."
  echo "Updated: $LAMBDA_FUNCTION_NAME, $LAMBDA_STREAMING_FUNCTION_NAME, $LAMBDA_CRAWLER_FUNCTION_NAME"
  exit 0
fi

echo "==> Step 5: Building frontend..."
cd frontend
npm ci

# Wipe dist before building. Without this, artifacts from an EARLIER build
# survive into this one, and the pair uploaded at Step 8 can be mismatched:
# on 2026-08-22 a local `npm run build` (using .env, VITE_API_URL=localhost)
# ran before this script, and the deploy shipped that build's index.html
# alongside this build's assets. Step 8 syncs with --delete, so index.html
# pointed at a bundle that had just been deleted from the bucket. The site
# survived only on CloudFront's cache: once it expired, every visitor would
# have 404'd on the main bundle -- and the distribution's CustomErrorResponses
# rewrite 404 to index.html with HTTP 200, so it would have rendered a blank
# page with no error anywhere. Vite only cleans dist when outDir is inside
# root, which is why this is explicit.
rm -rf dist

# Create temporary production env file for build
# Must stay in sync with the "Build frontend" step of .github/workflows/ci.yml.
# The two VITE_STAFF_* lines were missing before: useStaffAuth.ts reads
# VITE_STAFF_COGNITO_CLIENT_ID, so without them the staff console builds with
# an undefined Cognito client and cannot sign anyone in.
cat > .env.production << EOF
VITE_API_URL=${VITE_API_URL}
VITE_COGNITO_DOMAIN=${VITE_COGNITO_DOMAIN}
VITE_COGNITO_CLIENT_ID=${VITE_COGNITO_CLIENT_ID}
VITE_COGNITO_REDIRECT_URI=${VITE_COGNITO_REDIRECT_URI}
VITE_CDN_URL=${VITE_CDN_URL}
VITE_STAFF_COGNITO_CLIENT_ID=${VITE_STAFF_COGNITO_CLIENT_ID}
VITE_STAFF_COGNITO_REGION=${VITE_STAFF_COGNITO_REGION}
VITE_STREAM_URL=${VITE_STREAM_URL}
EOF

npm run build

# Remove temp production env file after build
rm -f .env.production

cd ..
if [ ! -f frontend/dist/index.html ]; then
  echo "Build failed: frontend/dist/index.html not found."
  exit 1
fi

# Existence is not enough -- index.html has to reference assets that this build
# actually produced. See the rm -rf dist comment above for the failure this
# catches. Checked BEFORE any upload so a mismatch fails the deploy instead of
# reaching S3, where --delete makes it a silent outage rather than an error.
echo "==> Step 5b: Verifying build artifacts are self-consistent..."
MISSING_ASSETS=""
for REF in $(grep -oE '/assets/[A-Za-z0-9_.-]+\.(js|css)' frontend/dist/index.html | sort -u); do
  if [ ! -f "frontend/dist${REF}" ]; then
    MISSING_ASSETS="${MISSING_ASSETS}  ${REF}\n"
  fi
done
if [ -n "$MISSING_ASSETS" ]; then
  echo "Build is inconsistent: index.html references assets that do not exist:"
  printf "%b" "$MISSING_ASSETS"
  echo "Nothing has been uploaded. Re-run the deploy (dist is wiped at Step 5)."
  exit 1
fi
echo "    index.html references only assets present in this build."

# Falls back to BACKEND_URL rather than leaving the placeholder in place: the
# widget guards against an unsubstituted value, but an empty string would make
# it fetch a relative '/api/chat/message' against the CUSTOMER's own domain,
# which is a 404 on their site rather than a visible deploy failure.
STREAM_URL="${STREAM_URL:-${VITE_STREAM_URL:-$BACKEND_URL}}"

echo "==> Step 6: Injecting BACKEND_URL and STREAM_URL into widget.js..."
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s|__BACKEND_URL__|${BACKEND_URL}|g" frontend/dist/widget.js
  sed -i '' "s|__STREAM_URL__|${STREAM_URL}|g" frontend/dist/widget.js
else
  sed -i "s|__BACKEND_URL__|${BACKEND_URL}|g" frontend/dist/widget.js
  sed -i "s|__STREAM_URL__|${STREAM_URL}|g" frontend/dist/widget.js
fi

echo "==> Step 6b: Injecting BACKEND_URL into form-widget.js..."
# CI injects and uploads this one too; this script never did, so a manual
# deploy left the form widget on the CDN pointing at whatever backend the
# previous deploy baked in.
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s|__BACKEND_URL__|${BACKEND_URL}|g" frontend/dist/form-widget.js
else
  sed -i "s|__BACKEND_URL__|${BACKEND_URL}|g" frontend/dist/form-widget.js
fi

echo "==> Step 6c: Injecting BACKEND_URL and VOICE_WS_URL into voice-widget.js..."
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s|__BACKEND_URL__|${BACKEND_URL}|g" frontend/dist/voice-widget.js
  sed -i '' "s|__WS_URL__|${VOICE_WS_URL}|g" frontend/dist/voice-widget.js
else
  sed -i "s|__BACKEND_URL__|${BACKEND_URL}|g" frontend/dist/voice-widget.js
  sed -i "s|__WS_URL__|${VOICE_WS_URL}|g" frontend/dist/voice-widget.js
fi

echo "==> Step 7: Deploying widget to S3..."
aws s3 cp frontend/dist/widget.js \
  s3://"$S3_BUCKET_WIDGET"/widget.js \
  --cache-control "public, max-age=3600" \
  --region "$AWS_REGION"

aws s3 cp frontend/dist/form-widget.js \
  s3://"$S3_BUCKET_WIDGET"/form-widget.js \
  --cache-control "public, max-age=3600" \
  --region "$AWS_REGION"

aws s3 cp frontend/dist/voice-widget.js \
  s3://"$S3_BUCKET_WIDGET"/voice-widget.js \
  --cache-control "public, max-age=3600" \
  --region "$AWS_REGION"

echo "==> Step 8: Deploying frontend to S3..."
aws s3 sync frontend/dist/ s3://"$S3_BUCKET_FRONTEND" \
  --exclude "index.html" \
  --cache-control "public, max-age=31536000, immutable" \
  --delete \
  --region "$AWS_REGION"

aws s3 cp frontend/dist/index.html \
  s3://"$S3_BUCKET_FRONTEND"/index.html \
  --cache-control "no-cache, no-store, must-revalidate" \
  --region "$AWS_REGION"

echo "==> Step 9: Invalidating CloudFront distributions..."

# Resolve the dashboard distribution from the domain users actually log in to
# rather than trusting a hardcoded id. SITE_HOST comes from the login redirect,
# which is the one value that is definitionally the live domain -- if it were
# wrong, login would already be broken and this deploy is not the problem.
if [ -z "$CLOUDFRONT_DISTRIBUTION_ID" ]; then
  SITE_HOST="$(printf '%s' "$VITE_COGNITO_REDIRECT_URI" | sed -E 's#^https?://##; s#/.*$##')"
  echo "    resolving the distribution serving ${SITE_HOST}..."
  # Nested filter, not contains(Aliases.Items, ...): the widget distribution
  # has no aliases at all, and contains() errors on its null Items rather than
  # skipping it.
  CLOUDFRONT_DISTRIBUTION_ID="$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?Aliases.Items[?@=='${SITE_HOST}']].Id | [0]" \
    --output text 2>/dev/null || echo "None")"
fi

if [ -z "$CLOUDFRONT_DISTRIBUTION_ID" ] || [ "$CLOUDFRONT_DISTRIBUTION_ID" = "None" ]; then
  echo "=============================="
  echo "Could not resolve the CloudFront distribution for the dashboard."
  echo "=============================="
  echo "The new files ARE uploaded to S3 -- only the cache invalidation is"
  echo "missing, so the site will keep serving the old build until you run:"
  echo "    aws cloudfront create-invalidation --distribution-id <id> --paths '/*'"
  echo
  echo "Find the id with:"
  echo "    aws cloudfront list-distributions \\"
  echo "      --query 'DistributionList.Items[].{id:Id,alias:Aliases.Items[0]}' --output table"
  exit 1
fi

echo "    dashboard: ${CLOUDFRONT_DISTRIBUTION_ID}"
aws cloudfront create-invalidation \
  --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
  --paths "/*"

echo "    widget: ${CLOUDFRONT_WIDGET_DISTRIBUTION_ID}"
aws cloudfront create-invalidation \
  --distribution-id "$CLOUDFRONT_WIDGET_DISTRIBUTION_ID" \
  --paths "/*"

echo "=============================="
echo "Deployment complete!"
echo "=============================="
echo "Frontend: ${VITE_COGNITO_REDIRECT_URI%/auth/callback}"
echo "Widget CDN: ${VITE_CDN_URL}/widget.js"
echo "Backend: $BACKEND_URL"
echo "=============================="
echo "CloudFront may take 2-3 minutes to propagate"
echo "=============================="
