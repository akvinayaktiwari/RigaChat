import { Hono } from 'hono'
import { requireAuth } from '../lib/cognito.js'
import {
  createWhatsAppTemplate,
  listWhatsAppTemplates,
  UnknownWhatsAppTemplateError,
  WhatsAppNotConnectedError,
  WhatsAppTemplateCreateError,
} from '../services/whatsapp-template-service.js'
import type { ApiResponse, WhatsAppTemplateOverview } from '../types/index.js'

// Mounted at /api/integrations/meta-whatsapp/templates. Its own file rather
// than more of integration-routes.ts so the status mapping below can be tested
// without importing every other integration's service graph.
export const whatsAppTemplateRoutes = new Hono()

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// The Vyostra AI template library, each with its status on the caller's own
// WABA. Read live from Meta, so this is also how a PENDING template is seen to
// become APPROVED.
whatsAppTemplateRoutes.get('/', requireAuth, async (c) => {
  const clientId = c.get('user').sub

  try {
    const templates = await listWhatsAppTemplates(clientId)
    return c.json<ApiResponse<WhatsAppTemplateOverview[]>>({ success: true, data: templates }, 200)
  } catch (error) {
    if (error instanceof WhatsAppNotConnectedError) {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 409)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

interface CreateTemplateBody {
  name?: unknown
}

async function readTemplateName(request: { json: () => Promise<unknown> }): Promise<string | null> {
  try {
    const body = (await request.json()) as CreateTemplateBody
    return typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : null
  } catch {
    return null
  }
}

// Submits ONE library template to Meta for review on the caller's WABA. The
// body carries a name, never template text: the definition comes from the
// library, so this cannot be used to submit arbitrary copy.
whatsAppTemplateRoutes.post('/', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const name = await readTemplateName(c.req)
  if (!name) {
    return c.json<ApiResponse<null>>({ success: false, error: 'A template name is required' }, 400)
  }

  try {
    const template = await createWhatsAppTemplate(clientId, name)
    return c.json<ApiResponse<WhatsAppTemplateOverview>>({ success: true, data: template }, 201)
  } catch (error) {
    if (error instanceof UnknownWhatsAppTemplateError) {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    if (error instanceof WhatsAppNotConnectedError) {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 409)
    }
    // 502, not 500: our side worked and Meta refused. The message is Meta's.
    if (error instanceof WhatsAppTemplateCreateError) {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 502)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})
