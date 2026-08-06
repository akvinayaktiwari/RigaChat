import {
  createContactMessage,
  markContactMessageNotified,
} from '../repositories/contact-message-repository.js'
import {
  getContactNotificationAddress,
  sendEmail,
} from '../repositories/email-repository.js'
import { tryAcquireContactAttempt } from '../repositories/redis-repository.js'
import type {
  ContactMessage,
  SubmitContactMessageInput,
  SubmitContactMessageResult,
} from '../types/index.js'

export type ContactErrorCode = 'VALIDATION' | 'RATE_LIMITED'

export class ContactError extends Error {
  readonly code: ContactErrorCode

  constructor(code: ContactErrorCode, message: string) {
    super(message)
    this.name = 'ContactError'
    this.code = code
  }
}

// Deliberately loose: the goal is rejecting obvious junk before it reaches
// SES's Destination validation, not implementing RFC 5322. A real typo is
// caught by the reply bouncing, not by a stricter regex here.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const MAX_LENGTHS = {
  name: 100,
  email: 254, // RFC 5321 maximum address length
  subject: 200,
  message: 5000,
} as const

function requireField(value: string | undefined, field: keyof typeof MAX_LENGTHS): string {
  const trimmed = (value ?? '').trim()

  if (!trimmed) {
    throw new ContactError('VALIDATION', `${field} is required`)
  }
  if (trimmed.length > MAX_LENGTHS[field]) {
    throw new ContactError('VALIDATION', `${field} must be ${MAX_LENGTHS[field]} characters or fewer`)
  }

  return trimmed
}

function validate(input: SubmitContactMessageInput): Omit<SubmitContactMessageInput, 'company'> {
  const email = requireField(input.email, 'email')

  if (!EMAIL_PATTERN.test(email)) {
    throw new ContactError('VALIDATION', 'A valid email address is required')
  }

  return {
    name: requireField(input.name, 'name'),
    email,
    subject: requireField(input.subject, 'subject'),
    message: requireField(input.message, 'message'),
  }
}

// Fails OPEN on a Redis outage, unlike quickSignup (which lets the error
// surface as a 500). The asymmetry is deliberate: this limiter only guards
// against spam volume, and a rejected genuine inquiry is lost revenue we
// never find out about, while spam that slips through during an outage is
// visible and deletable. Logged at error level so an outage is not silent.
async function isWithinRateLimit(sourceIp: string, email: string): Promise<boolean> {
  try {
    return await tryAcquireContactAttempt(sourceIp, email)
  } catch (error) {
    console.error(
      'Contact rate-limit check failed (allowing submission through):',
      error instanceof Error ? error.message : String(error)
    )
    return true
  }
}

function buildNotificationBody(record: ContactMessage): string {
  return [
    `From: ${record.name} <${record.email}>`,
    `Subject: ${record.subject}`,
    `Received: ${record.createdAt}`,
    `Source IP: ${record.sourceIp}`,
    `Message ID: ${record.messageId}`,
    '',
    record.message,
  ].join('\n')
}

// Best-effort by design: the submitter already has a durable record in
// DynamoDB by the time this runs, so an SES outage (or SES simply not being
// configured yet) must not fail their request. Failures leave notified=false
// on the row, which is the signal to go read it manually.
async function notify(record: ContactMessage): Promise<boolean> {
  const destination = getContactNotificationAddress()

  if (!destination) {
    console.warn(
      `Contact message ${record.messageId} stored but not emailed: SES_FROM_EMAIL / CONTACT_NOTIFICATION_EMAIL are not set.`
    )
    return false
  }

  try {
    await sendEmail({
      to: destination,
      subject: `[Contact] ${record.subject}`,
      textBody: buildNotificationBody(record),
      replyTo: record.email,
    })
    return true
  } catch (error) {
    console.error(
      `Contact message ${record.messageId} stored but notification email failed:`,
      error instanceof Error ? error.message : String(error)
    )
    return false
  }
}

export async function submitContactMessage(
  input: SubmitContactMessageInput,
  sourceIp: string
): Promise<SubmitContactMessageResult> {
  // Honeypot check runs before validation so a bot learns nothing from the
  // response shape: it gets the same 201 a real submission gets, with no
  // record written and no email sent.
  if (input.company && input.company.trim()) {
    console.warn(`Contact submission dropped (honeypot filled) from ip ${sourceIp}`)
    return { messageId: 'dropped', createdAt: new Date().toISOString() }
  }

  const fields = validate(input)

  if (!(await isWithinRateLimit(sourceIp, fields.email))) {
    throw new ContactError('RATE_LIMITED', 'Please wait a moment before sending another message.')
  }

  const record = await createContactMessage({
    ...fields,
    sourceIp,
    notified: false,
  })

  const notified = await notify(record)

  if (notified) {
    // Non-fatal: the message is already stored and the email already went out,
    // so a failed flag write must not turn a delivered notification into a
    // 500 for the visitor. Worst case the row under-reports as un-notified.
    await markContactMessageNotified(record.messageId).catch((error: unknown) => {
      console.error(
        `Failed to flag contact message ${record.messageId} as notified:`,
        error instanceof Error ? error.message : String(error)
      )
    })
  }

  return { messageId: record.messageId, createdAt: record.createdAt }
}
