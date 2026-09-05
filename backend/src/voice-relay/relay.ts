import http from 'node:http'
import { randomUUID } from 'node:crypto'
import type { WebSocket } from 'ws'
import type { VoiceAgent } from '../types/index.js'
import { generateToken, validateToken } from './auth.js'
import { VoiceSession } from './session.js'
import { PlivoAudioAdapter } from './transports/plivo-audio-adapter.js'
import {
  buildRejectXml,
  buildStreamXml,
  buildTransferXml,
  extractDialledNumber,
  parseFormBody,
  verifyPlivoSignature,
} from './transports/plivo-webhook.js'
import { getVoiceAgentById } from '../repositories/voice-repository.js'
import { getAgentForPhoneNumber } from '../repositories/voice-phone-lookup-repository.js'
import { transferCall } from '../providers/plivo-call-provider.js'
import { describeNextOpening, isWithinBusinessHours } from '../lib/business-hours.js'

// Everything the relay reads from its environment, taken as an argument rather
// than read here. server.ts reads the environment, validates it, and calls
// listen(); this module decides what happens to a call. That split is what makes
// these handlers reachable from a test at all -- importing server.ts starts a
// server on port 3100.
export interface RelayConfig {
  authSecret: string
  // Telephony configuration. Absent means telephony is OFF -- the browser widget
  // keeps working and every Plivo endpoint answers 503. Fail-closed on purpose: a
  // public phone number is an unauthenticated door to a metered OpenAI session,
  // so it must be switched on deliberately rather than by default.
  publicHost?: string
  plivoAuthToken?: string
  // Only needed to CONTROL a call (transferring one). Its absence disables
  // transfer while leaving inbound answering fully working, so a deployment that
  // has not set it degrades to notify-and-callback rather than failing calls.
  plivoAuthId?: string
  // The ceiling that stops one number from starving the process that also serves
  // every browser-widget call. Sessions are held in memory in a single Node
  // process, so this is an availability limit as much as a cost one.
  maxConcurrentCalls: number
}

// The two fields every telephony path needs, proven present by the guard below
// rather than asserted with a cast at each use.
export type TelephonyConfig = RelayConfig & { publicHost: string; plivoAuthToken: string }

export function isTelephonyEnabled(config: RelayConfig): config is TelephonyConfig {
  return Boolean(config.plivoAuthToken && config.publicHost)
}

// Live sessions, and therefore the concurrency ceiling. A class rather than a
// module-level Map so a test gets a fresh one instead of inheriting the previous
// test's calls.
export class SessionRegistry {
  private sessions = new Map<string, VoiceSession>()

  get size(): number {
    return this.sessions.size
  }

  register(session: VoiceSession): string {
    const connectionId = randomUUID()
    this.sessions.set(connectionId, session)
    return connectionId
  }

  end(connectionId: string): void {
    const session = this.sessions.get(connectionId)
    if (!session) return
    session.cleanup()
    this.sessions.delete(connectionId)
  }
}

export interface RelayContext {
  config: RelayConfig
  sessions: SessionRegistry
}

// One place that turns an agent record into the session's persona, so the
// browser and telephony paths cannot describe the same agent differently.
export function buildInstructions(agent: VoiceAgent): string {
  return (
    agent.systemPrompt?.trim() ||
    `You are ${agent.name}, a helpful voice assistant. Start the call by greeting the caller with: "${agent.greetingMessage}"`
  )
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      // A webhook body is a few hundred bytes. Anything approaching a megabyte
      // is not Plivo, and buffering it would be the whole attack.
      if (size > 64 * 1024) {
        // Paused rather than destroyed. Destroying the request tears the socket
        // down before the 413 can be written, so the caller saw a reset
        // connection and the status code below was unreachable. Pausing stops
        // the buffering -- which was the whole attack -- and leaves the response
        // deliverable; the Connection: close header ends the socket after it.
        req.pause()
        reject(new Error('Request body too large'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendXml(res: http.ServerResponse, xml: string, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/xml' })
  res.end(xml)
}

// Plivo POSTs here when a call reaches one of our DIDs. It answers with the XML
// that tells Plivo where to stream the audio -- so this handler decides, before
// a single audio frame exists, whether the call is answered at all.
export async function handlePlivoAnswer(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  { config, sessions }: RelayContext
): Promise<void> {
  if (!isTelephonyEnabled(config)) {
    res.writeHead(503)
    res.end('Telephony not configured')
    return
  }

  let body: string
  try {
    body = await readBody(req)
  } catch {
    res.writeHead(413, { Connection: 'close' })
    res.end()
    return
  }

  // Verified before anything else is trusted: this endpoint is public, and
  // everything downstream of it costs money.
  const requestUrl = `https://${config.publicHost}${req.url ?? ''}`
  const signature = String(req.headers['x-plivo-signature-v3'] ?? '')
  const nonce = String(req.headers['x-plivo-signature-v3-nonce'] ?? '')

  if (!verifyPlivoSignature(requestUrl, nonce, signature, config.plivoAuthToken)) {
    console.warn('[VoiceRelay] Rejected Plivo webhook with an invalid signature')
    res.writeHead(403)
    res.end('Invalid signature')
    return
  }

  const params = parseFormBody(body)
  const dialledNumber = extractDialledNumber(params)

  if (!dialledNumber) {
    console.error('[VoiceRelay] Plivo webhook carried no destination number', Object.keys(params))
    sendXml(res, buildRejectXml('Sorry, this number is not available right now.'))
    return
  }

  // The ceiling is checked here rather than at stream time because this is the
  // last moment we can decline gracefully -- the caller hears a sentence
  // instead of connecting to a process that then drops them.
  if (sessions.size >= config.maxConcurrentCalls) {
    console.warn(
      `[VoiceRelay] Rejecting call to ${dialledNumber}: at capacity (${sessions.size}/${config.maxConcurrentCalls})`
    )
    sendXml(res, buildRejectXml('All our lines are busy at the moment. Please call back shortly.'))
    return
  }

  let mapping
  try {
    mapping = await getAgentForPhoneNumber(dialledNumber)
  } catch (error) {
    // Fail closed. Treating a lookup failure as "unclaimed" would be the same
    // outcome by accident, but this way it is logged as the infrastructure
    // problem it is rather than as a configuration one.
    console.error(
      `[VoiceRelay] Phone lookup failed for ${dialledNumber}:`,
      error instanceof Error ? error.message : error
    )
    sendXml(res, buildRejectXml('Sorry, we are unable to take your call right now.'))
    return
  }

  if (!mapping) {
    console.warn(`[VoiceRelay] Call to unclaimed number ${dialledNumber}`)
    sendXml(res, buildRejectXml('Sorry, this number is not in service.'))
    return
  }

  // The stream socket is authenticated with the same short-lived HMAC token the
  // browser path uses. Plivo cannot carry custom auth on the stream, but we
  // control the URL we hand it, and the token expires in five minutes -- so a
  // leaked stream URL is not a standing door into a client's agent.
  const streamToken = generateToken(mapping.agentId, config.authSecret)
  // The caller's number and the DID travel on the stream URL because Plivo's
  // media stream carries neither, and they are what the CRM record is built
  // from. TRUST BOUNDARY, stated plainly: the HMAC token binds only the
  // agentId, so these two are not themselves signed. The URL is minted here and
  // handed to Plivo over TLS, so forging them means already holding a valid,
  // unexpired token for that agent -- but a forged `from` would attach a call
  // to the wrong lead, so widening the token to cover them is the right fix
  // when the auth helper is next touched.
  const callerPhone = params.From ?? ''
  const streamUrl =
    `wss://${config.publicHost}/plivo/stream?agentId=${encodeURIComponent(mapping.agentId)}` +
    `&token=${encodeURIComponent(streamToken)}` +
    `&from=${encodeURIComponent(callerPhone)}` +
    `&to=${encodeURIComponent(dialledNumber)}` +
    `&callUuid=${encodeURIComponent(params.CallUUID ?? '')}`

  console.log(`[VoiceRelay] Answering call to ${dialledNumber} with agent ${mapping.agentId}`)
  sendXml(res, buildStreamXml({ streamUrl }))
}

// Fetched by Plivo once a transfer is accepted. GET, because that is what the
// transfer request asks Plivo to use, and it returns XML rather than acting:
// the side effect already happened when the transfer was requested.
export function handleTransferXml(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  { config }: RelayContext
): void {
  if (!isTelephonyEnabled(config)) {
    res.writeHead(503)
    res.end('Telephony not configured')
    return
  }

  const url = new URL(req.url ?? '', `https://${config.publicHost}`)
  const token = url.searchParams.get('token') ?? ''
  const toNumber = url.searchParams.get('to') ?? ''

  // Signed with the same short-lived HMAC the stream uses. Without this the
  // endpoint is an open relay: anyone could make our number dial any number
  // they like, at our expense.
  const { valid } = validateToken(token, config.authSecret)
  if (!valid || !toNumber) {
    console.warn('[VoiceRelay] Rejected transfer XML request with an invalid token or target')
    sendXml(res, buildRejectXml('Sorry, we are unable to connect your call.'), 403)
    return
  }

  sendXml(res, buildTransferXml({ toNumber }))
}

export function createRequestHandler(
  context: RelayContext
): (req: http.IncomingMessage, res: http.ServerResponse) => void {
  return (req, res) => {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('ok')
      return
    }

    if (req.method === 'GET' && (req.url ?? '').startsWith('/plivo/transfer')) {
      handleTransferXml(req, res, context)
      return
    }

    if (req.method === 'POST' && (req.url ?? '').startsWith('/plivo/answer')) {
      handlePlivoAnswer(req, res, context).catch((error) => {
        console.error('[VoiceRelay] Answer webhook failed:', error instanceof Error ? error.message : error)
        if (!res.headersSent) {
          res.writeHead(500)
          res.end()
        }
      })
      return
    }

    res.writeHead(404)
    res.end()
  }
}

// Shared by both transports: resolve the agent, refuse if it cannot be found.
// Returns null having already closed the socket, so callers just bail.
async function resolveAgentOrClose(ws: WebSocket, agentId: string): Promise<VoiceAgent | null> {
  try {
    const agent = await getVoiceAgentById(agentId)
    if (!agent) {
      ws.close(4004, 'Agent not found')
      return null
    }
    return agent
  } catch (error) {
    console.error(`[VoiceRelay] Failed to look up agent ${agentId}:`, error instanceof Error ? error.message : error)
    ws.close(4005, 'Lookup failed')
    return null
  }
}

function authenticate(ws: WebSocket, url: URL, config: RelayConfig): string | null {
  const agentId = url.searchParams.get('agentId')
  const token = url.searchParams.get('token')

  if (!agentId || !token) {
    ws.close(4001, 'Missing agentId or token')
    return null
  }

  const { valid, agentId: tokenAgentId } = validateToken(token, config.authSecret)
  if (!valid || tokenAgentId !== agentId) {
    ws.close(4001, 'Invalid or expired token')
    return null
  }

  return agentId
}

// Supplied to the session ONLY when a transfer could actually be honoured: the
// agent has a handoff number, we hold call-control credentials, and we know
// which call to move. Absent, the session tells the caller someone will ring
// back instead of promising a transfer it cannot perform -- which is the
// difference between a graceful fallback and a lie.
export function buildTransferCapability(
  agent: VoiceAgent,
  callUuid: string,
  config: TelephonyConfig
): { transferToHuman?: () => Promise<boolean>; closedUntil?: string } {
  const { plivoAuthId } = config
  if (!agent.handoffNumber || !plivoAuthId || !callUuid) {
    if (agent.handoffNumber && !plivoAuthId) {
      console.warn(
        `[VoiceRelay] Agent ${agent.agentId} has a handoff number but PLIVO_AUTH_ID is unset; transfer disabled`
      )
    }
    return {}
  }

  // Evaluated ONCE, when the call connects, rather than at the moment of
  // handoff. A caller who reaches the office at 17:59 should be put through
  // even if they ask for a person at 18:01 -- re-checking mid-call would drop
  // them for crossing a boundary while already talking to us.
  if (agent.businessHours && !isWithinBusinessHours(agent.businessHours, new Date())) {
    const reopensAt = describeNextOpening(agent.businessHours, new Date())
    console.log(
      `[VoiceRelay] Agent ${agent.agentId} is outside business hours; transfer disabled for this call` +
        (reopensAt ? ` (reopens ${reopensAt})` : '')
    )
    // No transfer capability, but the session is told WHY, so the agent can say
    // "the office opens tomorrow at 9am" instead of a bare "someone will call
    // you back" -- a caller who knows when to expect contact is far less likely
    // to ring again in an hour.
    return reopensAt ? { closedUntil: reopensAt } : {}
  }

  const handoffNumber = agent.handoffNumber

  return {
    transferToHuman: async () => {
      // Freshly minted per transfer, and short-lived like every other token
      // here: the URL is handed to Plivo, and a long-lived one would be a
      // standing instruction to dial a number at our expense.
      const token = generateToken(agent.agentId, config.authSecret)
      const transferUrl =
        `https://${config.publicHost}/plivo/transfer?token=${encodeURIComponent(token)}` +
        `&to=${encodeURIComponent(handoffNumber)}`

      return transferCall({
        credentials: { authId: plivoAuthId, authToken: config.plivoAuthToken },
        callUuid,
        transferUrl,
      })
    },
  }
}

export interface ConnectionRequest {
  url?: string
  headers: { host?: string }
}

export async function handleConnection(
  ws: WebSocket,
  req: ConnectionRequest,
  { config, sessions }: RelayContext
): Promise<void> {
  const url = new URL(req.url ?? '', `http://${req.headers.host}`)
  const isPlivoStream = url.pathname === '/plivo/stream'

  if (isPlivoStream && !isTelephonyEnabled(config)) {
    ws.close(4003, 'Telephony not configured')
    return
  }

  const agentId = authenticate(ws, url, config)
  if (!agentId) return

  // Re-checked at stream time as well as in the answer webhook. The two are
  // seconds apart and the browser path never passes through the webhook at all,
  // so without this check browser calls could push the process past the ceiling
  // that exists to protect them.
  if (sessions.size >= config.maxConcurrentCalls) {
    console.warn(`[VoiceRelay] Refusing connection for ${agentId}: at capacity`)
    ws.close(4008, 'At capacity')
    return
  }

  const agent = await resolveAgentOrClose(ws, agentId)
  if (!agent) return

  const sessionConfig = {
    agentId,
    clientId: agent.clientId,
    voice: agent.voice,
    instructions: buildInstructions(agent),
    firstMessage: agent.greetingMessage,
    maxSessionMinutes: agent.maxSessionDuration,
    // Only telephony carries these, and their presence is what tells
    // VoiceSession to resolve an identity and write a CRM record. A browser
    // call has no caller ID to join on and records no lead, exactly as before.
    ...(isPlivoStream && isTelephonyEnabled(config)
      ? {
          callerPhone: url.searchParams.get('from') ?? '',
          dialledNumber: url.searchParams.get('to') ?? '',
          linkedBotId: agent.botId,
          ...buildTransferCapability(agent, url.searchParams.get('callUuid') ?? '', config),
        }
      : {}),
  }

  // The only difference between the two transports: telephony wraps the socket
  // in an adapter that speaks Plivo's envelope. Everything after this line --
  // the OpenAI session, RAG, barge-in, the call log -- is identical.
  const transport = isPlivoStream
    ? new PlivoAudioAdapter(ws, { instructions: sessionConfig.instructions, voice: agent.voice })
    : ws

  const session = new VoiceSession(transport, sessionConfig)
  const connectionId = sessions.register(session)

  console.log(
    `[VoiceRelay] ${isPlivoStream ? 'Telephony' : 'Browser'} session started for ${agentId} (${sessions.size}/${config.maxConcurrentCalls})`
  )

  ws.on('close', () => {
    sessions.end(connectionId)
  })

  ws.on('error', (err) => {
    console.error(`[VoiceRelay] Socket error for agent ${agentId}:`, err.message)
    sessions.end(connectionId)
  })
}
