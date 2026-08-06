import { Hono } from 'hono'
import { requireAuth } from '../lib/cognito.js'
import { JourneyTriggerConflictError } from '../repositories/journey-trigger-claim-repository.js'
import {
  createJourneyBundle,
  createJourneyBundleFromTemplate,
  deleteJourneyBundle,
  getJourneyBundle,
  getJourneyBundles,
  getJourneyTemplates,
  JourneyTemplateNotFoundError,
  JourneyValidationError,
  publishJourneyBundle,
  updateJourneyBundle,
} from '../services/journey-service.js'
import type {
  AgentConfig,
  ApiResponse,
  JourneyBundle,
  JourneyDefinition,
  JourneyTemplate,
} from '../types/index.js'

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

// The journey and agent come from our own library, so the client supplies only
// the bot to attach it to and an optional name override.
interface CloneJourneyTemplateBody {
  botId?: string
  name?: string
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

// MUST stay above GET '/:botId' -- both match a single path segment, and Hono
// takes the first registered match, so declaring this second would make
// /api/journeys/templates resolve as a bot whose id is literally "templates".
journeyRoutes.get('/templates', requireAuth, (c) => {
  return c.json<ApiResponse<JourneyTemplate[]>>({ success: true, data: getJourneyTemplates() }, 200)
})

// Clones a prebuilt agent into a client-owned bundle. Separate from POST '/'
// because the two differ in what the client is trusted to supply: here the
// journey and agent come from our own library, and the client only chooses
// which bot to attach it to.
journeyRoutes.post('/from-template/:templateId', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const templateId = c.req.param('templateId')
  const body = await c.req.json<CloneJourneyTemplateBody>()

  if (!body.botId) {
    return c.json<ApiResponse<null>>({ success: false, error: 'botId is required' }, 400)
  }

  try {
    const bundle = await createJourneyBundleFromTemplate({
      templateId,
      botId: body.botId,
      clientId,
      name: body.name,
    })
    return c.json<ApiResponse<JourneyBundle>>({ success: true, data: bundle }, 201)
  } catch (error) {
    if (error instanceof JourneyTemplateNotFoundError) {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
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

// Compiles, claims the trigger, and provisions a real Step Functions state
// machine, recording the immutable version that executions are started against.
//
// 409 is the interesting response: another published bundle already handles
// this trigger. That is not a server error and not a validation error -- it is
// a decision only the client can make ("this would replace your current
// lead-captured journey"), so it gets its own status rather than being folded
// into a 400.
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
    if (error instanceof JourneyTriggerConflictError) {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 409)
    }
    if (error instanceof JourneyValidationError) {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 400)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})
