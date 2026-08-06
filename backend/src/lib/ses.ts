import { SESv2Client } from '@aws-sdk/client-sesv2'

const region = process.env.AWS_REGION

export const sesClient = new SESv2Client({ region })

export interface SesConfig {
  fromAddress: string
  contactNotificationAddress: string
}

// Read lazily (per send), never at module load: main/streaming/crawler Lambdas
// share one bundle that imports the whole route tree, so a module-load throw
// here would crash cold starts on every function over an env var only the
// contact form needs. Returns null instead of throwing when unconfigured —
// callers treat "no SES configured" as a delivery failure to degrade around,
// not as a reason to reject the request. See RAZORPAY_KEY_ID's note in
// .env.example for the failure mode this avoids.
export function getSesConfig(): SesConfig | null {
  const fromAddress = process.env.SES_FROM_EMAIL
  const contactNotificationAddress = process.env.CONTACT_NOTIFICATION_EMAIL

  if (!fromAddress || !contactNotificationAddress) {
    return null
  }

  return { fromAddress, contactNotificationAddress }
}
