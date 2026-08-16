// Asks Meta why a WhatsApp send is accepted but never delivered.
//
// WHY THIS EXISTS
//   On 2026-08-16 a journey's greet template was accepted with a real wamid and
//   never arrived, and an inbound reply never reached our webhook. Everything on
//   our side checked out -- app subscribed to `messages`, WABA subscribed to the
//   app, callback URL correct, GET verification and POST both passing. When both
//   directions fail downstream of a successful API call, the answer is in the
//   WABA's and phone number's own state, which is only readable with the
//   client's token.
//
//   Read-only. Prints Meta's answer; changes nothing, here or there.
//
// Run from the backend/ directory:
//   TS_NODE_TRANSPILE_ONLY=true node --env-file=.env --loader ts-node/esm \
//     scripts/diagnose-whatsapp-delivery.ts --client-id=<id>

import { getClientById } from '../src/repositories/client-repository.js'
import { decrypt } from '../src/lib/kms.js'

const GRAPH = 'https://graph.facebook.com/v21.0'

const clientIdArg = process.argv.find((a) => a.startsWith('--client-id='))
const clientId = clientIdArg?.split('=')[1]

// Field sets are requested in groups rather than one big list: Meta rejects the
// WHOLE request if any single field is unavailable to this token, so one
// unsupported field would blank out the ones that would have answered the
// question. Each group fails independently.
const WABA_FIELD_GROUPS = [
  ['name', 'timezone_id', 'message_template_namespace'],
  ['account_review_status'],
  ['business_verification_status'],
  ['owner_business_info'],
]

const PHONE_FIELD_GROUPS = [
  ['display_phone_number', 'verified_name'],
  ['code_verification_status'],
  ['quality_rating'],
  ['platform_type', 'throughput'],
  ['status'],
  ['messaging_limit_tier'],
]

async function readFields(node: string, fields: string[], token: string): Promise<void> {
  const params = new URLSearchParams({ fields: fields.join(','), access_token: token })
  const response = await fetch(`${GRAPH}/${node}?${params.toString()}`)
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: { message?: string; code?: number }
  }

  if (!response.ok || data.error) {
    console.log(`    ${fields.join(',').padEnd(46)} -- unavailable: ${data.error?.message ?? response.status}`)
    return
  }

  for (const field of fields) {
    const value = data[field]
    if (value === undefined) {
      console.log(`    ${field.padEnd(46)} (not returned)`)
    } else {
      console.log(`    ${field.padEnd(46)} ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
    }
  }
}

async function main(): Promise<void> {
  if (!clientId) {
    console.error('--client-id=<id> is required')
    process.exit(1)
  }

  const client = await getClientById(clientId)
  const connection = client?.metaDirectWhatsAppConnection
  if (!connection?.connected) {
    console.error(`Client ${clientId} has no connected Meta WhatsApp connection.`)
    process.exit(1)
  }

  const token = await decrypt(connection.accessTokenEncrypted)

  console.log(`\nWABA ${connection.wabaId}`)
  for (const group of WABA_FIELD_GROUPS) await readFields(connection.wabaId, group, token)

  console.log(`\nPHONE NUMBER ${connection.phoneNumberId}  (${connection.displayPhoneNumber})`)
  for (const group of PHONE_FIELD_GROUPS) await readFields(connection.phoneNumberId, group, token)

  // The phone numbers actually attached to this WABA. A phoneNumberId stored
  // from a signup flow that does not appear here is its own explanation.
  console.log(`\nPHONE NUMBERS ON THIS WABA`)
  const listParams = new URLSearchParams({
    fields: 'id,display_phone_number,verified_name,code_verification_status,quality_rating',
    access_token: token,
  })
  const listResponse = await fetch(`${GRAPH}/${connection.wabaId}/phone_numbers?${listParams.toString()}`)
  const listData = (await listResponse.json().catch(() => ({}))) as {
    data?: Record<string, unknown>[]
    error?: { message?: string }
  }

  if (listData.error) {
    console.log(`    unavailable: ${listData.error.message}`)
  } else {
    for (const entry of listData.data ?? []) {
      const marker = entry.id === connection.phoneNumberId ? ' <- the one we send from' : ''
      console.log(`    ${JSON.stringify(entry)}${marker}`)
    }
  }

  console.log('')
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
