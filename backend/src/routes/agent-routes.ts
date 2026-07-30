import { Hono } from 'hono'
import { requireAuth } from '../lib/cognito.js'
import { AgentBindingConflictError } from '../repositories/agent-binding-lookup-repository.js'
import { createAgent, deleteAgent, getAgent, getAgents } from '../services/agent-service.js'
import type { Agent, AgentChannel, AgentChannelBinding, ApiResponse } from '../types/index.js'

interface AuthEnv {
  Variables: {
    user: { sub: string; [key: string]: unknown }
  }
}

export const agentRoutes = new Hono<AuthEnv>()

interface CreateAgentBody {
  name?: string
  channels?: Partial<Record<AgentChannel, AgentChannelBinding>>
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// Ownership errors ('Bot not found' / 'Voice agent not found') come from
// agent-service validating that the caller owns every bound resource before
// the Agent is created -- mapped to 404 (client error, and 404-either-way so a
// non-owner can't probe existence). A binding conflict (resource already owned
// by another Agent) is 409.
agentRoutes.post('/', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const body = await c.req.json<CreateAgentBody>()

  if (!body.name || typeof body.channels !== 'object' || body.channels === null) {
    return c.json<ApiResponse<null>>({ success: false, error: 'name and channels are required' }, 400)
  }

  try {
    const agent = await createAgent({ clientId, name: body.name, channels: body.channels })
    return c.json<ApiResponse<Agent>>({ success: true, data: agent }, 201)
  } catch (error) {
    if (error instanceof AgentBindingConflictError) {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 409)
    }
    if (error instanceof Error && (error.message === 'Bot not found' || error.message === 'Voice agent not found')) {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

agentRoutes.get('/', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  try {
    const agents = await getAgents(clientId)
    return c.json<ApiResponse<Agent[]>>({ success: true, data: agents }, 200)
  } catch (error) {
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

agentRoutes.get('/:agentId', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const agentId = c.req.param('agentId')
  try {
    const agent = await getAgent(agentId, clientId)
    return c.json<ApiResponse<Agent>>({ success: true, data: agent }, 200)
  } catch (error) {
    if (error instanceof Error && error.message === 'Agent not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

agentRoutes.delete('/:agentId', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const agentId = c.req.param('agentId')
  try {
    await deleteAgent(agentId, clientId)
    return c.json<ApiResponse<{ message: string }>>({ success: true, data: { message: 'Agent deleted' } }, 200)
  } catch (error) {
    if (error instanceof Error && error.message === 'Agent not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})
