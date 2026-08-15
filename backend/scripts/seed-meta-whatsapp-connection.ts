// Stores a Meta Direct WhatsApp connection on a client record WITHOUT going
// through Embedded Signup.
//
// Why this exists: sendWhatsAppTestMessage (and every other send) resolves
// credentials from client.metaDirectWhatsAppConnection, which is normally only
// written by the Embedded Signup callback. While that flow is being debugged
// there is no other way to give an account a working connection, so the
// dashboard's test button would always answer "No active WhatsApp connection"
// and prove nothing.
//
// It calls the same storeMetaWhatsAppConnection() the real callback uses, so
// the seeded record is byte-for-byte what Embedded Signup would have written.
// This is a TESTING tool, not a substitute for the real flow.
//
// The access token is stored KMS-encrypted exactly like a real one. Use a
// System User token with no expiry -- a Graph API Explorer token expires within
// the hour and every send after that fails with an auth error that looks
// nothing like "your token expired".
//
// Run from the backend/ directory:
//   META_SEED_CLIENT_ID=<cognito-sub> \
//   META_WABA_ID=... META_WHATSAPP_PHONE_NUMBER_ID=... \
//   META_WHATSAPP_ACCESS_TOKEN=... META_WHATSAPP_NOTIFICATION_NUMBER=... \
//     TS_NODE_TRANSPILE_ONLY=true node --env-file=.env --loader ts-node/esm \
//     scripts/seed-meta-whatsapp-connection.ts

import { storeMetaWhatsAppConnection, getMetaWhatsAppStatus } from '../src/services/whatsapp-service.js'

interface SeedConfig {
  clientId: string
  wabaId: string
  phoneNumberId: string
  accessToken: string
  notificationNumber: string
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable ${name}`)
  return value
}

function readConfig(): SeedConfig {
  return {
    clientId: requireEnv('META_SEED_CLIENT_ID'),
    wabaId: requireEnv('META_WABA_ID'),
    phoneNumberId: requireEnv('META_WHATSAPP_PHONE_NUMBER_ID'),
    accessToken: requireEnv('META_WHATSAPP_ACCESS_TOKEN'),
    notificationNumber: requireEnv('META_WHATSAPP_NOTIFICATION_NUMBER'),
  }
}

// Read back from Meta rather than trusting an env var: displayPhoneNumber is
// what the dashboard shows the user, and a wrong value here would silently
// mislabel the connection. This also fails fast if the token cannot actually
// see the phone number, which is the single most common misconfiguration.
async function fetchDisplayPhoneNumber(phoneNumberId: string, accessToken: string): Promise<string> {
  const params = new URLSearchParams({ access_token: accessToken, fields: 'display_phone_number' })
  const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}?${params.toString()}`)
  const data = (await response.json().catch(() => ({}))) as {
    display_phone_number?: string
    error?: { message?: string }
  }

  if (!data.display_phone_number) {
    throw new Error(`Could not read phone number ${phoneNumberId}: ${data.error?.message ?? 'unknown error'}`)
  }

  return data.display_phone_number
}

async function main(): Promise<void> {
  const config = readConfig()
  console.log(`Seeding Meta WhatsApp connection for client ${config.clientId}...`)

  const displayPhoneNumber = await fetchDisplayPhoneNumber(config.phoneNumberId, config.accessToken)
  console.log(`  Resolved phone number: ${displayPhoneNumber}`)

  await storeMetaWhatsAppConnection(config.clientId, {
    wabaId: config.wabaId,
    phoneNumberId: config.phoneNumberId,
    notificationNumber: config.notificationNumber,
    accessToken: config.accessToken,
    displayPhoneNumber,
  })

  const status = await getMetaWhatsAppStatus(config.clientId)
  console.log('\n=== Stored ===')
  console.log(`  connected : ${status?.connected}`)
  console.log(`  active    : ${status?.active}`)
  console.log(`  number    : ${status?.displayPhoneNumber}`)
  console.log(`  wabaId    : ${status?.wabaId}`)

  if (status && !status.active) {
    console.log('\nNOTE: connection stored but NOT active — this client still has Gupshup as its')
    console.log('active provider, so sends will go through Gupshup. That is deliberate (a connect')
    console.log('must not silently switch providers); switch it explicitly if you want Meta to send.')
  }
}

main().catch((error) => {
  console.error('Seed failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
