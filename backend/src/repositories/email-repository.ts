import { SendEmailCommand } from '@aws-sdk/client-sesv2'
import { getSesConfig, sesClient } from '../lib/ses.js'

export interface SendEmailInput {
  to: string
  subject: string
  textBody: string
  // Set so hitting Reply in the inbox answers the person who wrote in, rather
  // than the noreply sender address the message was sent from.
  replyTo?: string
}

export class EmailNotConfiguredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmailNotConfiguredError'
  }
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const config = getSesConfig()

  if (!config) {
    throw new EmailNotConfiguredError(
      'Email delivery is not configured. Set SES_FROM_EMAIL and CONTACT_NOTIFICATION_EMAIL to enable it.'
    )
  }

  try {
    await sesClient.send(
      new SendEmailCommand({
        FromEmailAddress: config.fromAddress,
        Destination: { ToAddresses: [input.to] },
        ReplyToAddresses: input.replyTo ? [input.replyTo] : undefined,
        Content: {
          Simple: {
            Subject: { Data: input.subject, Charset: 'UTF-8' },
            Body: { Text: { Data: input.textBody, Charset: 'UTF-8' } },
          },
        },
      })
    )
  } catch (error) {
    throw new Error(
      `Failed to send email to ${input.to}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export function getContactNotificationAddress(): string | null {
  return getSesConfig()?.contactNotificationAddress ?? null
}
