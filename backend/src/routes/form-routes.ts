import { Hono } from 'hono'
import { requireAuth } from '../lib/cognito.js'
import {
  createNewForm,
  getClientForms,
  getFormConfig,
  getPublicConfig,
  removeForm,
  updateFormConfig,
} from '../services/form-service.js'
import { captureFormLead, getLeadsForClient, getLeadsForForm } from '../services/form-lead-service.js'
import type { ApiResponse, FormConfig, FormField, FormLead } from '../types/index.js'

interface AuthEnv {
  Variables: {
    user: { sub: string; [key: string]: unknown }
  }
}

export const formRoutes = new Hono<AuthEnv>()

interface CreateFormBody {
  name?: string
  description?: string
  submitButtonText?: string
  fields?: Omit<FormField, 'fieldId'>[]
}

type UpdateFormBody = Partial<Omit<FormConfig, 'formId' | 'clientId' | 'createdAt'>>

interface CreateFormLeadBody {
  formId?: string
  customFields?: Record<string, string>
  sourceUrl?: string
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

formRoutes.post('/', requireAuth, async (c) => {
  const body = await c.req.json<CreateFormBody>()

  if (!body.name) {
    return c.json<ApiResponse<null>>({ success: false, error: 'name is required' }, 400)
  }
  if (!body.fields || body.fields.length === 0) {
    return c.json<ApiResponse<null>>({ success: false, error: 'Form must have at least one field' }, 400)
  }

  const clientId = c.get('user').sub

  try {
    const form = await createNewForm({
      clientId,
      name: body.name,
      description: body.description,
      submitButtonText: body.submitButtonText || 'Submit',
      fields: body.fields,
    })
    return c.json<ApiResponse<FormConfig>>({ success: true, data: form }, 201)
  } catch (error) {
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

formRoutes.get('/', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const forms = await getClientForms(clientId)
  return c.json<ApiResponse<FormConfig[]>>({ success: true, data: forms }, 200)
})

formRoutes.get('/leads/all', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const leads = await getLeadsForClient(clientId)
  return c.json<ApiResponse<FormLead[]>>({ success: true, data: leads }, 200)
})

formRoutes.get('/leads/form/:formId', requireAuth, async (c) => {
  const formId = c.req.param('formId')
  const leads = await getLeadsForForm(formId)
  return c.json<ApiResponse<FormLead[]>>({ success: true, data: leads }, 200)
})

formRoutes.post('/leads', async (c) => {
  const body = await c.req.json<CreateFormLeadBody>()

  if (!body.formId) {
    return c.json<ApiResponse<null>>({ success: false, error: 'formId is required' }, 400)
  }
  if (!body.customFields) {
    return c.json<ApiResponse<null>>({ success: false, error: 'customFields is required' }, 400)
  }
  if (!body.sourceUrl) {
    return c.json<ApiResponse<null>>({ success: false, error: 'sourceUrl is required' }, 400)
  }

  try {
    const form = await getPublicConfig(body.formId)
    const lead = await captureFormLead({
      formId: body.formId,
      clientId: form.clientId,
      customFields: body.customFields,
      sourceUrl: body.sourceUrl,
    })
    return c.json<ApiResponse<FormLead>>({ success: true, data: lead }, 201)
  } catch (error) {
    if (error instanceof Error && error.message === 'Form not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

formRoutes.get('/public/:formId', async (c) => {
  const formId = c.req.param('formId')

  try {
    const form = await getPublicConfig(formId)
    return c.json<ApiResponse<FormConfig>>({ success: true, data: form }, 200)
  } catch (error) {
    if (error instanceof Error && error.message === 'Form not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

formRoutes.get('/:formId', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const formId = c.req.param('formId')

  try {
    const form = await getFormConfig(formId, clientId)
    return c.json<ApiResponse<FormConfig>>({ success: true, data: form }, 200)
  } catch (error) {
    if (error instanceof Error && error.message === 'Form not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

formRoutes.patch('/:formId', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const formId = c.req.param('formId')
  const updates = await c.req.json<UpdateFormBody>()

  try {
    const form = await updateFormConfig(formId, clientId, updates)
    return c.json<ApiResponse<FormConfig>>({ success: true, data: form }, 200)
  } catch (error) {
    if (error instanceof Error && error.message === 'Form not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

formRoutes.delete('/:formId', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const formId = c.req.param('formId')

  try {
    await removeForm(formId, clientId)
    return c.json<ApiResponse<{ message: string }>>({ success: true, data: { message: 'Form deleted' } }, 200)
  } catch (error) {
    if (error instanceof Error && error.message === 'Form not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})
