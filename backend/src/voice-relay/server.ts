import http from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import {
  SessionRegistry,
  createRequestHandler,
  handleConnection,
  isTelephonyEnabled,
  type RelayConfig,
  type RelayContext,
} from './relay.js'

// This file is the process: it reads the environment, validates it, and listens.
// Every decision about a call lives in relay.ts, which takes its configuration
// as an argument -- so those decisions are reachable from a test, and this file
// stays small enough that its lack of coverage costs nothing.

const PORT = 3100

const region = process.env.AWS_REGION
const authSecret = process.env.VOICE_AUTH_SECRET

if (!region) {
  throw new Error(
    'Missing required environment variable AWS_REGION. Set it in your .env file before starting the server.'
  )
}

if (!authSecret) {
  throw new Error(
    'Missing required environment variable VOICE_AUTH_SECRET. Set it in your .env file before starting the server.'
  )
}

const config: RelayConfig = {
  authSecret,
  publicHost: process.env.VOICE_RELAY_PUBLIC_HOST,
  plivoAuthToken: process.env.PLIVO_AUTH_TOKEN,
  plivoAuthId: process.env.PLIVO_AUTH_ID,
  maxConcurrentCalls: Number(process.env.VOICE_MAX_CONCURRENT_CALLS ?? '10'),
}

const telephonyEnabled = isTelephonyEnabled(config)
if (!telephonyEnabled) {
  console.warn(
    '[VoiceRelay] Telephony disabled: set PLIVO_AUTH_TOKEN and VOICE_RELAY_PUBLIC_HOST to enable inbound calls.'
  )
}

const context: RelayContext = { config, sessions: new SessionRegistry() }

const server = http.createServer(createRequestHandler(context))

const wss = new WebSocketServer({ server })

wss.on('connection', (ws: WebSocket, req) => {
  void handleConnection(ws, req, context)
})

process.on('uncaughtException', (err) => {
  console.error('[VoiceRelay] Uncaught exception:', err)
})

process.on('unhandledRejection', (reason) => {
  console.error('[VoiceRelay] Unhandled rejection:', reason)
})

server.listen(PORT, () => {
  console.log(`VyostraAI Voice Relay listening on port ${PORT}`)
  console.log(
    `  telephony: ${telephonyEnabled ? `enabled (max ${config.maxConcurrentCalls} concurrent)` : 'disabled'}`
  )
})
