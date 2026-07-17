import http from 'node:http'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { WebSocketServer, type WebSocket } from 'ws'
import type { VoiceAgentVoice } from '../types/index.js'
import { validateToken } from './auth.js'
import { VoiceSession } from './session.js'

const PORT = 3100

const region = process.env.AWS_REGION
const tableName = process.env.DYNAMODB_TABLE_VOICE_AGENTS
const authSecret = process.env.VOICE_AUTH_SECRET

if (!region) {
  throw new Error(
    'Missing required environment variable AWS_REGION. Set it in your .env file before starting the server.'
  )
}

if (!tableName) {
  throw new Error(
    'Missing required environment variable DYNAMODB_TABLE_VOICE_AGENTS. Set it in your .env file before starting the server.'
  )
}

if (!authSecret) {
  throw new Error(
    'Missing required environment variable VOICE_AUTH_SECRET. Set it in your .env file before starting the server.'
  )
}

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region }))

interface VoiceAgentRecord {
  agentId: string
  name: string
  voice: VoiceAgentVoice
  greetingMessage: string
}

async function getVoiceAgentById(agentId: string): Promise<VoiceAgentRecord | null> {
  const result = await dynamoClient.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: 'agentId-index',
      KeyConditionExpression: 'agentId = :agentId',
      ExpressionAttributeValues: { ':agentId': agentId },
      Limit: 1,
    })
  )
  const items = (result.Items as VoiceAgentRecord[] | undefined) ?? []
  return items[0] ?? null
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('ok')
    return
  }
  res.writeHead(404)
  res.end()
})

const wss = new WebSocketServer({ server })

const activeSessions = new Map<string, VoiceSession>()

wss.on('connection', async (ws: WebSocket, req) => {
  const url = new URL(req.url ?? '', `http://${req.headers.host}`)
  const agentId = url.searchParams.get('agentId')
  const token = url.searchParams.get('token')

  if (!agentId || !token) {
    ws.close(4001, 'Missing agentId or token')
    return
  }

  const { valid, agentId: tokenAgentId } = validateToken(token, authSecret)
  if (!valid || tokenAgentId !== agentId) {
    ws.close(4001, 'Invalid or expired token')
    return
  }

  let agent: VoiceAgentRecord | null
  try {
    agent = await getVoiceAgentById(agentId)
  } catch (error) {
    console.error(`[VoiceRelay] Failed to look up agent ${agentId}:`, error instanceof Error ? error.message : error)
    ws.close(4005, 'Lookup failed')
    return
  }

  if (!agent) {
    ws.close(4004, 'Agent not found')
    return
  }

  const session = new VoiceSession(ws, {
    agentId,
    voice: agent.voice,
    instructions: `You are ${agent.name}, a helpful voice assistant. Start the call by greeting the caller with: "${agent.greetingMessage}"`,
    firstMessage: agent.greetingMessage,
  })

  activeSessions.set(agentId, session)

  ws.on('close', () => {
    session.cleanup()
    activeSessions.delete(agentId)
  })

  ws.on('error', (err) => {
    console.error(`[VoiceRelay] Browser socket error for agent ${agentId}:`, err.message)
    session.cleanup()
    activeSessions.delete(agentId)
  })
})

process.on('uncaughtException', (err) => {
  console.error('[VoiceRelay] Uncaught exception:', err)
})

process.on('unhandledRejection', (reason) => {
  console.error('[VoiceRelay] Unhandled rejection:', reason)
})

server.listen(PORT, () => {
  console.log(`VyostraAI Voice Relay listening on port ${PORT}`)
})
