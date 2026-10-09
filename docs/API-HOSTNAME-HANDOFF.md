# api.vyostra.com: handoff for Claude Cowork

Written 2026-10-06 by Claude Code. Owner: Vinayak Tiwari.

## The goal

Developers who use the Vyostra AI API are currently shown a raw AWS address as the API base URL:

```
https://hxtvyv6kgsasppyrvyljaezeii0zxzco.lambda-url.ap-south-1.on.aws
```

It should be **`https://api.vyostra.com`**. The owner has decided on that exact hostname. Do not use `vyostra.com/v1` or any other name.

You are done when this command returns HTTP 401 with `"code":"invalid_api_key"`:

```bash
curl -i https://api.vyostra.com/v1/forms -H "Authorization: Bearer vy_live_notarealkey"
```

## What you are building

```
developer  ->  api.vyostra.com  (DNS record at Hostinger)
           ->  a NEW CloudFront distribution (HTTPS certificate from AWS ACM)
           ->  the existing Lambda Function URL (unchanged)
```

A Lambda Function URL cannot take a custom domain directly, which is why CloudFront sits in front. The new distribution serves only paths under `/v1`. Everything else on that hostname answers 404, so the dashboard's private routes are not reachable through it.

## Facts you need

| Thing | Value |
|---|---|
| AWS account | `291685935704` |
| Lambda region | `ap-south-1` (Mumbai) |
| Certificate region | `us-east-1` (N. Virginia). CloudFront only accepts certificates from this region. |
| Origin (the Lambda URL, no `https://`, no trailing slash) | `hxtvyv6kgsasppyrvyljaezeii0zxzco.lambda-url.ap-south-1.on.aws` |
| DNS host for vyostra.com | Hostinger (nameservers `aurora.dns-parking.com`, `nebula.dns-parking.com`). Not Route 53. |
| Cache policy to use | `CachingDisabled`, id `4135ea2d-6df8-44a3-9df3-4b5a84be39ad` |
| Origin request policy to use | `AllViewerExceptHostHeader`, id `b689b0a8-53d0-40ab-baf2-68738e2966ac` |
| Existing distribution to copy settings from (read only) | `E2ZWB77M7V8J9X` (vyostra.com), its `/api/*` behaviour |

The two policies are the ones the existing `/api/*` route already uses. `AllViewerExceptHostHeader` matters: it passes the `Authorization` header through to the Lambda, and the Lambda rejects a request whose `Host` header is not its own.

## Rules

- **Create only. Do not edit or delete anything that already exists.** That means: no changes to the four existing CloudFront distributions, the existing certificates, or any existing DNS record at Hostinger.
- **Do not change nameservers** at Hostinger. Only add two CNAME records.
- **Do not change the GitHub variable `VITE_API_URL`.** The whole dashboard uses it. A separate variable is used for this work (step 6).
- **Do not merge or push anything to `main`.** A push to `main` deploys to production. Step 6 is the owner's.
- If something does not match this document (a record named `api` already exists, a console screen looks different, a command errors), **stop and tell the owner** what you saw. Do not improvise around it.
- You will need the owner to be signed in to the AWS console and to Hostinger. Never ask for or type their passwords; ask them to sign in.

## Step 1: request the certificate

AWS console → switch region to **US East (N. Virginia) us-east-1** → Certificate Manager → Request → public certificate.

- Domain name: `api.vyostra.com` (only this one name)
- Validation method: **DNS validation**
- Key algorithm: RSA 2048

Or with the CLI:

```bash
aws acm request-certificate --region us-east-1 \
  --domain-name api.vyostra.com --validation-method DNS \
  --query CertificateArn --output text
```

Open the new certificate. It is "Pending validation" and shows one CNAME record: a **name** like `_3f2a….api.vyostra.com.` and a **value** like `_9c1b….acm-validations.aws.` Copy both. Keep the certificate ARN.

```bash
aws acm describe-certificate --region us-east-1 --certificate-arn <CERT_ARN> \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord'
```

## Step 2: add the validation record at Hostinger

Hostinger hPanel → Domains → vyostra.com → DNS / Nameservers → DNS records → add a record:

- Type: `CNAME`
- Name: the AWS name **without** `.vyostra.com.` on the end. If AWS shows `_3f2a….api.vyostra.com.`, enter `_3f2a….api`. Hostinger adds the domain itself; pasting the full name creates `…api.vyostra.com.vyostra.com`, which never validates.
- Target / Points to: the AWS value. Remove the trailing dot if Hostinger rejects it.
- TTL: leave the default.

Check it resolved (this can take a few minutes):

```bash
dig +short CNAME _3f2a….api.vyostra.com
```

Then wait for the certificate status to become **Issued**. This usually takes 5 to 30 minutes. Do not continue until it has.

```bash
aws acm describe-certificate --region us-east-1 --certificate-arn <CERT_ARN> \
  --query Certificate.Status --output text
```

Leave the validation record in place permanently. AWS uses it to renew the certificate each year.

## Step 3: create the CloudFront function that limits the hostname to /v1

AWS console → CloudFront → Functions → Create function.

- Name: `api-vyostra-v1-only`
- Runtime: `cloudfront-js-2.0`
- Code:

```js
function handler(event) {
  var uri = event.request.uri;
  if (uri === '/v1' || uri.indexOf('/v1/') === 0) {
    return event.request;
  }
  return {
    statusCode: 404,
    statusDescription: 'Not Found',
    headers: { 'content-type': { value: 'application/json' } },
    body: '{"error":{"code":"not_found","message":"No such endpoint."}}'
  };
}
```

Save, then **Publish**. An unpublished function cannot be attached. Copy its ARN.

## Step 4: create the distribution

AWS console → CloudFront → Create distribution. If the console offers plan tiers, choose pay-as-you-go. Settings:

**Origin**
- Origin domain: `hxtvyv6kgsasppyrvyljaezeii0zxzco.lambda-url.ap-south-1.on.aws` (type it; do not pick an S3 bucket from the list)
- Protocol: HTTPS only, TLSv1.2
- Origin name: `lambda-api`
- Response timeout: 60 seconds
- Origin access control: none

**Default cache behaviour**
- Viewer protocol policy: **HTTPS only**. Not "Redirect HTTP to HTTPS": an API client that follows a redirect can drop its `Authorization` header, and a plain-HTTP request carrying a key should fail outright.
- Allowed HTTP methods: `GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE`
- Cache policy: `CachingDisabled`
- Origin request policy: `AllViewerExceptHostHeader`
- Function associations → Viewer request → CloudFront Functions → `api-vyostra-v1-only`
- Compress objects: yes

**Settings**
- Alternate domain name (CNAME): `api.vyostra.com`
- Custom SSL certificate: the certificate from step 1
- Security policy: `TLSv1.2_2021`
- Web Application Firewall: do not enable (it is a paid add-on the owner has not asked for)
- Default root object: leave empty
- Description: `api.vyostra.com -> rigachat-api Lambda URL, /v1 only`

Create it. Note the distribution's domain name, which looks like `dxxxxxxxxxxxxx.cloudfront.net`. Wait until its status changes from "Deploying" to a date (about 5 minutes).

Test it before touching DNS, using the cloudfront.net name:

```bash
curl -i https://dxxxxxxxxxxxxx.cloudfront.net/v1/forms -H "Authorization: Bearer vy_live_notarealkey"
```

Expect HTTP 401 and `"code":"invalid_api_key"`. If it does not, stop; see "If a check fails" below.

## Step 5: point api.vyostra.com at the distribution

Hostinger → the same DNS records screen → add a record:

- Type: `CNAME`
- Name: `api`
- Target / Points to: the distribution's domain name, `dxxxxxxxxxxxxx.cloudfront.net`
- TTL: default

First check that no record named `api` already exists. If one does, stop and tell the owner.

## Checks (all five must pass)

```bash
# 1. DNS points at CloudFront
dig +short api.vyostra.com

# 2. A fake key reaches the backend, with the Authorization header intact
curl -i https://api.vyostra.com/v1/forms -H "Authorization: Bearer vy_live_notarealkey"
#    expect: 401, "code":"invalid_api_key"

# 3. No key at all
curl -i https://api.vyostra.com/v1/forms
#    expect: 401, "code":"missing_api_key"

# 4. Nothing outside /v1 is reachable
curl -i https://api.vyostra.com/api/leads
curl -i https://api.vyostra.com/
#    expect: 404, "code":"not_found" for both

# 5. Plain HTTP is refused, not redirected
curl -i http://api.vyostra.com/v1/forms
#    expect: 403
```

Check 2 is the important one. `invalid_api_key` proves the header arrived. If you get `missing_api_key` there instead, the `Authorization` header is being dropped and the origin request policy is wrong.

Also confirm nothing else moved:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://vyostra.com/        # expect 200
curl -s -o /dev/null -w '%{http_code}\n' https://vyostra.com/docs/   # expect 200
```

## If a check fails

| What you see | Likely cause |
|---|---|
| Certificate stuck on "Pending validation" for over an hour | The validation record's name was entered with the domain doubled, or with a typo. Compare `dig` output with the AWS value. |
| `403` with an HTML body mentioning CloudFront, on HTTPS | The alternate domain name or the certificate is missing from the distribution. |
| `403` with `{"Message":"Forbidden"}` or similar from AWS Lambda | The `Host` header is being forwarded. The origin request policy must be `AllViewerExceptHostHeader`. |
| `missing_api_key` in check 2 | `Authorization` is not forwarded. Same policy fix. |
| `404 not_found` on `/v1/forms` | The function is blocking it. Check the function code and that it is the published version. |
| `502` or `504` | The origin domain is wrong, or the origin protocol is not HTTPS only. |

To undo everything: delete the `api` CNAME at Hostinger first, then disable and delete the new distribution, then the function, then the certificate. Nothing existing depends on any of them.

## Step 6: hand back to the owner (not for Cowork)

Report to the owner: the certificate ARN, the distribution id and domain name, the two DNS records you added, and the output of the five checks.

Two things then remain, and they are done from Claude Code or by the owner, because they deploy to production:

1. Set the GitHub repository variable `VITE_PUBLIC_API_URL` to `https://api.vyostra.com` (no trailing slash).
2. Merge the branch `feat/public-api-base-url` into `main`. That branch already contains the code that makes Settings show the new variable instead of the Lambda address. It falls back to the old address while the variable is unset, so it is safe in either order.

After that deploy, Settings → API keys → "API base URL" should read `https://api.vyostra.com`.

## What this does not change

- The dashboard, the widgets and the marketing site keep calling the addresses they call today.
- The Lambda Function URL keeps working, so any integration already using it is unaffected.
- The public docs print no hostname (they say `$VYOSTRA_API_URL`), so they need no edit.
- The streaming chat Lambda is separate and is not part of the developer API.
