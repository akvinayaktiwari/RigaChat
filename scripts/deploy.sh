#!/bin/bash
set -e

# All infra values default to the current RigaChat AWS setup but can be
# overridden by exporting the same-named env var before running this script.
AWS_REGION="${AWS_REGION:-ap-south-1}"
LAMBDA_FUNCTION_NAME="${LAMBDA_FUNCTION_NAME:-rigachat-api}"
LAMBDA_STREAMING_FUNCTION_NAME="${LAMBDA_STREAMING_FUNCTION_NAME:-rigachat-api-streaming}"
S3_BUCKET_FRONTEND="${S3_BUCKET_FRONTEND:-rigachat-dashboard}"
S3_BUCKET_WIDGET="${S3_BUCKET_WIDGET:-rigachat-widget}"
CLOUDFRONT_DISTRIBUTION_ID="${CLOUDFRONT_DISTRIBUTION_ID:-E24Z9D4G4FY8PH}"
CLOUDFRONT_WIDGET_DISTRIBUTION_ID="${CLOUDFRONT_WIDGET_DISTRIBUTION_ID:-E2KNENIBJEZYTF}"
BACKEND_URL="${BACKEND_URL:-https://hxtvyv6kgsasppyrvyljaezeii0zxzco.lambda-url.ap-south-1.on.aws}"
VITE_COGNITO_DOMAIN="${VITE_COGNITO_DOMAIN:-ap-south-1d7y7lw8aj.auth.ap-south-1.amazoncognito.com}"
VITE_COGNITO_CLIENT_ID="${VITE_COGNITO_CLIENT_ID:-bia5g9e6gsb3h9n191rcvkugn}"
VITE_COGNITO_REDIRECT_URI="${VITE_COGNITO_REDIRECT_URI:-https://beepboop.drsyeta.in/auth/callback}"
VITE_CDN_URL="${VITE_CDN_URL:-https://d30yf1mzs1yo7h.cloudfront.net}"

trap 'code=$?; rm -f frontend/.env.production; if [ $code -ne 0 ]; then echo "=============================="; echo "Deployment failed."; echo "=============================="; fi' EXIT

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

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

echo "==> Step 5: Building frontend..."
cd frontend
npm ci

# Create temporary production env file for build
cat > .env.production << EOF
VITE_API_URL=${BACKEND_URL}
VITE_COGNITO_DOMAIN=${VITE_COGNITO_DOMAIN}
VITE_COGNITO_CLIENT_ID=${VITE_COGNITO_CLIENT_ID}
VITE_COGNITO_REDIRECT_URI=${VITE_COGNITO_REDIRECT_URI}
VITE_CDN_URL=${VITE_CDN_URL}
EOF

npm run build

# Remove temp production env file after build
rm -f .env.production

cd ..
if [ ! -f frontend/dist/index.html ]; then
  echo "Build failed: frontend/dist/index.html not found."
  exit 1
fi

echo "==> Step 6: Injecting BACKEND_URL into widget.js..."
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s|__BACKEND_URL__|${BACKEND_URL}|g" frontend/dist/widget.js
else
  sed -i "s|__BACKEND_URL__|${BACKEND_URL}|g" frontend/dist/widget.js
fi

echo "==> Step 7: Deploying widget to S3..."
aws s3 cp frontend/dist/widget.js \
  s3://"$S3_BUCKET_WIDGET"/widget.js \
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
aws cloudfront create-invalidation \
  --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
  --paths "/*"

aws cloudfront create-invalidation \
  --distribution-id "$CLOUDFRONT_WIDGET_DISTRIBUTION_ID" \
  --paths "/*"

echo "=============================="
echo "Deployment complete!"
echo "=============================="
echo "Frontend: https://d1gaddygcav1ob.cloudfront.net"
echo "Widget CDN: https://d30yf1mzs1yo7h.cloudfront.net/widget.js"
echo "Backend: $BACKEND_URL"
echo "=============================="
echo "CloudFront may take 2-3 minutes to propagate"
echo "=============================="
