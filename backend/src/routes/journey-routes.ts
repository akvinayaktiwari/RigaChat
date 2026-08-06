import { Hono } from 'hono'
import { requireAuth } from '../lib/cognito.js'
import {
  createJourneyBundle,
  deleteJourneyBundle,
  getJourneyBundle,
  getJourneyBundles,
  JourneyValidationError,
  publishJourneyBundle,
  updateJourneyBundle,
} from '../services/journey-service.js'
import type { AgentConfig, ApiResponse, JourneyBundle, JourneyDefinition } from '../types/index.js'

interface AuthEnv {
  Variables: {
    user: { sub: string; [key: string]: unknown }
  }
}

export const journeyRoutes = new Hono<AuthEnv>()

// isPrebuiltTemplate and sourceTemplateId are deliberately absent: both are
// provenance the server owns. Prebuilt agents are code-defined seeds
// (lib/journey-templates/), so a client-created bundle is never a template,
// and sourceTemplateId is stamped only by the clone route below.
interface CreateJourneyBundleBody {
  botId?: string
  name?: string
  description?: string
  journey?: Omit<JourneyDefinition, 'botId' | 'clientId'>
  agent?: AgentConfig
}

interface UpdateJourneyBundleBody {
  name?: string
  description?: string
  journey?: Omit<JourneyDefinition, 'botId' | 'clientId'>
  agent?: AgentConfig
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// Both "Bot not found" (createJourneyBundle validates ownership before
// anything else) and JourneyValidationError (structural/toolbox validation
// failures from journey-compiler-service.ts) are client errors, not server
// errors -- mapped to 404/400 respectively so a broken Journey definition
// never surfaces as a generic 500.
journeyRoutes.post('/', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const body = await c.req.json<CreateJourneyBundleBody>()

  if (!body.botId || !body.name || !body.journey || !body.agent) {
    return c.json<ApiResponse<null>>({ success: false, error: 'botId, name, journey, and agent are required' }, 400)
  }

  try {
    const bundle = await createJourneyBundle({
      botId: body.botId,
      clientId,
      name: body.name,
      description: body.description,
      journey: body.journey,
      agent: body.agent,
    })
    return c.json<ApiResponse<JourneyBundle>>({ success: true, data: bundle }, 201)
  } catch (error) {
    if (error instanceof Error && error.message === 'Bot not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    if (error instanceof JourneyValidationError) {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 400)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

journeyRoutes.get('/:botId', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const botId = c.req.param('botId')

  try {
    const bundles = await getJourneyBundles(botId, clientId)
    return c.json<ApiResponse<JourneyBundle[]>>({ success: true, data: bundles }, 200)
  } catch (error) {
    if (error instanceof Error && error.message === 'Bot not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

journeyRoutes.get('/:botId/:bundleId', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const botId = c.req.param('botId')
  const bundleId = c.req.param('bundleId')

  try {
    const bundle = await getJourneyBundle(botId, bundleId, clientId)
    return c.json<ApiResponse<JourneyBundle>>({ success: true, data: bundle }, 200)
  } catch (error) {
    if (error instanceof Error && error.message === 'Journey bundle not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

journeyRoutes.patch('/:botId/:bundleId', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const botId = c.req.param('botId')
  const bundleId = c.req.param('bundleId')
  const body = await c.req.json<UpdateJourneyBundleBody>()

  try {
    const bundle = await updateJourneyBundle(botId, bundleId, clientId, {
      name: body.name,
      description: body.description,
      journey: body.journey,
      agent: body.agent,
    })
    return c.json<ApiResponse<JourneyBundle>>({ success: true, data: bundle }, 200)
  } catch (error) {
    if (error instanceof Error && error.message === 'Journey bundle not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    if (error instanceof JourneyValidationError) {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 400)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

journeyRoutes.delete('/:botId/:bundleId', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const botId = c.req.param('botId')
  const bundleId = c.req.param('bundleId')

  try {
    await deleteJourneyBundle(botId, bundleId, clientId)
    return c.json<ApiResponse<{ message: string }>>({ success: true, data: { message: 'Journey bundle deleted' } }, 200)
  } catch (error) {
    if (error instanceof Error && error.message === 'Journey bundle not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

// Compiles and marks the bundle published -- does NOT create or update a
// real AWS Step Functions state machine. See journey-service.ts's
// publishJourneyBundle() for why: provisioning live infrastructure is a
// separate, explicit deployment decision, not something this route implies.
journeyRoutes.post('/:botId/:bundleId/publish', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const botId = c.req.param('botId')
  const bundleId = c.req.param('bundleId')

  try {
    const bundle = await publishJourneyBundle(botId, bundleId, clientId)
    return c.json<ApiResponse<JourneyBundle>>({ success: true, data: bundle }, 200)
  } catch (error) {
    if (error instanceof Error && error.message === 'Journey bundle not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    if (error instanceof JourneyValidationError) {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 400)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})
