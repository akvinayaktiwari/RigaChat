import { Hono } from 'hono'
import { requireAuth } from '../lib/cognito.js'
import {
  createVoiceAgent,
  deleteVoiceAgent,
  endVoiceSession,
  getVoiceAgentById,
  getVoiceAgentPublicConfig,
  getVoiceAgents,
  setupVoiceAgent,
  startVoiceSession,
  updateVoiceAgent,
} from '../services/voice-service.js'
import { generateToken } from '../voice-relay/auth.js'
import type { ApiResponse, VoiceAgent } from '../types/index.js'

interface AuthEnv {
  Variables: {
    user: { sub: string; [key: string]: unknown }
  }
}

export const voiceRoutes = new Hono<AuthEnv>()

interface CreateVoiceAgentBody {
  name?: string
  voice?: VoiceAgent['voice']
  greetingMessage?: string
  websiteUrl?: string
  brandColor?: string
  widgetPosition?: VoiceAgent['widgetPosition']
  maxSessionDuration?: VoiceAgent['maxSessionDuration']
}

type UpdateVoiceAgentBody = Partial<
  Pick<VoiceAgent, 'name' | 'voice' | 'greetingMessage' | 'brandColor' | 'widgetPosition' | 'maxSessionDuration' | 'isEnabled'>
>

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === 'Voice agent not found' || error.message === 'Voice agent is not enabled')
  )
}

voiceRoutes.post('/', requireAuth, async (c) => {
  const body = await c.req.json<CreateVoiceAgentBody>()

  if (
    !body.name ||
    !body.voice ||
    !body.greetingMessage ||
    !body.websiteUrl ||
    !body.brandColor ||
    !body.widgetPosition ||
    !body.maxSessionDuration
  ) {
    return c.json<ApiResponse<null>>(
      {
        success: false,
        error: 'name, voice, greetingMessage, websiteUrl, brandColor, widgetPosition, and maxSessionDuration are required',
      },
      400
    )
  }

  const clientId = c.get('user').sub

  try {
    const agent = await createVoiceAgent({
      clientId,
      name: body.name,
      voice: body.voice,
      greetingMessage: body.greetingMessage,
      websiteUrl: body.websiteUrl,
      brandColor: body.brandColor,
      widgetPosition: body.widgetPosition,
      maxSessionDuration: body.maxSessionDuration,
    })
    return c.json<ApiResponse<VoiceAgent>>({ success: true, data: agent }, 201)
  } catch (error) {
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

voiceRoutes.get('/', requireAuth, async (c) => {
  const clientId = c.get('user').sub

  try {
    const agents = await getVoiceAgents(clientId)
    return c.json<ApiResponse<VoiceAgent[]>>({ success: true, data: agents }, 200)
  } catch (error) {
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

voiceRoutes.get('/token', async (c) => {
  const agentId = c.req.query('agentId')

  if (!agentId) {
    return c.json({ error: 'agentId required' }, 400)
  }

  const token = generateToken(agentId, process.env.VOICE_AUTH_SECRET ?? '')
  return c.json({ token, expiresIn: 300 }, 200)
})

voiceRoutes.get('/public/:id', async (c) => {
  const agentId = c.req.param('id')

  try {
    const config = await getVoiceAgentPublicConfig(agentId)
    return c.json<ApiResponse<typeof config>>({ success: true, data: config }, 200)
  } catch (error) {
    if (isNotFoundError(error)) {
      return c.json<ApiResponse<null>>({ success: false, error: 'Voice agent not found' }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

voiceRoutes.get('/:id', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const agentId = c.req.param('id')

  try {
    const agent = await getVoiceAgentById(agentId, clientId)
    return c.json<ApiResponse<VoiceAgent>>({ success: true, data: agent }, 200)
  } catch (error) {
    if (isNotFoundError(error)) {
      return c.json<ApiResponse<null>>({ success: false, error: 'Voice agent not found' }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

voiceRoutes.patch('/:id', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const agentId = c.req.param('id')
  const updates = await c.req.json<UpdateVoiceAgentBody>()

  try {
    const agent = await updateVoiceAgent(agentId, clientId, updates)
    return c.json<ApiResponse<VoiceAgent>>({ success: true, data: agent }, 200)
  } catch (error) {
    if (isNotFoundError(error)) {
      return c.json<ApiResponse<null>>({ success: false, error: 'Voice agent not found' }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

voiceRoutes.delete('/:id', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const agentId = c.req.param('id')

  try {
    await deleteVoiceAgent(agentId, clientId)
    return c.body(null, 204)
  } catch (error) {
    if (isNotFoundError(error)) {
      return c.json<ApiResponse<null>>({ success: false, error: 'Voice agent not found' }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

voiceRoutes.post('/:id/setup', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const agentId = c.req.param('id')

  try {
    const agent = await setupVoiceAgent(agentId, clientId)
    return c.json<ApiResponse<VoiceAgent>>({ success: true, data: agent }, 200)
  } catch (error) {
    if (isNotFoundError(error)) {
      return c.json<ApiResponse<null>>({ success: false, error: 'Voice agent not found' }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

voiceRoutes.post('/:id/session', async (c) => {
  const agentId = c.req.param('id')

  try {
    const result = await startVoiceSession(agentId)
    return c.json<ApiResponse<{ sessionId: string }>>({ success: true, data: result }, 200)
  } catch (error) {
    if (isNotFoundError(error)) {
      return c.json<ApiResponse<null>>({ success: false, error: 'Voice agent not found' }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

voiceRoutes.delete('/:id/session/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId')

  try {
    await endVoiceSession(sessionId)
    return c.body(null, 204)
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return c.json<ApiResponse<null>>({ success: false, error: 'Voice session not found' }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})
