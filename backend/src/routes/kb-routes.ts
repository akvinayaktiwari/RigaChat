import { Hono } from 'hono'
import { requireAuth } from '../lib/cognito.js'
import { addKBEntry, getKBEntries, removeKBEntry, updateKBEntry } from '../services/kb-service.js'
import type { ApiResponse, KnowledgeBaseEntry } from '../types/index.js'

interface AuthEnv {
  Variables: {
    user: { sub: string; [key: string]: unknown }
  }
}

export const kbRoutes = new Hono<AuthEnv>()

interface AddKBEntryBody {
  botId?: string
  title?: string
  content?: string
}

interface UpdateKBEntryBody {
  title?: string
  content?: string
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

kbRoutes.post('/', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const body = await c.req.json<AddKBEntryBody>()

  if (!body.botId || !body.title || !body.content) {
    return c.json<ApiResponse<null>>(
      { success: false, error: 'botId, title, and content are required' },
      400
    )
  }

  try {
    const entry = await addKBEntry({
      botId: body.botId,
      clientId,
      title: body.title,
      content: body.content,
    })
    return c.json<ApiResponse<KnowledgeBaseEntry>>({ success: true, data: entry }, 201)
  } catch (error) {
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

kbRoutes.get('/:botId', requireAuth, async (c) => {
  const botId = c.req.param('botId')
  const entries = await getKBEntries(botId)
  return c.json<ApiResponse<KnowledgeBaseEntry[]>>({ success: true, data: entries }, 200)
})

kbRoutes.patch('/:botId/:entryId', requireAuth, async (c) => {
  const botId = c.req.param('botId')
  const entryId = c.req.param('entryId')
  const body = await c.req.json<UpdateKBEntryBody>()

  if (!body.title || !body.content) {
    return c.json<ApiResponse<null>>({ success: false, error: 'title and content are required' }, 400)
  }

  try {
    const entry = await updateKBEntry(botId, entryId, {
      title: body.title,
      content: body.content,
    })
    return c.json<ApiResponse<KnowledgeBaseEntry>>({ success: true, data: entry }, 200)
  } catch (error) {
    if (error instanceof Error && error.message === 'KB entry not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

kbRoutes.delete('/:botId/:entryId', requireAuth, async (c) => {
  const botId = c.req.param('botId')
  const entryId = c.req.param('entryId')

  try {
    await removeKBEntry(botId, entryId)
    return c.json<ApiResponse<{ message: string }>>(
      { success: true, data: { message: 'Knowledge base entry deleted' } },
      200
    )
  } catch (error) {
    if (error instanceof Error && error.message === 'KB entry not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})
