# GitHub Actions Workflows

## ci.yml (workflow name: "CI/CD")
Runs on every push (any branch) and on pull requests targeting `main`.

- `check-backend` / `check-frontend`: type-check, test (backend only), and build. Run
  for every push and PR.
- `deploy-backend` / `deploy-frontend`: only run for pushes to `main`, and only after
  their matching `check-*` job succeeds (`needs:`) -- a failing type-check, test, or
  build blocks the deploy instead of racing it. Deploys the backend to both Lambda
  functions and the frontend/widget to S3 + CloudFront.
- `deploy-summary`: runs after both deploy jobs succeed.

(`deploy.yml` used to be a separate workflow, triggered independently on push to
`main` with no dependency on `ci.yml` -- merged in so CI actually gates CD.)

## Required GitHub Secrets

| Secret | Description |
| --- | --- |
| `AWS_ACCESS_KEY_ID` | AWS access key used to authenticate deploys |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key used to authenticate deploys |
| `AWS_REGION` | AWS region for all resources (`ap-south-1`) |
| `LAMBDA_FUNCTION_NAME` | Main (buffered) Lambda function name (`rigachat-api`) |
| `LAMBDA_STREAMING_FUNCTION_NAME` | Streaming Lambda function name (`rigachat-api-streaming`) |
| `S3_BUCKET_FRONTEND` | S3 bucket serving the CRM dashboard (`rigachat-dashboard`) |
| `S3_BUCKET_WIDGET` | S3 bucket serving the embeddable widget (`rigachat-widget`) |
| `CLOUDFRONT_DISTRIBUTION_ID` | CloudFront distribution ID for the dashboard |
| `CLOUDFRONT_WIDGET_DISTRIBUTION_ID` | CloudFront distribution ID for the widget |
| `BACKEND_URL` | Deployed Lambda function URL, injected into `widget.js` at deploy time |
