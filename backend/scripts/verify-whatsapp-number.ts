// Re-runs Meta's phone-number ownership verification for a connected WABA
// number, in the two steps Meta splits it into.
//
// WHY THIS EXISTS
//   The 2026-08-16 delivery investigation found the sending number healthy on
//   every axis but one: code_verification_status=EXPIRED, while status=CONNECTED
//   and quality_rating=GREEN. A lapsed verification is invisible from the
//   sending side -- the API accepts a send and returns a wamid regardless.
//
// MUTATING, unlike diagnose-whatsapp-delivery.ts:
//   --request sends a REAL SMS (or voice call) to the business number.
//   --verify=<code> consumes that code and changes the number's state at Meta.
//   Neither is reversible in the sense that a code can be un-sent, though a
//   request can simply be repeated if the code is lost or expires.
//
// Run from the backend/ directory:
//   TS_NODE_TRANSPILE_ONLY=true node --env-file=.env --loader ts-node/esm \
//     scripts/verify-whatsapp-number.ts --client-id=<id> --request [--voice]
//   TS_NODE_TRANSPILE_ONLY=true node --env-file=.env --loader ts-node/esm \
//     scripts/verify-whatsapp-number.ts --client-id=<id> --verify=123456

import { getClientById } from '../src/repositories/client-repository.js'
import { decrypt } from '../src/lib/kms.js'

const GRAPH = 'https://graph.facebook.com/v21.0'

const clientId = process.argv.find((a) => a.startsWith('--client-id='))?.split('=')[1]
const code = process.argv.find((a) => a.startsWith('--verify='))?.split('=')[1]
const doRequest = process.argv.includes('--request')
const codeMethod = process.argv.includes('--voice') ? 'VOICE' : 'SMS'

async function post(node: string, action: string, body: Record<string, string>, token: string): Promise<void> {
  const response = await fetch(`${GRAPH}/${node}/${action}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await response.json().catch(() => ({}))) as {
    success?: boolean
    error?: { message?: string; code?: number; error_subcode?: number; error_user_msg?: string }
  }

  if (!response.ok || data.error) {
    // Printed in full rather than summarised: Meta's error_subcode and
    // error_user_msg carry the actual reason (already verified, rate limited,
    // wrong code), and collapsing them into "failed" is what makes this class
    // of problem take a day instead of a minute.
    console.error(`\n${action} FAILED (http ${response.status})`)
    console.error(JSON.stringify(data.error ?? data, null, 2))
    process.exitCode = 1
    return
  }

  console.log(`\n${action} OK: ${JSON.stringify(data)}`)
}

async function main(): Promise<void> {
  if (!clientId || (!doRequest && !code)) {
    console.error('usage: --client-id=<id> (--request [--voice] | --verify=<code>)')
    process.exit(1)
  }

  const client = await getClientById(clientId)
  const connection = client?.metaDirectWhatsAppConnection
  if (!connection?.connected) {
    console.error(`Client ${clientId} has no connected Meta WhatsApp connection.`)
    process.exit(1)
  }

  const token = await decrypt(connection.accessTokenEncrypted)
  console.log(`number ${connection.phoneNumberId} (${connection.displayPhoneNumber})`)

  if (doRequest) {
    console.log(`requesting a ${codeMethod} code — this sends a real message to that number`)
    await post(connection.phoneNumberId, 'request_code', { code_method: codeMethod, language: 'en' }, token)
    console.log('\nnext: scripts/verify-whatsapp-number.ts --client-id=... --verify=<6 digits>')
    return
  }

  await post(connection.phoneNumberId, 'verify_code', { code: code as string }, token)
  console.log('\nnext: re-run scripts/diagnose-whatsapp-delivery.ts and confirm code_verification_status')
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
