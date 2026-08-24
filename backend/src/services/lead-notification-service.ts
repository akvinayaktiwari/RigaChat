// Tells a CLIENT that a new lead just arrived.
//
// This used to live in whatsapp-service.ts as a free-text send and it never
// worked. The reason is worth keeping written down, because the failure was
// invisible for months: a message to the client's own notificationNumber is
// always business-initiated. That number never messages the business, so its
// 24h customer-service window is permanently closed, and Meta answers a
// free-text send there with error 131047 "Re-engagement message". Crucially it
// answers it TWICE -- the send API returns 200 with a real wamid (so the code
// logged `success: true`), and only the asynchronous status webhook carries the
// failure. Production had 22 of these in 30 days against 0 delivered lead
// notifications.
//
// So: templates only on this path, and delivery is judged by the status
// webhook, never by the send response. Both rules are load-bearing.

import { appendLeadEvent } from '../repositories/lead-event-repository.js'
import { getClientById } from '../repositories/client-repository.js'
import { sendEmail, EmailNotConfiguredError } from '../repositories/email-repository.js'
import { sendWhatsAppTemplateToClientNumber } from './whatsapp-service.js'
import { flattenTemplateParam } from './notification-service.js'
import { templateLanguageOf } from '../lib/whatsapp-templates.js'
import type { WhatsAppSendResult } from '../lib/whatsapp-provider.js'

// Tried in order, first success wins -- the same fall-through
// notification-service.ts uses for handoff alerts, and for the same reason:
// a template pending Meta review must not take the notification down with it.
// Only one entry today; a `lead_notification_2` slots in here with no other
// change if _1 is ever rejected or recategorised.
export const LEAD_NOTIFICATION_TEMPLATES = ['lead_notification_1'] as const

// Meta rejects a send whose template parameter is an empty string, which turns
// "this lead did not fill in their phone" into a hard delivery failure. Every
// param goes through here.
const MISSING_VALUE = 'Not provided'

// Meta caps a body parameter at 1024 characters and rejects the whole send if
// any one exceeds it.
const PARAM_MAX_LENGTH = 700

export interface LeadNotificationInput {
  clientId: string
  leadId: string
  botId: string
  // {{1}} -- where the lead came from, e.g. 'Website chat', 'Meta Lead Ads'.
  source: string
  name?: string
  phone?: string
  // {{4}} -- whatever the client would want to see at a glance. Free-form
  // because a form lead's useful summary is its answers and a chat lead's is
  // its stated interest; the caller knows which, this service does not.
  interest?: string
}

// Rebuilds the notification input from the `result` blob stored on a
// notification_out event. Used by the delivery-status path, which has the
// event and nothing else. Falls back to a usable-but-vague source rather than
// refusing to send: a thin alert beats no alert.
export function notificationInputFromEvent(event: {
  leadId: string
  clientId: string
  botId: string
  result?: Record<string, unknown>
}): LeadNotificationInput {
  const stored = event.result ?? {}
  const text = (key: string): string | undefined =>
    typeof stored[key] === 'string' && stored[key] ? (stored[key] as string) : undefined

  return {
    clientId: event.clientId,
    leadId: event.leadId,
    botId: event.botId,
    source: text('source') ?? 'your website',
    ...(text('name') ? { name: text('name') as string } : {}),
    ...(text('phone') ? { phone: text('phone') as string } : {}),
    ...(text('interest') ? { interest: text('interest') as string } : {}),
  }
}

export interface LeadNotificationResult {
  notified: boolean
  // How the client was actually told. 'none' means nobody was told, which is
  // the outcome an operator most needs to be able to search for.
  via: 'whatsapp' | 'email' | 'none'
  wamid?: string
  error?: string
}

function param(value: string | undefined): string {
  const flattened = flattenTemplateParam(value ?? '')
  if (!flattened) return MISSING_VALUE
  return flattened.length <= PARAM_MAX_LENGTH ? flattened : `${flattened.slice(0, PARAM_MAX_LENGTH - 1)}…`
}

function emailBody(input: LeadNotificationInput, reason: string): string {
  return [
    `A new lead just came in from ${param(input.source)}.`,
    '',
    `Name:     ${param(input.name)}`,
    `Phone:    ${param(input.phone)}`,
    `Interest: ${param(input.interest)}`,
    '',
    'Open your Vyostra inbox to reply.',
    '',
    `(Sent by email because the WhatsApp alert could not be delivered: ${reason})`,
  ].join('\n')
}

// The email half of the fallback. Exported because the delivery-status path in
// meta-whatsapp-webhook-service.ts calls it too: a send that Meta ACCEPTED and
// then failed to deliver is exactly the case that made this whole file
// necessary, and it is only ever visible from the status webhook.
export async function sendLeadNotificationEmail(
  input: LeadNotificationInput,
  reason: string
): Promise<LeadNotificationResult> {
  try {
    const client = await getClientById(input.clientId)
    if (!client?.email) {
      console.error(
        `[lead-notification] no fallback address: client=${input.clientId} lead=${input.leadId}`
      )
      return { notified: false, via: 'none', error: `${reason}; client has no email on file` }
    }

    await sendEmail({
      to: client.email,
      subject: `New lead from ${param(input.source)}`,
      textBody: emailBody(input, reason),
    })

    await appendLeadEvent({
      leadId: input.leadId,
      clientId: input.clientId,
      botId: input.botId,
      type: 'notification_out',
      mode: 'free_text',
      body: `Lead alert emailed to ${client.email}`,
      reason,
    })

    console.log(
      `[lead-notification] delivered by email fallback: client=${input.clientId} lead=${input.leadId} reason="${reason}"`
    )
    return { notified: true, via: 'email' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // A missing SES config is a deployment gap, not a bug in this path, and it
    // reads very differently in the logs.
    if (error instanceof EmailNotConfiguredError) {
      console.error(
        `[lead-notification] NOBODY TOLD (email not configured): client=${input.clientId} lead=${input.leadId} whatsappReason="${reason}"`
      )
    } else {
      console.error(
        `[lead-notification] NOBODY TOLD (email failed): client=${input.clientId} lead=${input.leadId} whatsappReason="${reason}"`,
        message
      )
    }

    await appendLeadEvent({
      leadId: input.leadId,
      clientId: input.clientId,
      botId: input.botId,
      type: 'notification_out',
      body: 'Lead alert could not be delivered on any channel',
      reason: `${reason}; email fallback failed: ${message}`,
    })

    return { notified: false, via: 'none', error: `${reason}; email fallback failed: ${message}` }
  }
}

// NEVER THROWS. Same contract as the free-text version it replaces: a client
// who does not get told about a lead is bad, a lead that is not CAPTURED
// because telling the client failed is worse. Callers get a result to log.
export async function sendLeadNotification(
  input: LeadNotificationInput
): Promise<LeadNotificationResult> {
  try {
    const bodyParams = [param(input.source), param(input.name), param(input.phone), param(input.interest)]

    let result: WhatsAppSendResult | undefined
    for (const template of LEAD_NOTIFICATION_TEMPLATES) {
      result = await sendWhatsAppTemplateToClientNumber(
        input.clientId,
        template,
        bodyParams,
        templateLanguageOf(template)
      )

      if (result.success) {
        // The wamid is the whole point of recording this. It lands in the
        // sparse wamid GSI, which is how the delivery-status webhook finds its
        // way back here -- both to write a real 'delivered' onto the timeline
        // and to fire the email fallback if Meta says 'failed'. Without this
        // row a status arrives, matches nothing, and is dropped (see
        // meta-whatsapp-webhook-service.ts logStatuses).
        await appendLeadEvent({
          leadId: input.leadId,
          clientId: input.clientId,
          botId: input.botId,
          type: 'notification_out',
          channel: 'whatsapp',
          wamid: result.messageId,
          mode: 'template',
          templateName: template,
          body: `Lead alert sent to the client's WhatsApp`,
          // Carried so the delivery-status path can rebuild this exact
          // notification if Meta later reports it undelivered. Without it the
          // fallback email knows only a leadId and goes out reading
          // "Not provided" on every line, which is barely worth sending.
          result: {
            source: input.source,
            ...(input.name ? { name: input.name } : {}),
            ...(input.phone ? { phone: input.phone } : {}),
            ...(input.interest ? { interest: input.interest } : {}),
          },
        })

        console.log(
          `[lead-notification] accepted by Meta: template=${template} client=${input.clientId} lead=${input.leadId} wamid=${result.messageId}`
        )
        return { notified: true, via: 'whatsapp', ...(result.messageId ? { wamid: result.messageId } : {}) }
      }

      // Retryable means Meta was unavailable, not that this template is
      // unusable. Trying the next one would fail identically.
      if (result.retryable) break

      console.log(
        `[lead-notification] ${template} did not send (${result.error ?? 'no detail'}); trying the next template`
      )
    }

    // The send was REJECTED outright, so no wamid exists and no status webhook
    // will ever arrive for it. This is the only fallback trigger that can fire
    // here; the accepted-then-failed case belongs to the status path.
    return sendLeadNotificationEmail(input, result?.error ?? 'WhatsApp send failed with no detail')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(
      `[lead-notification] threw: client=${input.clientId} lead=${input.leadId}`,
      message
    )
    return sendLeadNotificationEmail(input, message)
  }
}
