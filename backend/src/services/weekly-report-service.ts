// The weekly "here is what your bot did" digest, sent to the CLIENT.
//
// Same defect, same fix, same reasoning as lead-notification-service.ts: this
// goes to the client's own notificationNumber, which never messages the
// business, so its 24h customer-service window is permanently closed. It
// shipped as a free-text send via provider.sendMessage and therefore never
// arrived once -- Meta accepts the call, returns a wamid, and then fails
// delivery asynchronously with 131047. Read that file's header for the whole
// story; the only thing different here is that a weekly digest belongs to no
// lead, so there is no lead_event to write and no wamid worth correlating.
//
// Lives in its own service rather than in whatsapp-service.ts because
// computing the digest means reading leads, and whatsapp-service.ts importing
// lead-service.js is what made lead-service -> lead-notification-service ->
// whatsapp-service -> lead-service a cycle. Transport stays in
// whatsapp-service; what to say and who to say it to lives here.

import { getClientById, getConnectedWhatsAppClients } from '../repositories/client-repository.js'
import { sendEmail, EmailNotConfiguredError } from '../repositories/email-repository.js'
import { sendWhatsAppTemplateToClientNumber } from './whatsapp-service.js'
import { getLeadsForClient as getChatLeadsForClient } from './lead-service.js'
import { getLeadsForClient as getFormLeadsForClient } from './form-lead-service.js'
import { templateLanguageOf } from '../lib/whatsapp-templates.js'

export const WEEKLY_REPORT_TEMPLATE = 'weekly_report_1'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export interface WeeklyReportCounts {
  total: number
  chat: number
  form: number
}

export interface WeeklyReportResult {
  sent: boolean
  via: 'whatsapp' | 'email' | 'none'
  counts?: WeeklyReportCounts
  // Set when nothing was sent on purpose rather than by failure, so a quiet
  // week does not read as an outage in the logs.
  skipReason?: 'client_not_found' | 'no_leads_this_week'
  error?: string
}

export async function countLeadsThisWeek(clientId: string): Promise<WeeklyReportCounts> {
  const since = Date.now() - WEEK_MS

  const [chatLeads, formLeads] = await Promise.all([
    getChatLeadsForClient(clientId),
    getFormLeadsForClient(clientId),
  ])

  const chat = chatLeads.filter((lead) => new Date(lead.createdAt).getTime() >= since).length
  const form = formLeads.filter((lead) => new Date(lead.createdAt).getTime() >= since).length

  return { total: chat + form, chat, form }
}

function emailBody(counts: WeeklyReportCounts, reason: string): string {
  return [
    'Your weekly Vyostra report',
    '',
    `New leads this week: ${counts.total}`,
    `- Chat widget: ${counts.chat}`,
    `- Forms: ${counts.form}`,
    '',
    'Open your dashboard for the details: https://vyostra.com/dashboard/leads',
    '',
    `(Sent by email because the WhatsApp report could not be delivered: ${reason})`,
  ].join('\n')
}

async function emailWeeklyReport(
  clientId: string,
  counts: WeeklyReportCounts,
  reason: string
): Promise<WeeklyReportResult> {
  try {
    const client = await getClientById(clientId)
    if (!client?.email) {
      return { sent: false, via: 'none', counts, error: `${reason}; client has no email on file` }
    }

    await sendEmail({
      to: client.email,
      subject: `Your weekly Vyostra report: ${counts.total} new lead${counts.total === 1 ? '' : 's'}`,
      textBody: emailBody(counts, reason),
    })

    console.log(`[weekly-report] delivered by email fallback: client=${clientId} reason="${reason}"`)
    return { sent: true, via: 'email', counts }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (error instanceof EmailNotConfiguredError) {
      console.error(
        `[weekly-report] NOT DELIVERED (email not configured): client=${clientId} whatsappReason="${reason}"`
      )
    } else {
      console.error(
        `[weekly-report] NOT DELIVERED (email failed): client=${clientId} whatsappReason="${reason}"`,
        message
      )
    }
    return { sent: false, via: 'none', counts, error: `${reason}; email fallback failed: ${message}` }
  }
}

// NEVER THROWS. sendWeeklyReportsForAllClients loops over every connected
// client, and one client's broken connection must not stop the other clients
// getting their report.
export async function sendWeeklyReport(clientId: string): Promise<WeeklyReportResult> {
  try {
    const client = await getClientById(clientId)
    if (!client) return { sent: false, via: 'none', skipReason: 'client_not_found' }

    const counts = await countLeadsThisWeek(clientId)

    // A digest that says "0 new leads" is not a report, it is a weekly
    // reminder that nothing happened. It also costs a paid template send per
    // client per week. The old code sent it regardless, which was harmless
    // only because none of them ever arrived.
    if (counts.total === 0) {
      console.log(`[weekly-report] skipped, no leads this week: client=${clientId}`)
      return { sent: false, via: 'none', counts, skipReason: 'no_leads_this_week' }
    }

    const result = await sendWhatsAppTemplateToClientNumber(
      clientId,
      WEEKLY_REPORT_TEMPLATE,
      [String(counts.total), String(counts.chat), String(counts.form)],
      templateLanguageOf(WEEKLY_REPORT_TEMPLATE)
    )

    if (result.success) {
      console.log(
        `[weekly-report] accepted by Meta: client=${clientId} leads=${counts.total} wamid=${result.messageId}`
      )
      return { sent: true, via: 'whatsapp', counts }
    }

    // No lead_event exists for a digest, so unlike a lead alert there is no
    // wamid row for a later 'failed' status to correlate against. The email
    // fallback therefore has to fire on the send result alone -- which means a
    // report Meta accepts and then fails to deliver is still lost. Acceptable
    // for a weekly digest in a way it never was for a lead; revisit if the
    // digest ever carries something time-critical.
    return emailWeeklyReport(clientId, counts, result.error ?? 'WhatsApp send failed with no detail')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[weekly-report] threw: client=${clientId}`, message)
    return { sent: false, via: 'none', error: message }
  }
}

export async function sendWeeklyReportsForAllClients(): Promise<void> {
  const clients = await getConnectedWhatsAppClients()

  let delivered = 0
  let skipped = 0
  let failed = 0

  for (const client of clients) {
    const result = await sendWeeklyReport(client.clientId)
    if (result.sent) delivered += 1
    else if (result.skipReason) skipped += 1
    else failed += 1
  }

  // One summary line rather than silence: this runs unattended on a schedule,
  // so the only way anyone learns it is broken is a log they can grep.
  console.log(
    `[weekly-report] run complete: ${delivered} delivered, ${skipped} skipped, ${failed} failed, ${clients.length} connected clients`
  )
}
