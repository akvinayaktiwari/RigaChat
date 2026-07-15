import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi'
import type { APIGatewayProxyResultV2, APIGatewayProxyWebsocketEventV2 } from 'aws-lambda'
import { endVoiceSession, startVoiceSession, voiceProvider as provider } from '../services/voice-service.js'

const activeSessions = new Map<string, string>()

async function sendToConnection(apigw: ApiGatewayManagementApiClient, connectionId: string, data: unknown): Promise<void> {
  const encoded = new TextEncoder().encode(JSON.stringify(data))

  try {
    await apigw.send(new PostToConnectionCommand({ ConnectionId: connectionId, Data: encoded }))
  } catch (error) {
    if (error instanceof Error && error.name === 'GoneException') {
      return
    }
    throw error
  }
}

export async function voiceWsHandler(event: APIGatewayProxyWebsocketEventV2): Promise<APIGatewayProxyResultV2> {
  const { connectionId, routeKey, domainName, stage } = event.requestContext

  const apigw = new ApiGatewayManagementApiClient({
    endpoint: `https://${domainName}/${stage}`,
  })

  try {
    if (routeKey === '$connect') {
      const agentId = event.queryStringParameters?.agentId
      if (!agentId) {
        return { statusCode: 400 }
      }

      const { sessionId } = await startVoiceSession(agentId)
      activeSessions.set(connectionId, sessionId)

      provider.onAudioResponse(sessionId, async (audioChunk) => {
        const base64audio = Buffer.from(audioChunk).toString('base64')
        await sendToConnection(apigw, connectionId, { type: 'audio', data: base64audio })
      })

      provider.onTranscript(sessionId, async (transcript, role) => {
        await sendToConnection(apigw, connectionId, { type: 'transcript', transcript, role })
      })

      return { statusCode: 200 }
    }

    if (routeKey === '$disconnect') {
      const sessionId = activeSessions.get(connectionId)
      if (sessionId) {
        await endVoiceSession(sessionId)
        activeSessions.delete(connectionId)
      }
      return { statusCode: 200 }
    }

    // $default
    const sessionId = activeSessions.get(connectionId)
    if (!sessionId) {
      return { statusCode: 400 }
    }

    const message = JSON.parse(event.body ?? '{}') as { type: string; data?: string }

    if (message.type === 'audio' && message.data) {
      const audioChunk = Buffer.from(message.data, 'base64').buffer
      await provider.sendAudio(sessionId, audioChunk)
    } else if (message.type === 'end') {
      await endVoiceSession(sessionId)
      activeSessions.delete(connectionId)
      await sendToConnection(apigw, connectionId, { type: 'ended' })
    } else if (message.type === 'ping') {
      await sendToConnection(apigw, connectionId, { type: 'pong' })
    }

    return { statusCode: 200 }
  } catch (error) {
    console.error('Voice WebSocket handler error:', error)
    return { statusCode: 500 }
  }
}

export { voiceWsHandler as handler }
