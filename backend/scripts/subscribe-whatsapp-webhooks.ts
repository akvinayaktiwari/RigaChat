// Subscribes each connected WABA to this app's webhooks, and records the
// outcome on the client record.
//
// WHY THIS EXISTS
//   Storing Meta credentials makes a connection able to SEND. Only
//   POST /{wabaId}/subscribed_apps makes it able to RECEIVE. The connect flow
//   never made that call, so every Meta WhatsApp connection made before
//   2026-08-16 can send and cannot receive -- no inbound messages, no delivery
//   statuses, every await_reply step dead until its 24h timeout, and the 24h
//   session window never opening. Nothing surfaced it, because the sending
//   half works perfectly.
//
//   whatsapp-service.ts now subscribes on connect. This repairs the
//   connections made before it did, and re-runs safely afterwards.
//
// Idempotent: Meta treats a repeat subscribe as success, and this reads back
// the subscription list to confirm rather than trusting the POST's own 200.
//
// Run from the backend/ directory:
//   TS_NODE_TRANSPILE_ONLY=true node --env-file=.env --loader ts-node/esm \
//     scripts/subscribe-whatsapp-webhooks.ts [--dry-run] [--client-id=<id>]

import { metaWhatsAppProvider } from '../src/providers/meta-whatsapp-provider.js'
import { getAllClients, getClientById, updateClient } from '../src/repositories/client-repository.js'
import { decrypt } from '../src/lib/kms.js'
import type { ClientRecord } from '../src/types/index.js'

const dryRun = process.argv.includes('--dry-run')
const onlyClientArg = process.argv.find((a) => a.startsWith('--client-id='))
const onlyClientId = onlyClientArg?.split('=')[1]

interface Outcome {
  clientId: string
  wabaId: string
  status: 'subscribed' | 'already' | 'failed' | 'skipped'
  detail?: string
}

function connectedMetaClients(clients: ClientRecord[]): ClientRecord[] {
  return clients.filter((c) => c.metaDirectWhatsAppConnection?.connected === true)
}

async function repair(client: ClientRecord): Promise<Outcome> {
  const connection = client.metaDirectWhatsAppConnection
  if (!connection) {
    return { clientId: client.clientId, wabaId: '-', status: 'skipped', detail: 'no connection' }
  }

  const base = { clientId: client.clientId, wabaId: connection.wabaId }

  if (dryRun) {
    return {
      ...base,
      status: 'skipped',
      detail: `would subscribe (currently webhookSubscribed=${String(connection.webhookSubscribed)})`,
    }
  }

  try {
    // Decrypted here rather than passed in: the token is per-client, and a
    // script that took one token would silently subscribe the wrong WABA on a
    // multi-client run.
    const accessToken = await decrypt(connection.accessTokenEncrypted)

    const alreadySubscribed = await metaWhatsAppProvider.isWabaSubscribedToApp(connection.wabaId, accessToken)
    if (!alreadySubscribed) {
      await metaWhatsAppProvider.subscribeWabaToApp(connection.wabaId, accessToken)
    }

    // Read back even after a 200. The failure mode being repaired here is
    // exactly "the write appeared to work and nothing was delivered", so the
    // subscription is only reported as fixed once Meta itself lists us.
    const confirmed = await metaWhatsAppProvider.isWabaSubscribedToApp(connection.wabaId, accessToken)
    if (!confirmed) {
      throw new Error('Meta accepted the subscribe but still does not list this app on the WABA')
    }

    await updateClient(client.clientId, {
      metaDirectWhatsAppConnection: { ...connection, webhookSubscribed: true },
    })

    return { ...base, status: alreadySubscribed ? 'already' : 'subscribed' }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)

    // Record the failure too. Leaving the flag `undefined` would make a client
    // we have actively failed to repair indistinguishable from one nobody has
    // looked at yet.
    await updateClient(client.clientId, {
      metaDirectWhatsAppConnection: { ...connection, webhookSubscribed: false },
    }).catch(() => undefined)

    return { ...base, status: 'failed', detail }
  }
}

async function main(): Promise<void> {
  const clients = onlyClientId
    ? [await getClientById(onlyClientId)].filter((c): c is ClientRecord => c !== null)
    : connectedMetaClients(await getAllClients())

  const targets = onlyClientId ? connectedMetaClients(clients) : clients

  if (targets.length === 0) {
    console.log('No connected Meta WhatsApp clients found — nothing to do.')
    return
  }

  console.log(`${dryRun ? '[dry run] ' : ''}${targets.length} connected Meta WhatsApp client(s)\n`)

  const outcomes: Outcome[] = []
  for (const client of targets) {
    const outcome = await repair(client)
    outcomes.push(outcome)
    const line = `  ${outcome.status.padEnd(10)} client=${outcome.clientId} waba=${outcome.wabaId}`
    console.log(outcome.detail ? `${line}\n             ${outcome.detail}` : line)
  }

  const failed = outcomes.filter((o) => o.status === 'failed')
  console.log(
    `\nsubscribed=${outcomes.filter((o) => o.status === 'subscribed').length} ` +
      `already=${outcomes.filter((o) => o.status === 'already').length} ` +
      `failed=${failed.length} skipped=${outcomes.filter((o) => o.status === 'skipped').length}`
  )

  if (failed.length > 0) {
    console.log(
      '\nA failure here usually means the stored token lacks whatsapp_business_management,\n' +
        'or the app is not authorised on that WABA. Both need fixing in the Meta dashboard;\n' +
        'reconnecting the client afterwards will now subscribe automatically.'
    )
    process.exitCode = 1
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
