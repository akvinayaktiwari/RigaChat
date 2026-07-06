# GitHub Actions Workflows

## ci.yml
Runs on every push (any branch) and on pull requests targeting `main`. Type-checks and
builds the backend and frontend in parallel jobs (`check-backend`, `check-frontend`).

## deploy.yml
Runs on push to `main` only. Deploys the backend to both Lambda functions and the
frontend/widget to S3 + CloudFront, in parallel jobs (`deploy-backend`, `deploy-frontend`),
followed by a `deploy-summary` job.

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
